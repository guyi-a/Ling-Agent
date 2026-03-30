"""
Agent工厂函数 - 创建Langchain Agent实例
"""
import logging
from typing import Optional, List, Any, Callable
from langchain.agents import create_agent
from app.agent.infra.llm_factory import get_llm

logger = logging.getLogger(__name__)


def create_Ling_Agent(
    tools: List = None,
    system_prompt: str = "You are a helpful AI assistant."
) -> Optional[Any]:
    """
    创建Ling Agent实例

    Args:
        tools: 工具列表
        system_prompt: 系统提示词

    Returns:
        Agent实例，如果创建失败则返回None
    """
    # 获取LLM实例
    llm = get_llm()
    if not llm:
        logger.warning("LLM实例不可用，无法创建Agent")
        return None

    try:
        # 默认空工具列表
        if tools is None:
            tools = []

        # 创建Agent
        agent = create_agent(
            model=llm,
            tools=tools,
            system_prompt=system_prompt
        )

        logger.info("✓ Ling Agent实例已创建")
        return agent

    except Exception as e:
        logger.error(f"创建Ling Agent实例失败: {e}", exc_info=True)
        return None