"""
Agent工厂函数 - 创建Langchain Agent实例
"""
import logging
from typing import Optional, List, Any
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langgraph.checkpoint.memory import InMemorySaver
from app.agent.infra.llm_factory import get_llm
from app.core.approval import HIGH_RISK_TOOLS

logger = logging.getLogger(__name__)

# 全局 checkpointer（单进程内共享，用于 interrupt/resume）
_checkpointer = InMemorySaver()


def get_checkpointer() -> InMemorySaver:
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