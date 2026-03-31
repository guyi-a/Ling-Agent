"""
Agent Service - Ling Assistant 核心服务
整合 LLM、工具调用、消息存储
"""
import logging
import re
import json
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
from app.core.approval import request_approval, make_request_id

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
        self._initialize_agent()
    
    def _initialize_agent(self):
        """初始化 Agent 实例"""
        try:
            # 读取核心提示词
            system_prompt = self._load_system_prompt()
            
            # 创建 Agent
            self.agent = create_Ling_Agent(
                tools=self.tools,
                system_prompt=system_prompt
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
        """动态渲染系统提示词，替换时间和 session_id"""
        template = self._prompt_template
        now = datetime.now(ZoneInfo("Asia/Shanghai"))

        def replace_now(m: re.Match) -> str:
            fmt = m.group(1)
            return now.strftime(fmt)

        # 替换 {{ now().strftime('...') }}
        rendered = re.sub(
            r"\{\{\s*now\(\)\.strftime\(['\"]([^'\"]+)['\"]\)\s*\}\}",
            replace_now,
            template
        )
        # 替换 {session_id}
        rendered = rendered.replace("{session_id}", session_id)
        return rendered

    def _load_system_prompt(self) -> str:
        """加载并立即渲染系统提示词（用于初始化 agent，session_id 留空）"""
        return self._render_system_prompt(session_id="<session_id>")
    
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
        history: List[Dict[str, str]] = None
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

            # 构建消息上下文
            messages = self._build_messages(user_message, history, rendered_prompt)
            
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
        system_prompt: str = None
    ) -> List[Dict[str, str]]:
        """
        构建消息列表
        
        Args:
            user_message: 当前用户消息
            history: 历史消息
            system_prompt: 动态渲染的系统提示词（可选，覆盖 agent 内置提示词）
        
        Returns:
            完整的消息列表
        """
        messages = []
        
        # 在消息列表头部注入动态系统提示词
        if system_prompt:
            messages.append({
                "role": "system",
                "content": system_prompt
            })
        
        # 添加历史消息（如果有）
        if history:
            messages.extend(history)
        
        # 添加当前用户消息
        messages.append({
            "role": "user",
            "content": user_message
        })
        
        return messages
    
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
        history: List[Dict[str, str]] = None
    ):
        """
        真流式输出，支持 HumanInTheLoop interrupt/resume。
        """
        if not self.agent:
            yield {"type": "token", "text": "抱歉，Agent 服务暂时不可用。"}
            yield {"type": "done"}
            return

        set_session_id(session_id)
        rendered_prompt = self._render_system_prompt(session_id)
        messages = self._build_messages(user_message, history, rendered_prompt)

        # thread_id 用于 checkpointer 识别会话，每轮对话用 session_id
        config = {"configurable": {"thread_id": session_id}}

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
                        # 把 pending 里的第一个 id 移到 executed（该工具已开始执行）
                        if pending_tool_call_ids:
                            executed_ids.append(pending_tool_call_ids.pop(0))
                        yield {"type": "tool_start", "tool_name": tool_name}

                    elif kind == "on_tool_end":
                        tool_name = event.get("name", "tool")
                        output = event.get("data", {}).get("output")
                        result_text = str(output) if output is not None else ""
                        tool_call_id = executed_ids.pop(0) if executed_ids else ""
                        if tool_call_id:
                            await self._save_tool_message(db, session_id, tool_name, result_text, tool_call_id)
                        yield {"type": "tool_end", "tool_name": tool_name}

                # 无 tool_call 轮次直接结束
                if not last_round_saved_as_tool_call:
                    break

                # 有 tool_call 且 pending_tool_call_ids 仍非空 → 工具被 interrupt 拦截（on_tool_start 没触发）
                if not pending_tool_call_ids:
                    # 全部工具都执行了（on_tool_start 把 id 移走了），正常结束
                    break

                # interrupt 了：从 pending_tc_list 里取被拦截的工具信息
                intercepted = pending_tc_list[len(pending_tc_list) - len(pending_tool_call_ids)]
                tool_name = intercepted.get("name", "unknown")
                tool_input = intercepted.get("args", {})

                request_id = make_request_id()
                yield {
                    "type": "approval_required",
                    "request_id": request_id,
                    "tool_name": tool_name,
                    "tool_input": tool_input,
                }

                approved = await request_approval(request_id)

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
                    yield {"type": "token", "text": f"好的，已取消 `{tool_name}` 操作。"}
                    break
                else:
                    run_input = Command(resume={"decisions": [{"type": "approve"}]})

            # 保存最终 assistant 消息
            if full_response:
                await self._save_assistant_message(db, session_id, full_response)

        except Exception as e:
            logger.error(f"stream_message error: {e}", exc_info=True)
            yield {"type": "token", "text": f"\n\n[错误: {e}]"}

        yield {"type": "done"}
    
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
    ):
        """
        保存 Assistant 消息到数据库
        
        Args:
            db: 数据库会话
            session_id: 会话ID
            content: 消息内容
        """
        try:
            assistant_message = MessageCreate(
                session_id=session_id,
                role="assistant",
                content=content,
                extra_data={"timestamp": datetime.utcnow().isoformat()}
            )
            
            await message_crud.create(db, assistant_message)
            logger.debug(f"💾 Assistant message 已保存 ({len(content)} 字符)")
            
        except Exception as e:
            logger.error(f"保存 assistant message 失败: {e}", exc_info=True)
    
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
            "tools": [
                {"name": getattr(tool, 'name', 'unknown'), 
                 "description": getattr(tool, 'description', '')}
                for tool in self.tools
            ] if self.tools else []
        }


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
