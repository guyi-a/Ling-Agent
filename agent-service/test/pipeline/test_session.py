"""ResolveSessionStage 单测 —— 走真 SQLite CRUD。"""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.pipeline.context import PipelineContext
from app.agent.pipeline.stages import ResolveSessionStage
from app.crud.session import session_crud
from app.models.user import User
from app.schemas.session import SessionCreate


def _ctx(db: AsyncSession, user: User, *, message: str, session_id: str | None) -> PipelineContext:
    return PipelineContext(
        db=db, user=user,
        message=message,
        requested_session_id=session_id,
    )


@pytest.mark.asyncio
async def test_creates_new_session_when_no_id(async_session: AsyncSession, test_user: User):
    stage = ResolveSessionStage()
    ctx = _ctx(async_session, test_user, message="Hello world", session_id=None)

    await stage.apply(ctx)

    assert ctx.session is not None
    assert ctx.is_new_session is True
    assert ctx.session.user_id == test_user.user_id
    assert ctx.session.title == "Hello world"


@pytest.mark.asyncio
async def test_truncates_long_title(async_session: AsyncSession, test_user: User):
    stage = ResolveSessionStage()
    long_msg = "a" * 100
    ctx = _ctx(async_session, test_user, message=long_msg, session_id=None)

    await stage.apply(ctx)

    assert ctx.session is not None
    assert len(ctx.session.title) == 33  # 30 + "..."
    assert ctx.session.title.endswith("...")


@pytest.mark.asyncio
async def test_reuses_existing_session(async_session: AsyncSession, test_user: User):
    existing = await session_crud.create(
        async_session, SessionCreate(title="old"), test_user.user_id,
    )

    stage = ResolveSessionStage()
    ctx = _ctx(async_session, test_user, message="new msg", session_id=existing.session_id)

    await stage.apply(ctx)

    assert ctx.session is not None
    assert ctx.session.session_id == existing.session_id
    assert ctx.is_new_session is False
    assert ctx.session.title == "old"  # 不覆盖已有标题


@pytest.mark.asyncio
async def test_fills_empty_title_on_existing_session(async_session: AsyncSession, test_user: User):
    existing = await session_crud.create(
        async_session, SessionCreate(title=None), test_user.user_id,
    )
    assert existing.title is None

    stage = ResolveSessionStage()
    ctx = _ctx(async_session, test_user, message="first message", session_id=existing.session_id)

    await stage.apply(ctx)

    assert ctx.session is not None
    assert ctx.session.title == "first message"


@pytest.mark.asyncio
async def test_unknown_session_id_404(async_session: AsyncSession, test_user: User):
    stage = ResolveSessionStage()
    ctx = _ctx(async_session, test_user, message="hi", session_id="does-not-exist")

    with pytest.raises(HTTPException) as exc:
        await stage.apply(ctx)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_other_users_session_403(
    async_session: AsyncSession, test_user: User, other_user: User,
):
    existing = await session_crud.create(
        async_session, SessionCreate(title="owned by other"), other_user.user_id,
    )

    stage = ResolveSessionStage()
    ctx = _ctx(async_session, test_user, message="try to access", session_id=existing.session_id)

    with pytest.raises(HTTPException) as exc:
        await stage.apply(ctx)
    assert exc.value.status_code == 403
