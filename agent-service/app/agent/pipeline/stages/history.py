"""加载对话历史。"""
from __future__ import annotations

from app.agent.pipeline.context import PipelineContext
from app.crud.message import message_crud

HISTORY_LIMIT = 50


class LoadHistoryStage:
    """读取最近 HISTORY_LIMIT 条历史，填入 ctx.history。"""

    name = "load_history"

    async def apply(self, ctx: PipelineContext) -> None:
        assert ctx.session is not None, "LoadHistoryStage 需要 ctx.session"

        ctx.history = await message_crud.get_conversation_history(
            ctx.db, ctx.session.session_id, limit=HISTORY_LIMIT,
        )
