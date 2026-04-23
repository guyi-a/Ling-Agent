"""
PromptCacheMiddleware — 为子 Agent 的每次 LLM 调用注入 cache_control 标记

DashScope prompt caching 要求 cache_control 放在 content block 内部：
  {"role": "system", "content": [{"type": "text", "text": "...", "cache_control": {...}}]}

策略：
  1. system_message 注入（缓存 system prompt + tools 定义，最稳定收益）
  2. messages 最后一条注入（缓存全部历史，包括 skill ToolMessage 内容）
     只跳过带 tool_calls 的 AIMessage（空 content 注入意义不大，且可能引起解析异常）

DashScope 文档确认 ToolMessage 支持 cache_control；注入在最后一条而非中间位置，
避免 LLM 因历史消息格式混乱而生成非 JSON 的 tool_call arguments。
"""

import logging
from typing import Any, Callable

from langchain_core.messages import SystemMessage, AIMessage
from langchain.agents.middleware.types import (
    AgentMiddleware,
    ModelRequest,
    ModelResponse,
)

logger = logging.getLogger(__name__)


def _inject_into_message(msg: Any) -> Any:
    """将消息 content 转为 block 数组，并在最后一个 block 注入 cache_control。"""
    # 带 tool_calls 的 AIMessage：content 通常为空字符串，注入无意义且可能引起异常
    if isinstance(msg, AIMessage) and getattr(msg, "tool_calls", None):
        return msg

    content = getattr(msg, "content", None)
    if content is None:
        return msg

    if isinstance(content, str):
        blocks = [{"type": "text", "text": content, "cache_control": {"type": "ephemeral"}}]
    elif isinstance(content, list) and content:
        blocks = list(content)
        last = blocks[-1]
        if isinstance(last, dict):
            blocks[-1] = {**last, "cache_control": {"type": "ephemeral"}}
        else:
            return msg
    else:
        return msg

    try:
        return msg.model_copy(update={"content": blocks})
    except Exception:
        try:
            import copy
            m = copy.copy(msg)
            object.__setattr__(m, "content", blocks)
            return m
        except Exception:
            return msg


def _inject_cache_control(request: ModelRequest) -> ModelRequest:
    new_system = request.system_message
    new_messages = list(request.messages)

    # 1. system_message：缓存 system prompt + tools 定义
    if new_system is not None:
        new_system = _inject_into_message(new_system)

    # 2. messages 最后一条：缓存所有历史（含 skill ToolMessage）
    #    如果最后一条不可注入（带 tool_calls 的 AIMessage），向前找第一条可注入的
    for i in range(len(new_messages) - 1, -1, -1):
        injected = _inject_into_message(new_messages[i])
        if injected is not new_messages[i]:
            new_messages[i] = injected
            break

    return request.override(system_message=new_system, messages=new_messages)


class PromptCacheMiddleware(AgentMiddleware):
    """在每次 LLM 调用前将 cache_control 注入 content block（DashScope 显式缓存）。"""

    name: str = "prompt_cache"

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        return handler(_inject_cache_control(request))

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable,
    ) -> ModelResponse:
        return await handler(_inject_cache_control(request))
