"""
Agent工厂函数 - 创建Langchain Agent实例
"""
import logging
from typing import Optional, List, Any
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from app.agent.infra.llm_factory import get_llm
from app.core.approval import HIGH_RISK_TOOLS

logger = logging.getLogger(__name__)

# checkpointer 由 init_checkpointer() 异步初始化
_checkpointer = None


async def init_checkpointer(db_path: str = "data/checkpoints.db"):
    """启动时调用，初始化 AsyncSqliteSaver"""
    global _checkpointer
    import os
    import aiosqlite
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = await aiosqlite.connect(db_path)
    _checkpointer = AsyncSqliteSaver(conn)
    await _checkpointer.setup()
    logger.info(f"✅ AsyncSqliteSaver 已初始化: {db_path}")


async def close_checkpointer():
    """关闭时调用"""
    global _checkpointer
    if _checkpointer and hasattr(_checkpointer, 'conn'):
        await _checkpointer.conn.close()
        logger.info("✅ AsyncSqliteSaver 已关闭")
    _checkpointer = None


def get_checkpointer():
    return _checkpointer


def create_Ling_Agent(
    tools: List = None,
) -> Optional[Any]:
    """
    创建Ling Agent实例，集成 HumanInTheLoopMiddleware 做工具审批
    系统提示词由 AgentService._build_messages() 动态注入（带 cache_control）
    """
    llm = get_llm()
    if not llm:
        logger.warning("LLM实例不可用，无法创建Agent")
        return None

    try:
        if tools is None:
            tools = []

        # 构建 interrupt_on 配置：HIGH_RISK_TOOLS 需要审批，其余自动通过
        interrupt_on = {
            tool_name: {"allowed_decisions": ["approve", "reject"]}
            for tool_name in HIGH_RISK_TOOLS
        }

        # system_prompt 不在这里设置，由 _build_messages() 动态注入（带 cache_control）
        agent = create_agent(
            model=llm,
            tools=tools,
            checkpointer=_checkpointer,
            middleware=[
                HumanInTheLoopMiddleware(interrupt_on=interrupt_on)
            ]
        )

        logger.info("✓ Ling Agent实例已创建（含 HumanInTheLoop 审批）")
        return agent

    except Exception as e:
        logger.error(f"创建Ling Agent实例失败: {e}", exc_info=True)
        return None
