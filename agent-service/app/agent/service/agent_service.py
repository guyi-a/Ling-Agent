"""
Agent Service - Ling Assistant 核心服务
整合 LLM、工具调用、消息存储
"""
import logging
import re
from typing import List, Dict, Any, Optional
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.infra.agent_factory import create_Ling_Agent
from app.agent.infra.llm_factory import get_llm
from app.agent.tools.registry import get_all_tools, set_session_id
from app.crud.message import message_crud
from app.schemas.message import MessageCreate

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
        真流式输出：逐 token yield，供 SSE 接口使用
        yield 格式：
          {"type": "token", "text": "..."}
          {"type": "tool_start", "tool_name": "..."}
          {"type": "tool_end",   "tool_name": "..."}
          {"type": "done"}
        """
        if not self.agent:
            yield {"type": "token", "text": "抱歉，Agent 服务暂时不可用。"}
            yield {"type": "done"}
            return

        set_session_id(session_id)
        rendered_prompt = self._render_system_prompt(session_id)
        messages = self._build_messages(user_message, history, rendered_prompt)
        inputs = {"messages": messages}

        full_response = ""
        current_round_text = ""  # 当前轮次的文字（工具调用后清空）
        # 从 on_chat_model_stream 收集 tool_call chunks，组装 tool_calls
        # 结构：{index: {"id": ..., "name": ..., "args": ""}}
        tc_chunks: Dict[int, Dict] = {}
        # 已存储的 ai tool call 消息对应的 tool_call_id 列表（顺序），供 on_tool_end 消费
        pending_tool_call_ids: List[str] = []

        try:
            async for event in self.agent.astream_events(inputs, version="v2"):
                kind = event.get("event", "")

                if kind == "on_chat_model_start":
                    # 新一轮模型调用开始，重置当前轮次文字，通知前端清空文字区域
                    current_round_text = ""
                    tc_chunks = {}
                    yield {"type": "model_start"}

                elif kind == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if not chunk:
                        continue
                    # 收集普通文本 token
                    text = getattr(chunk, 'content', '') or ''
                    if text:
                        current_round_text += text
                        full_response += text
                        yield {"type": "token", "text": text}
                    # 收集 tool_call_chunks（增量片段）
                    for tc in getattr(chunk, 'tool_call_chunks', []) or []:
                        idx = tc.get('index', 0)
                        if idx not in tc_chunks:
                            tc_chunks[idx] = {"id": tc.get("id", ""), "name": tc.get("name", ""), "args": ""}
                        else:
                            if tc.get("id"):
                                tc_chunks[idx]["id"] = tc["id"]
                            if tc.get("name"):
                                tc_chunks[idx]["name"] += tc["name"]
                        tc_chunks[idx]["args"] += tc.get("args", "") or ""

                elif kind == "on_chat_model_end":
                    # 组装完整 tool_calls 并存储 AI 消息
                    if tc_chunks:
                        import json as _json
                        tc_list = []
                        for idx in sorted(tc_chunks.keys()):
                            tc = tc_chunks[idx]
                            try:
                                args = _json.loads(tc["args"]) if tc["args"] else {}
                            except Exception:
                                args = {}
                            tc_list.append({"name": tc["name"], "args": args, "id": tc["id"]})
                        await self._save_ai_tool_call_message(
                            db, session_id,
                            current_round_text,
                            tc_list
                        )
                        # 把 id 列表存下来供 on_tool_end 按顺序消费
                        pending_tool_call_ids = [tc["id"] for tc in tc_list]
                        tc_chunks = {}

                elif kind == "on_tool_start":
                    tool_name = event.get("name", "tool")
                    yield {"type": "tool_start", "tool_name": tool_name}

                elif kind == "on_tool_end":
                    tool_name = event.get("name", "tool")
                    output = event.get("data", {}).get("output")
                    result_text = str(output) if output is not None else ""
                    # 消费 pending_tool_call_ids 里的第一个 id
                    tool_call_id = pending_tool_call_ids.pop(0) if pending_tool_call_ids else ""
                    if tool_call_id:
                        await self._save_tool_message(db, session_id, tool_name, result_text, tool_call_id)
                    yield {"type": "tool_end", "tool_name": tool_name}

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
