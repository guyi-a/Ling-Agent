"""持久化用户消息到 DB。"""
from __future__ import annotations

from app.agent.pipeline.context import PipelineContext
from app.crud.message import message_crud
from app.schemas.message import MessageCreate


class PersistUserMessageStage:
    """把本轮用户输入写入 messages 表，结果填入 ctx.user_message。"""

    name = "persist_user_message"

    async def apply(self, ctx: PipelineContext) -> None:
        assert ctx.session is not None, "PersistUserMessageStage 需要 ctx.session"

        extra_data: dict | None = None
        if ctx.attachments:
            extra_data = {"attachments": ctx.attachments}

        ctx.user_message = await message_crud.create(
            ctx.db,
            MessageCreate(
                session_id=ctx.session.session_id,
                role="user",
                content=ctx.message,
                extra_data=extra_data,
            ),
        )
