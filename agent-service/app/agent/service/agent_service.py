"""
Agent Service - Ling Assistant 核心服务
整合 LLM、工具调用、消息存储
"""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
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
    
    def _load_system_prompt(self) -> str:
        """
        加载系统提示词
        
        Returns:
            系统提示词字符串
        """
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
                    logger.info(f"✓ 系统提示词已加载 ({len(content)} 字符)")
                    return content
            else:
                logger.warning(f"提示词文件不存在: {prompt_path}")
                return self._get_default_prompt()
                
        except Exception as e:
            logger.error(f"加载提示词失败: {e}")
            return self._get_default_prompt()
    
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

            # 构建消息上下文
            messages = self._build_messages(user_message, history)
            
            logger.info(f"🤖 开始处理消息 (session: {session_id[:8]}...)")
            logger.debug(f"消息上下文: {len(messages)} 条消息")
            
            # 调用 Agent（流式处理）
            response_content = ""
            tool_calls = []
            
            async for chunk in self._invoke_agent(messages):
                # 处理不同类型的消息块
                if chunk.get("type") == "ai_message":
                    response_content = chunk.get("content", "")
                elif chunk.get("type") == "tool_call":
                    tool_calls.append(chunk)
                elif chunk.get("type") == "tool_result":
                    # 保存 tool message
                    await self._save_tool_message(
                        db, 
                        session_id, 
                        chunk.get("tool_name"), 
                        chunk.get("result")
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
        history: List[Dict[str, str]] = None
    ) -> List[Dict[str, str]]:
        """
        构建消息列表
        
        Args:
            user_message: 当前用户消息
            history: 历史消息
        
        Returns:
            完整的消息列表
        """
        messages = []
        
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
        """调用 Agent（异步生成器）"""
        inputs = {"messages": messages}
        
        async for chunk in self.agent.astream(inputs, stream_mode="updates"):
            for key, value in chunk.items():
                if not isinstance(value, dict) or 'messages' not in value:
                    continue
                for msg in value['messages']:
                    if hasattr(msg, 'content') and msg.content:
                        msg_type = getattr(msg, 'type', '')
                        if msg_type == 'tool':
                            yield {
                                "type": "tool_result",
                                "tool_name": getattr(msg, 'name', 'unknown'),
                                "result": msg.content
                            }
                        else:
                            yield {
                                "type": "ai_message",
                                "content": msg.content
                            }
                    if hasattr(msg, 'tool_calls') and msg.tool_calls:
                        for tool_call in msg.tool_calls:
                            yield {
                                "type": "tool_call",
                                "tool_name": tool_call.get('name'),
                                "args": tool_call.get('args'),
                                "id": tool_call.get('id')
                            }
    
    async def _save_tool_message(
        self,
        db: AsyncSession,
        session_id: str,
        tool_name: str,
        result: str
    ):
        """
        保存工具消息到数据库
        
        Args:
            db: 数据库会话
            session_id: 会话ID
            tool_name: 工具名称
            result: 工具执行结果
        """
        try:
            tool_message = MessageCreate(
                session_id=session_id,
                role="tool",
                content=result,
                extra_data={"tool_name": tool_name, "timestamp": datetime.utcnow().isoformat()}
            )
            
            await message_crud.create(db, tool_message)
            logger.debug(f"💾 Tool message 已保存: {tool_name}")
            
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
