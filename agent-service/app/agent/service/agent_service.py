"""
Agent Service - Ling Assistant 核心服务
整合 LLM、工具调用、消息存储
"""
import logging
import json
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy.ext.asyncio import AsyncSession
from langgraph.types import Command

from app.agent.infra.agent_factory import create_Ling_Agent, get_checkpointer
from app.agent.infra.llm_factory import get_llm
from app.agent.tools.registry import get_all_tools, set_session_id
from app.crud.message import message_crud
from app.schemas.message import MessageCreate
from app.core.approval import request_approval, make_request_id, HIGH_RISK_TOOLS
from app.core.config import settings

logger = logging.getLogger(__name__)


class AgentService:
    """
    Ling Assistant Agent 服务
    
    负责：
    1. 管理 Agent 实例
    2. 处理用户消息
    3. 调用工具
    4. 保存对话历史（包括 tool messages）
    """
    
    def __init__(self, tools: List = None):
        """
        初始化 Agent Service

        Args:
            tools: 工具列表（Langchain tools）
        """
        # 使用注册表加载所有工具，外部传入的 tools 可追加
        self.tools = get_all_tools()
        if tools:
            self.tools.extend(tools)

        self._prompt_template = self._load_system_prompt_template()
        self.agent = None
        self._active_tasks: Dict[str, asyncio.Task] = {}  # 记录活跃的流式任务 {session_id: task}
        self._langfuse_handler = self._init_langfuse()
        self._initialize_agent()
    
    def _init_langfuse(self):
        """初始化 Langfuse CallbackHandler（如果配置了 key）"""
        if not settings.LANGFUSE_PUBLIC_KEY or not settings.LANGFUSE_SECRET_KEY:
            return None
        try:
            from langfuse import Langfuse
            from langfuse.langchain import CallbackHandler
            # 初始化 Langfuse 单例（v4 要求）
            Langfuse(
                public_key=settings.LANGFUSE_PUBLIC_KEY,
                secret_key=settings.LANGFUSE_SECRET_KEY,
                host=settings.LANGFUSE_HOST,
            )
            handler = CallbackHandler()
            logger.info("✅ Langfuse 可观测性已启用")
            return handler
        except ImportError:
            logger.warning("⚠️ langfuse 未安装，跳过可观测性集成（pip install langfuse）")
            return None
        except Exception as e:
            logger.warning(f"⚠️ Langfuse 初始化失败: {e}")
            return None

    def _initialize_agent(self):
        """初始化 Agent 实例"""
        try:
            # 创建 Agent（系统提示词由 _build_messages() 动态注入，不在 agent 层设置）
            self.agent = create_Ling_Agent(
                tools=self.tools
            )
            
            if self.agent:
                logger.info("✅ AgentService 初始化成功")
            else:
                logger.warning("⚠️ AgentService 初始化失败 - Agent 为 None")
                
        except Exception as e:
            logger.error(f"❌ AgentService 初始化异常: {e}", exc_info=True)
            self.agent = None
    
    def _load_system_prompt_template(self) -> str:
        """加载系统提示词模板（不渲染）"""
        try:
            import os
            prompt_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                "prompts",
                "core_prompt.md"
            )
            
            if os.path.exists(prompt_path):
                with open(prompt_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    logger.info(f"✓ 系统提示词模板已加载 ({len(content)} 字符)")
                    return content
            else:
                logger.warning(f"提示词文件不存在: {prompt_path}")
                return self._get_default_prompt()
                
        except Exception as e:
            logger.error(f"加载提示词失败: {e}")
            return self._get_default_prompt()

    def _render_system_prompt(self, session_id: str) -> str:
        """渲染系统提示词，仅替换 session_id（时间已移至动态上下文注入）"""
        rendered = self._prompt_template.replace("{session_id}", session_id)
        return rendered

    def _get_default_prompt(self) -> str:
        """获取默认提示词"""
        return """You are Ling Assistant, a helpful Android control agent.
        
You can help users:
- Control their Android device
- Open apps
- Check notifications
- Manage files

Always be concise and direct in your responses."""
    
    async def process_message(
        self,
        db: AsyncSession,
        session_id: str,
        user_message: str,
        history: List[Dict[str, str]] = None,
        attachments: List[Dict[str, Any]] = None
    ) -> str:
        """
        处理用户消息，调用 Agent，返回回复
        
        Args:
            db: 数据库会话
            session_id: 会话ID
            user_message: 用户消息
            history: 对话历史 [{"role": "user", "content": "..."}, ...]
        
        Returns:
            Agent 回复内容
        """
        if not self.agent:
            logger.error("Agent 未初始化")
            return "抱歉，Agent 服务暂时不可用。请稍后重试。"
        
        try:
            # 注入 session_id 到文件工具
            set_session_id(session_id)

            # 动态渲染系统提示词（含当前时间和 session_id）
            rendered_prompt = self._render_system_prompt(session_id)

            # 构建消息上下文（支持多模态）
            messages = self._build_messages(
                user_message, history, rendered_prompt,
                session_id=session_id,
                attachments=attachments
            )
            
            logger.info(f"🤖 开始处理消息 (session: {session_id[:8]}...)")
            logger.debug(f"消息上下文: {len(messages)} 条消息")
            
            # 调用 Agent（流式处理）
            response_content = ""
            tool_calls = []
            
            async for chunk in self._invoke_agent(messages):
                chunk_type = chunk.get("type")
                if chunk_type == "ai_message":
                    response_content = chunk.get("content", "")
                elif chunk_type == "ai_tool_call":
                    # AI 发起工具调用：存储含 tool_calls 的 AI 消息
                    tool_calls.extend(chunk.get("tool_calls", []))
                    await self._save_ai_tool_call_message(
                        db, session_id,
                        chunk.get("content", ""),
                        chunk.get("tool_calls", [])
                    )
                elif chunk_type == "tool_result":
                    # 工具返回结果：存储带 tool_call_id 的 tool message
                    await self._save_tool_message(
                        db,
                        session_id,
                        chunk.get("tool_name"),
                        chunk.get("result"),
                        chunk.get("tool_call_id", "")
                    )
            
            logger.info(f"✅ 消息处理完成 (工具调用: {len(tool_calls)} 次)")
            
            # 保存 Assistant 最终回复消息
            if response_content:
                await self._save_assistant_message(db, session_id, response_content)
            
            return response_content or "我已收到您的消息，但暂时无法生成回复。"
            
        except Exception as e:
            logger.error(f"❌ 处理消息时出错: {e}", exc_info=True)
            return f"处理消息时发生错误: {str(e)}"
    
    def _build_messages(
        self,
        user_message: str,
        history: List[Dict[str, str]] = None,
        system_prompt: str = None,
        session_id: str = None,
        attachments: List[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        构建消息列表（支持多模态）

        Args:
            user_message: 当前用户消息
            history: 历史消息
            system_prompt: 动态渲染的系统提示词（可选，覆盖 agent 内置提示词）
            session_id: 会话ID（用于构建图片路径）
            attachments: 当前消息的附件列表

        Returns:
            完整的消息列表（支持多模态格式）
        """
        from pathlib import Path
        from app.core.config import settings

        messages = []

        # 在消息列表头部注入系统提示词（带 cache_control 标记，启用 DashScope prompt caching）
        if system_prompt:
            messages.append({
                "role": "system",
                "content": [
                    {
                        "type": "text",
                        "text": system_prompt,
                        "cache_control": {"type": "ephemeral"}
                    }
                ]
            })

        # 添加历史消息（如果有），转换为多模态格式
        if history:
            for msg in history:
                messages.append(self._convert_to_multimodal_message(msg, session_id))

        # 在历史消息之后、当前用户消息之前注入动态上下文（时间等）
        # 放在缓存前缀之外，不影响缓存命中
        now = datetime.now(ZoneInfo("Asia/Shanghai"))
        dynamic_context = f"[System Context] Current time: {now.strftime('%Y-%m-%d %H:%M')} (Asia/Shanghai)"
        messages.append({"role": "system", "content": dynamic_context})

        # 添加当前用户消息（支持附件）
        current_msg = {"role": "user", "content": user_message}
        if attachments:
            current_msg["extra_data"] = {"attachments": attachments}
            logger.info(f"📎 当前消息包含 {len(attachments)} 个附件")
            for att in attachments:
                logger.debug(f"  - {att.get('type', 'file')}: {att.get('path', 'unknown')}")

        messages.append(self._convert_to_multimodal_message(current_msg, session_id))

        # 给最后一条 user message 注入 cache_control，使整个前缀（system prompt + 工具定义 + 历史消息）可被缓存
        for msg in reversed(messages):
            if msg["role"] == "user":
                content = msg["content"]
                if isinstance(content, str):
                    msg["content"] = [
                        {"type": "text", "text": content, "cache_control": {"type": "ephemeral"}}
                    ]
                elif isinstance(content, list) and content:
                    # 多模态消息（图片+文本），给最后一个 block 加标记
                    last_block = content[-1]
                    if isinstance(last_block, dict):
                        last_block["cache_control"] = {"type": "ephemeral"}
                break

        return messages

    def _convert_to_multimodal_message(
        self,
        msg: Dict[str, Any],
        session_id: str
    ) -> Dict[str, Any]:
        """
        将消息转换为多模态格式（如果包含附件）

        支持两种附件：
        - 图片（image）：直接加载到多模态消息，LLM 可以"看到"
        - 文件（file）：在文本中添加引用提示，让 Agent 知道可以读取

        Args:
            msg: 原始消息 {"role": "user", "content": "...", "extra_data": {...}}
            session_id: 会话ID

        Returns:
            多模态消息格式
        """
        from pathlib import Path
        from app.core.config import settings

        # 复制原始消息的所有字段（保留 tool_call_id, tool_calls, name 等）
        result = {k: v for k, v in msg.items() if k not in ["extra_data"]}

        # 提取附件信息
        extra_data = msg.get("extra_data", {})
        if isinstance(extra_data, str):
            import json
            try:
                extra_data = json.loads(extra_data)
            except:
                extra_data = {}

        attachments = extra_data.get("attachments", [])

        # 如果没有附件，直接返回原始消息（保留所有字段）
        if not attachments:
            return result

        # 构建基础文本内容
        text_content = msg.get("content", "")

        # 收集图片附件（用于多模态）
        image_parts = []
        file_references = []

        workspace_root = Path(settings.WORKSPACE_ROOT).resolve()

        for att in attachments:
            att_type = att.get("type", "file")
            att_path = att.get("path", "")
            full_path = workspace_root / session_id / att_path

            if att_type == "image":
                # 图片：转换为 base64 并加载到多模态消息
                if full_path.exists():
                    try:
                        import base64
                        import mimetypes

                        # 读取图片并转为 base64
                        image_data = full_path.read_bytes()
                        base64_image = base64.b64encode(image_data).decode('utf-8')

                        # 获取 MIME 类型
                        mime_type, _ = mimetypes.guess_type(str(full_path))
                        if not mime_type or not mime_type.startswith('image/'):
                            mime_type = 'image/png'  # 默认

                        # 构建 data URL
                        data_url = f"data:{mime_type};base64,{base64_image}"

                        image_parts.append({
                            "type": "image_url",
                            "image_url": {"url": data_url}
                        })
                        logger.info(f"📸 加载图片到多模态消息 (base64): {att_path}")
                    except Exception as e:
                        logger.error(f"❌ 加载图片失败 {att_path}: {e}")
                        text_content += f"\n\n[Error: Failed to load image: {att_path}]"
                else:
                    logger.warning(f"⚠️  图片不存在: {full_path}")
                    text_content += f"\n\n[Warning: Referenced image not found: {att_path}]"

            elif att_type == "file":
                # 普通文件：添加引用提示
                if full_path.exists():
                    file_size = full_path.stat().st_size
                    file_size_str = self._format_file_size(file_size)
                    file_references.append(
                        f"📎 {att_path} ({file_size_str})"
                    )
                    logger.info(f"📎 引用文件: {att_path}")
                else:
                    logger.warning(f"⚠️  文件不存在: {full_path}")
                    file_references.append(f"⚠️  {att_path} (not found)")

        # 如果有文件引用，添加到文本末尾
        if file_references:
            text_content += "\n\n**Referenced files in workspace:**\n"
            text_content += "\n".join(file_references)
            text_content += "\n\nYou can use `read_file` tool to read their contents if needed."

        # 更新 content 字段
        if image_parts:
            # 有图片：使用多模态格式
            content_parts = [{"type": "text", "text": text_content}]
            content_parts.extend(image_parts)
            result["content"] = content_parts
        else:
            # 仅文件引用：返回纯文本
            result["content"] = text_content

        return result

    def _format_file_size(self, size_bytes: int) -> str:
        """格式化文件大小"""
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KB"
        else:
            return f"{size_bytes / (1024 * 1024):.1f} MB"
    
    async def _invoke_agent(self, messages: List[Dict[str, str]]):
        """调用 Agent（异步生成器，update 模式）"""
        inputs = {"messages": messages}
        
        async for chunk in self.agent.astream(inputs, stream_mode="updates"):
            for key, value in chunk.items():
                if not isinstance(value, dict) or 'messages' not in value:
                    continue
                for msg in value['messages']:
                    msg_type = getattr(msg, 'type', '')
                    if msg_type == 'tool':
                        yield {
                            "type": "tool_result",
                            "tool_name": getattr(msg, 'name', 'unknown'),
                            "tool_call_id": getattr(msg, 'tool_call_id', ''),
                            "result": msg.content if hasattr(msg, 'content') else ''
                        }
                    else:
                        tool_calls = getattr(msg, 'tool_calls', None) or []
                        if tool_calls:
                            yield {
                                "type": "ai_tool_call",
                                "content": msg.content if hasattr(msg, 'content') else '',
                                "tool_calls": [
                                    {"name": tc.get('name'), "args": tc.get('args'), "id": tc.get('id')}
                                    for tc in tool_calls
                                ]
                            }
                        elif hasattr(msg, 'content') and msg.content:
                            yield {"type": "ai_message", "content": msg.content}

    async def stream_message(
        self,
        db: AsyncSession,
        session_id: str,
        user_message: str,
        history: List[Dict[str, str]] = None,
        attachments: List[Dict[str, Any]] = None
    ):
        """
        真流式输出，支持 HumanInTheLoop interrupt/resume。
        支持通过 cancel_session() 中途取消。
        """
        if not self.agent:
            yield {"type": "token", "text": "抱歉，Agent 服务暂时不可用。"}
            yield {"type": "done"}
            return

        # 注册当前任务
        current_task = asyncio.current_task()
        self._active_tasks[session_id] = current_task
        logger.info(f"🚀 会话 {session_id[:8]}... 开始执行")

        set_session_id(session_id)

        # 清空上一轮的 checkpoint 状态，避免消息累积导致缓存前缀不一致
        # checkpoint 仅用于同一轮内的 interrupt/resume，跨轮不需要保留
        try:
            await get_checkpointer().adelete_thread(session_id)
        except Exception:
            pass

        rendered_prompt = self._render_system_prompt(session_id)
        messages = self._build_messages(
            user_message, history, rendered_prompt,
            session_id=session_id,
            attachments=attachments
        )

        # thread_id 用于 checkpointer 识别会话，每轮对话用 session_id
        # recursion_limit: 提高递归限制，支持复杂多步骤操作（如 browser-use）
        config = {
            "configurable": {"thread_id": session_id},
            "recursion_limit": 50
        }

        # Langfuse 可观测性：注入 callback
        if self._langfuse_handler:
            config["callbacks"] = [self._langfuse_handler]
            config["metadata"] = {
                "langfuse_session_id": session_id,
            }

        full_response = ""
        current_round_text = ""
        tc_chunks: Dict[int, Dict] = {}
        pending_tool_call_ids: List[str] = []  # 本轮待执行的 tool_call id 列表
        pending_tc_list: List[Dict] = []       # 本轮 tool_calls 完整信息（含 name/args）
        executed_ids: List[str] = []           # 已收到 on_tool_start 的 id
        last_round_saved_as_tool_call = False

        # 当前运行的输入（首次是消息列表，resume 时是 Command）
        run_input = {"messages": messages}

        try:
            while True:
                async for event in self.agent.astream_events(run_input, config=config, version="v2"):
                    if not isinstance(event, dict):
                        continue
                    kind = event.get("event", "")

                    if kind == "on_chat_model_start":
                        current_round_text = ""
                        tc_chunks = {}
                        yield {"type": "model_start"}

                    elif kind == "on_chat_model_stream":
                        chunk = event.get("data", {}).get("chunk")
                        if not chunk:
                            continue
                        # chunk 可能是对象也可能是 dict，兼容两种情况
                        if isinstance(chunk, dict):
                            text = chunk.get("content", "") or ""
                            tcc_list = chunk.get("tool_call_chunks", []) or []
                        else:
                            text = getattr(chunk, "content", "") or ""
                            tcc_list = getattr(chunk, "tool_call_chunks", []) or []
                        if text:
                            current_round_text += text
                            full_response += text
                            yield {"type": "token", "text": text}
                        for tc in tcc_list:
                            if isinstance(tc, dict):
                                tc_id = tc.get("id", "")
                                tc_name = tc.get("name", "")
                                tc_args = tc.get("args", "") or ""
                                tc_idx = tc.get("index", 0)
                            else:
                                tc_id = getattr(tc, "id", "")
                                tc_name = getattr(tc, "name", "")
                                tc_args = getattr(tc, "args", "") or ""
                                tc_idx = getattr(tc, "index", 0)
                            idx = tc_idx
                            if idx not in tc_chunks:
                                tc_chunks[idx] = {"id": tc_id, "name": tc_name, "args": tc_args}
                            else:
                                if tc_id: tc_chunks[idx]["id"] = tc_id
                                if tc_name: tc_chunks[idx]["name"] += tc_name
                                tc_chunks[idx]["args"] += tc_args

                    elif kind == "on_chat_model_end":
                        # 记录 token 用量和缓存命中情况
                        end_output = event.get("data", {}).get("output")
                        if end_output:
                            usage = getattr(end_output, "usage_metadata", None)
                            if usage:
                                # 兼容 dict 和 UsageMetadata 对象两种形式
                                if isinstance(usage, dict):
                                    input_tokens = usage.get("input_tokens", 0)
                                    output_tokens = usage.get("output_tokens", 0)
                                    details = usage.get("input_token_details", {}) or {}
                                else:
                                    input_tokens = getattr(usage, "input_tokens", 0)
                                    output_tokens = getattr(usage, "output_tokens", 0)
                                    details = getattr(usage, "input_token_details", None)
                                    if details and not isinstance(details, dict):
                                        details = {k: v for k, v in details.__dict__.items() if v is not None} if hasattr(details, "__dict__") else {}
                                    details = details or {}
                                cache_read = details.get("cache_read", 0) or 0
                                logger.info(
                                    f"📊 Token 用量 | input: {input_tokens}, output: {output_tokens}, "
                                    f"cache_hit: {cache_read}"
                                )

                        if tc_chunks:
                            tc_list = []
                            for idx in sorted(tc_chunks.keys()):
                                tc = tc_chunks[idx]
                                try:
                                    args = json.loads(tc["args"]) if tc["args"] else {}
                                except Exception:
                                    args = {}
                                tc_list.append({"name": tc["name"], "args": args, "id": tc["id"]})
                            await self._save_ai_tool_call_message(db, session_id, current_round_text, tc_list)
                            yield {"type": "_save_point"}
                            pending_tool_call_ids = [tc["id"] for tc in tc_list]
                            pending_tc_list = tc_list
                            executed_ids = []
                            tc_chunks = {}
                            full_response = full_response[:-len(current_round_text)] if current_round_text else full_response
                            last_round_saved_as_tool_call = True
                        else:
                            last_round_saved_as_tool_call = False

                    elif kind == "on_tool_start":
                        tool_name = event.get("name", "tool")
                        tool_input = event.get("data", {}).get("input", {})
                        # 把 pending 里的第一个 id 移到 executed（该工具已开始执行）
                        if pending_tool_call_ids:
                            executed_ids.append(pending_tool_call_ids.pop(0))
                        yield {"type": "tool_start", "tool_name": tool_name, "tool_input": tool_input}

                    elif kind == "on_tool_end":
                        tool_name = event.get("name", "tool")
                        output = event.get("data", {}).get("output")
                        result_text = str(output) if output is not None else ""
                        tool_call_id = executed_ids.pop(0) if executed_ids else ""
                        if tool_call_id:
                            await self._save_tool_message(db, session_id, tool_name, result_text, tool_call_id)
                        yield {"type": "tool_end", "tool_name": tool_name, "tool_output": result_text}

                # 无 tool_call 轮次直接结束
                if not last_round_saved_as_tool_call:
                    break

                # 有 tool_call 且 pending_tool_call_ids 仍非空 → 工具被 interrupt 拦截（on_tool_start 没触发）
                if not pending_tool_call_ids:
                    # 全部工具都执行了（on_tool_start 把 id 移走了），正常结束
                    break

                # interrupt 了：只有 HIGH_RISK_TOOLS 才真正需要审批 decision
                # 其余工具（list_dir, read_file 等）会在 resume 时自动执行
                pending_ids_set = set(pending_tool_call_ids)
                hanging_tools = [
                    tc for tc in pending_tc_list
                    if tc["id"] in pending_ids_set and tc["name"] in HIGH_RISK_TOOLS
                ]
                num_pending = len(hanging_tools) if hanging_tools else len(pending_tool_call_ids)
                intercepted = hanging_tools[0] if hanging_tools else pending_tc_list[-1]
                tool_name = intercepted.get("name", "unknown")
                tool_input = intercepted.get("args", {})

                request_id = make_request_id()
                yield {
                    "type": "approval_required",
                    "request_id": request_id,
                    "tool_name": tool_name,
                    "tool_input": tool_input,
                    "pending_count": num_pending,
                }

                # 持久化审批状态到 DB（刷新后可恢复审批卡片）
                try:
                    await message_crud.update_extra_data(db, session_id, {
                        "pending_approval": {
                            "request_id": request_id,
                            "tool_name": tool_name,
                            "tool_input": tool_input,
                        }
                    })
                except Exception as e:
                    logger.warning(f"持久化审批状态失败: {e}")

                approved = await request_approval(request_id)

                # 清除 pending，记录审批结果
                try:
                    await message_crud.update_extra_data(db, session_id, {
                        "pending_approval": None,
                        "approval_result": "approved" if approved else "rejected",
                    })
                except Exception as e:
                    logger.warning(f"清除审批状态失败: {e}")

                if not approved:
                    yield {"type": "approval_rejected", "tool_name": tool_name}
                    # 手动存一条 tool 消息到 DB，让下次 history 完整（孤儿 assistant 消息有对应 tool）
                    rejected_tool_call_id = pending_tool_call_ids[0] if pending_tool_call_ids else ""
                    if rejected_tool_call_id:
                        await self._save_tool_message(
                            db, session_id, tool_name,
                            "用户拒绝执行此操作，操作已取消。",
                            rejected_tool_call_id
                        )
                    # 删除 checkpointer 里该 thread 的状态，彻底防止下次 session 重新 resume 旧中断
                    await get_checkpointer().adelete_thread(session_id)
                    # 不 resume，直接输出取消提示并结束
                    yield {"type": "token", "text": f"好的，已取消操作。"}
                    break
                else:
                    # 对所有被拦截的工具都发 approve decision
                    decisions = [{"type": "approve"} for _ in range(num_pending)]
                    run_input = Command(resume={"decisions": decisions})

            # 保存最终 assistant 消息
            assistant_message_id = None
            if full_response:
                assistant_message_id = await self._save_assistant_message(db, session_id, full_response)

        except asyncio.CancelledError:
            logger.info(f"⛔ 会话 {session_id[:8]}... 被用户停止")

            # 保存中断消息到数据库（保持历史记录完整）
            # 注意：db session 可能因取消操作而失效，需要捕获异常
            interrupt_msg = "⚠️ 用户已停止生成"
            assistant_message_id = None
            try:
                if full_response:
                    # 如果有已生成的内容，保存部分内容 + 中断标记
                    assistant_message_id = await self._save_assistant_message(
                        db, session_id,
                        f"{full_response}\n\n{interrupt_msg}"
                    )
                else:
                    # 没有内容，仅保存中断消息
                    assistant_message_id = await self._save_assistant_message(db, session_id, interrupt_msg)
            except Exception as e:
                logger.warning(f"保存中断消息失败（数据库连接已关闭）: {e}")
                # 忽略保存失败，继续清理流程

            yield {"type": "cancelled", "text": "生成已被停止"}

            # 清理 checkpointer 状态
            try:
                await get_checkpointer().adelete_thread(session_id)
            except Exception as e:
                logger.error(f"清理 checkpointer 失败: {e}")
            raise  # 重新抛出以正确终止任务

        except Exception as e:
            logger.error(f"stream_message error: {e}", exc_info=True)
            error_msg = f"\n\n⚠️ 发生错误: {e}"
            yield {"type": "token", "text": error_msg}

            # 保存已生成内容 + 错误信息到数据库
            assistant_message_id = None
            try:
                save_content = f"{full_response}{error_msg}" if full_response else error_msg.strip()
                assistant_message_id = await self._save_assistant_message(db, session_id, save_content)
            except Exception as save_err:
                logger.warning(f"保存错误消息失败: {save_err}")

        finally:
            # 清理活跃任务记录
            self._active_tasks.pop(session_id, None)
            logger.info(f"✅ 会话 {session_id[:8]}... 执行结束")

        # 在 done 事件中包含 assistant_message_id
        yield {"type": "done", "assistant_message_id": assistant_message_id}
    
    async def _save_ai_tool_call_message(
        self,
        db: AsyncSession,
        session_id: str,
        content: str,
        tool_calls: List[Dict]
    ):
        """保存带 tool_calls 的 AI 消息（工具调用发起消息）"""
        try:
            await message_crud.create(db, MessageCreate(
                session_id=session_id,
                role="assistant",
                content=content or "",
                extra_data={"tool_calls": tool_calls}
            ))
        except Exception as e:
            logger.error(f"保存 AI tool_call 消息失败: {e}", exc_info=True)

    async def _save_tool_message(
        self,
        db: AsyncSession,
        session_id: str,
        tool_name: str,
        result: str,
        tool_call_id: str = ""
    ):
        """保存工具执行结果消息（含 tool_call_id）"""
        try:
            await message_crud.create(db, MessageCreate(
                session_id=session_id,
                role="tool",
                content=result,
                extra_data={
                    "tool_name": tool_name,
                    "tool_call_id": tool_call_id,
                    "timestamp": datetime.utcnow().isoformat()
                }
            ))
            logger.debug(f"💾 Tool message 已保存: {tool_name} (id={tool_call_id})")
        except Exception as e:
            logger.error(f"保存 tool message 失败: {e}", exc_info=True)
    
    async def _save_assistant_message(
        self,
        db: AsyncSession,
        session_id: str,
        content: str
    ) -> Optional[str]:
        """
        保存 Assistant 消息到数据库

        Args:
            db: 数据库会话
            session_id: 会话ID
            content: 消息内容

        Returns:
            保存的消息ID（message_id），失败时返回 None
        """
        try:
            assistant_message = MessageCreate(
                session_id=session_id,
                role="assistant",
                content=content,
                extra_data={"timestamp": datetime.utcnow().isoformat()}
            )

            saved_message = await message_crud.create(db, assistant_message)
            logger.debug(f"💾 Assistant message 已保存 ({len(content)} 字符)")
            return saved_message.message_id

        except Exception as e:
            logger.error(f"保存 assistant message 失败: {e}", exc_info=True)
            return None
    
    def is_ready(self) -> bool:
        """
        检查 Agent 是否就绪
        
        Returns:
            True 如果 Agent 可用，否则 False
        """
        return self.agent is not None
    
    def get_status(self) -> Dict[str, Any]:
        """
        获取服务状态

        Returns:
            状态信息字典
        """
        llm = get_llm()

        return {
            "agent_ready": self.is_ready(),
            "llm_available": llm is not None,
            "tools_count": len(self.tools),
            "active_sessions": len(self._active_tasks),
            "tools": [
                {"name": getattr(tool, 'name', 'unknown'),
                 "description": getattr(tool, 'description', '')}
                for tool in self.tools
            ] if self.tools else []
        }

    def cancel_session(self, session_id: str) -> bool:
        """
        取消指定会话的 Agent 执行

        Args:
            session_id: 要取消的会话ID

        Returns:
            True 如果成功取消，False 如果会话不存在或未在执行
        """
        task = self._active_tasks.get(session_id)
        if task and not task.done():
            task.cancel()
            logger.info(f"🛑 取消会话 {session_id[:8]}... 的执行")
            return True
        return False

    def get_active_sessions(self) -> List[str]:
        """
        获取当前所有活跃会话ID

        Returns:
            活跃会话ID列表
        """
        return [sid for sid, task in self._active_tasks.items() if not task.done()]


# 创建全局单例实例（暂时不加载工具）
_agent_service_instance: Optional[AgentService] = None


def get_agent_service(tools: List = None) -> AgentService:
    """
    获取 Agent Service 单例
    
    Args:
        tools: 工具列表（仅首次调用时生效）
    
    Returns:
        AgentService 实例
    """
    global _agent_service_instance
    
    if _agent_service_instance is None:
        _agent_service_instance = AgentService(tools=tools)
    
    return _agent_service_instance
