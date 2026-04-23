"""
Agent 工厂函数 - 创建 Agent 实例

支持两种模式（通过环境变量 AGENT_MODE 切换）：
  - "supervisor"（默认）：Supervisor + Sub-agent 多智能体架构
  - "single"：原始单 Agent 模式（兜底回退）
"""
import logging
import os
from pathlib import Path
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
    import aiosqlite
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = await aiosqlite.connect(db_path)
    _checkpointer = AsyncSqliteSaver(conn)
    await _checkpointer.setup()
    logger.info(f"AsyncSqliteSaver initialized: {db_path}")


async def close_checkpointer():
    """关闭时调用"""
    global _checkpointer
    if _checkpointer and hasattr(_checkpointer, 'conn'):
        await _checkpointer.conn.close()
        logger.info("AsyncSqliteSaver closed")
    _checkpointer = None


def get_checkpointer():
    return _checkpointer


def _create_single_agent(tools: List = None) -> Optional[Any]:
    """原始单 Agent 模式（回退用）"""
    llm = get_llm()
    if not llm:
        logger.warning("LLM not available")
        return None

    try:
        if tools is None:
            tools = []

        interrupt_on = {
            tool_name: {"allowed_decisions": ["approve", "reject"]}
            for tool_name in HIGH_RISK_TOOLS
        }

        agent = create_agent(
            model=llm,
            tools=tools,
            checkpointer=_checkpointer,
            middleware=[
                HumanInTheLoopMiddleware(interrupt_on=interrupt_on)
            ]
        )

        logger.info("Single Agent created (with HumanInTheLoop)")
        return agent

    except Exception as e:
        logger.error(f"Failed to create single agent: {e}", exc_info=True)
        return None


def _create_supervisor_agent() -> Optional[Any]:
    """Supervisor + Sub-agent 多智能体模式"""
    from app.core.config import settings

    router_llm = get_llm(settings.LLM_MODEL_ROUTER)
    if not router_llm:
        logger.warning("Router LLM not available")
        return None

    try:
        from langgraph_supervisor import create_supervisor
        from app.agent.agents.registry import create_sub_agents

        sub_agents = create_sub_agents()

        prompts_dir = Path(__file__).resolve().parent.parent / "prompts"
        supervisor_prompt = (prompts_dir / "supervisor_prompt.md").read_text(encoding="utf-8")

        workflow = create_supervisor(
            agents=sub_agents,
            model=router_llm,
            prompt=supervisor_prompt,
            output_mode="last_message",
            add_handoff_back_messages=False,
            supervisor_name="supervisor",
        )

        agent = workflow.compile(checkpointer=_checkpointer)
        logger.info("Supervisor Agent created (%d sub-agents, router=%s)", len(sub_agents), settings.LLM_MODEL_ROUTER)
        return agent

    except Exception as e:
        logger.error(f"Failed to create supervisor agent: {e}", exc_info=True)
        return None


def create_Ling_Agent(tools: List = None) -> Optional[Any]:
    """
    创建 Ling Agent 实例。

    根据 AGENT_MODE 环境变量选择模式：
      - "supervisor"（默认）：多智能体架构
      - "single"：单 Agent 模式
    """
    mode = os.environ.get("AGENT_MODE", "supervisor").lower()

    if mode == "single":
        logger.info("AGENT_MODE=single, using single agent")
        return _create_single_agent(tools)
    else:
        logger.info("AGENT_MODE=supervisor, using supervisor + sub-agents")
        agent = _create_supervisor_agent()
        if agent is None:
            logger.warning("Supervisor creation failed, falling back to single agent")
            return _create_single_agent(tools)
        return agent
