"""启动 agent 后台任务，组装 SSE buffer。流式 pipeline 的终点。"""
from __future__ import annotations

import asyncio
import json
import logging

from app.agent.pipeline.context import PipelineContext
from app.agent.service.agent_service import get_agent_service
from app.agent.service.event_buffer import stream_buffers
from app.core.trace_context import current_session_id, current_user_id
from app.database.session import AsyncSessionLocal

logger = logging.getLogger(__name__)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _map_chunk_to_sse(chunk: dict) -> str:
    """将 agent_service.stream_message() 的 chunk 编码为 SSE 字符串。"""
    chunk_type = chunk.get("type")
    if chunk_type == "token":
        return _sse("token", {"text": chunk["text"]})
    if chunk_type == "model_start":
        return _sse("model_start", {})
    if chunk_type == "tool_start":
        return _sse("tool_start", {
            "tool_name": chunk["tool_name"],
            "tool_input": chunk.get("tool_input", {}),
        })
    if chunk_type == "tool_end":
        return _sse("tool_end", {
            "tool_name": chunk["tool_name"],
            "tool_output": chunk.get("tool_output", ""),
        })
    if chunk_type == "tool_generating":
        return _sse("tool_generating", {"tool_name": chunk["tool_name"]})
    if chunk_type == "approval_required":
        return _sse("approval_required", {
            "request_id": chunk["request_id"],
            "tool_name": chunk["tool_name"],
            "tool_input": chunk.get("tool_input", {}),
        })
    if chunk_type == "handoff":
        return _sse("handoff", {
            "to": chunk["to"],
            "direction": chunk.get("direction", "to"),
        })
    if chunk_type == "approval_rejected":
        return _sse("approval_rejected", {"tool_name": chunk["tool_name"]})
    if chunk_type == "cancelled":
        return _sse("cancelled", {"text": chunk.get("text", "")})
    if chunk_type == "compacting":
        return _sse("compacting", {})
    if chunk_type == "compacting_done":
        return _sse("compacting_done", {})
    if chunk_type == "done":
        return _sse("done", {"assistant_message_id": chunk.get("assistant_message_id")})
    return _sse(chunk_type or "unknown", chunk)


class StartAgentStage:
    """拉起 StreamBuffer + 后台 agent task。写入 ctx.buffer 后路由即可返回。

    快路径：目标 session 已有活跃流，直接复用现有 buffer（不再启动新 task）。
    """

    name = "start_agent"

    async def apply(self, ctx: PipelineContext) -> None:
        assert ctx.session is not None, "StartAgentStage 需要 ctx.session"
        assert ctx.user_message is not None, "StartAgentStage 需要 ctx.user_message"

        session_id = ctx.session.session_id

        # 快路径：同一 session 已有活跃流，直接复用
        if stream_buffers.is_streaming(session_id):
            ctx.buffer = stream_buffers.get(session_id)
            ctx.early_response_reason = "already_streaming"
            return

        agent_service = get_agent_service()
        buffer = stream_buffers.create(session_id)
        ctx.buffer = buffer

        # 推送 session 元信息作为第一个 chunk
        buffer.append(_sse("session", {
            "session_id": session_id,
            "user_message_id": ctx.user_message.message_id,
            "is_new_session": ctx.is_new_session,
        }))

        if not agent_service.is_ready():
            buffer.append(_sse("token", {"text": "抱歉，AI 助手暂时不可用，请稍后重试。"}))
            buffer.append(_sse("done", {}))
            buffer.finish()
            return

        user_id = ctx.user.user_id
        user_message = ctx.message
        history = ctx.history
        attachments = ctx.attachments

        async def run_agent() -> None:
            # 后台 task 脱离 HTTP 请求栈，middleware 已 reset 掉 ContextVar。
            # 显式重设，让 tool / log 继续能读到正确的 session/user。
            current_session_id.set(session_id)
            current_user_id.set(user_id)

            async with AsyncSessionLocal() as agent_db:
                try:
                    async for chunk in agent_service.stream_message(
                        db=agent_db,
                        session_id=session_id,
                        user_message=user_message,
                        history=history,
                        attachments=attachments,
                        user_id=user_id,
                    ):
                        if chunk.get("type") == "_save_point":
                            buffer.mark_save_point()
                            continue
                        if chunk.get("type") == "token":
                            buffer.append_gap_text(chunk["text"])
                        buffer.append(_map_chunk_to_sse(chunk))
                except asyncio.CancelledError:
                    try:
                        buffer.append(_sse("cancelled", {"text": "生成已被停止"}))
                    except Exception:
                        pass
                except Exception as exc:
                    logger.error(f"Background agent error: {exc}", exc_info=True)
                    buffer.append(_sse("error", {"message": str(exc)}))
                finally:
                    buffer.finish()
                    stream_buffers.remove(session_id)

        task = asyncio.create_task(run_agent())
        buffer.set_task(task)
