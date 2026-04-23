"""
子 Agent 注册表 —— 创建所有子 Agent 并返回列表

每个子 Agent 通过 langchain.agents.create_agent 创建，
拥有独立的 name、system_prompt、tools，以及 HumanInTheLoop 审批。
"""
import logging
from pathlib import Path
from typing import List

from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langgraph.pregel import Pregel

from app.agent.infra.agent_factory import get_checkpointer
from app.agent.infra.llm_factory import get_llm
from app.agent.tools.registry import (
    get_general_tools, get_developer_tools,
    get_psych_tools, get_data_tools, get_document_tools,
)
from app.core.approval import HIGH_RISK_TOOLS
from app.core.config import settings
from app.agent.infra.cache_middleware import PromptCacheMiddleware

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _load_prompt(filename: str) -> str:
    path = _PROMPTS_DIR / filename
    return path.read_text(encoding="utf-8")


def _build_interrupt_on() -> dict:
    return {
        tool_name: {"allowed_decisions": ["approve", "reject"]}
        for tool_name in HIGH_RISK_TOOLS
    }


def create_sub_agents() -> List[Pregel]:
    """创建所有子 Agent，返回列表供 create_supervisor 使用。"""
    agents = []
    interrupt_on = _build_interrupt_on()
    checkpointer = get_checkpointer()
    cache_mw = PromptCacheMiddleware()

    # 通用助手
    general_llm = get_llm(settings.LLM_MODEL_GENERAL)
    general_tools = get_general_tools()
    general = create_agent(
        model=general_llm,
        tools=general_tools,
        name="general",
        system_prompt=_load_prompt("general_prompt.md"),
        checkpointer=checkpointer,
        middleware=[HumanInTheLoopMiddleware(interrupt_on=interrupt_on), cache_mw],
    )
    agents.append(general)
    logger.info("Sub-agent 'general' created (%d tools, model=%s)", len(general_tools), settings.LLM_MODEL_GENERAL)

    # 开发者
    developer_llm = get_llm(settings.LLM_MODEL_DEVELOPER)
    developer_tools = get_developer_tools()
    developer = create_agent(
        model=developer_llm,
        tools=developer_tools,
        name="developer",
        system_prompt=_load_prompt("developer_prompt.md"),
        checkpointer=checkpointer,
        middleware=[HumanInTheLoopMiddleware(interrupt_on=interrupt_on), cache_mw],
    )
    agents.append(developer)
    logger.info("Sub-agent 'developer' created (%d tools, model=%s)", len(developer_tools), settings.LLM_MODEL_DEVELOPER)

    # 心理健康
    psych_llm = get_llm(settings.LLM_MODEL_PSYCH)
    psych_tools = get_psych_tools()
    psych = create_agent(
        model=psych_llm,
        tools=psych_tools,
        name="psych",
        system_prompt=_load_prompt("psych_prompt.md"),
        checkpointer=checkpointer,
        middleware=[HumanInTheLoopMiddleware(interrupt_on=interrupt_on), cache_mw],
    )
    agents.append(psych)
    logger.info("Sub-agent 'psych' created (%d tools, model=%s)", len(psych_tools), settings.LLM_MODEL_PSYCH)

    # 数据分析
    data_llm = get_llm(settings.LLM_MODEL_DATA)
    data_tools = get_data_tools()
    data = create_agent(
        model=data_llm,
        tools=data_tools,
        name="data",
        system_prompt=_load_prompt("data_prompt.md"),
        checkpointer=checkpointer,
        middleware=[HumanInTheLoopMiddleware(interrupt_on=interrupt_on), cache_mw],
    )
    agents.append(data)
    logger.info("Sub-agent 'data' created (%d tools, model=%s)", len(data_tools), settings.LLM_MODEL_DATA)

    # 文档处理
    document_llm = get_llm(settings.LLM_MODEL_DOCUMENT)
    document_tools = get_document_tools()
    document = create_agent(
        model=document_llm,
        tools=document_tools,
        name="document",
        system_prompt=_load_prompt("document_prompt.md"),
        checkpointer=checkpointer,
        middleware=[HumanInTheLoopMiddleware(interrupt_on=interrupt_on), cache_mw],
    )
    agents.append(document)
    logger.info("Sub-agent 'document' created (%d tools, model=%s)", len(document_tools), settings.LLM_MODEL_DOCUMENT)

    return agents
