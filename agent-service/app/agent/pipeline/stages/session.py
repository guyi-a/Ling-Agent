"""解析或创建会话。"""
from __future__ import annotations

from fastapi import HTTPException, status

from app.agent.pipeline.context import PipelineContext
from app.core.trace_context import current_session_id, current_user_id
from app.crud.session import session_crud
from app.crud.user import user_crud
from app.schemas.session import SessionCreate, SessionUpdate


def _truncate_title(message: str) -> str:
    return message[:30] + "..." if len(message) > 30 else message


class ResolveSessionStage:
    """解析或新建会话，写入 ctx.session + ctx.is_new_session。

    副作用：把 session_id/user_id 设到 ContextVar，日志和工具自动可见。
    不在这里 reset —— middleware 在请求出栈时统一清理。

    - 请求带 session_id：取现有会话，校验所有权，空标题时补标题；
    - 请求不带 session_id：用消息前 30 字作为标题新建会话。
    """

    name = "resolve_session"

    async def apply(self, ctx: PipelineContext) -> None:
        await user_crud.update_last_active(ctx.db, ctx.user.user_id)
        current_user_id.set(ctx.user.user_id)

        if ctx.requested_session_id:
            session = await session_crud.get_by_id(ctx.db, ctx.requested_session_id)
            if not session:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "会话不存在")
            if session.user_id != ctx.user.user_id:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "无权访问此会话")

            if not session.title:
                title = _truncate_title(ctx.message)
                await session_crud.update(ctx.db, session.session_id, SessionUpdate(title=title))
                session.title = title

            ctx.session = session
            current_session_id.set(session.session_id)
            return

        title = _truncate_title(ctx.message)
        ctx.session = await session_crud.create(
            ctx.db, SessionCreate(title=title), ctx.user.user_id,
        )
        ctx.is_new_session = True
        current_session_id.set(ctx.session.session_id)
