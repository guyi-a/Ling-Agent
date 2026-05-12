"""PersistUserMessage + LoadHistory 集成测试：验证两个 Stage 联动写入/读出一致。"""
from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.pipeline.context import PipelineContext
from app.agent.pipeline.stages import (
    LoadHistoryStage,
    PersistUserMessageStage,
    ResolveSessionStage,
)
from app.models.user import User


@pytest.mark.asyncio
async def test_persist_then_load_roundtrip(async_session: AsyncSession, test_user: User):
    """一轮对话：建会话 → 写用户消息 → 加载历史，能看到刚写的消息。"""
    ctx = PipelineContext(
        db=async_session, user=test_user,
        message="first user input",
        requested_session_id=None,
    )

    await ResolveSessionStage().apply(ctx)
    await PersistUserMessageStage().apply(ctx)
    await LoadHistoryStage().apply(ctx)

    assert ctx.user_message is not None
    assert ctx.user_message.content == "first user input"
    assert ctx.user_message.role == "user"

    assert len(ctx.history) == 1
    assert ctx.history[0]["role"] == "user"
    assert ctx.history[0]["content"] == "first user input"


@pytest.mark.asyncio
async def test_attachments_are_persisted_to_extra_data(
    async_session: AsyncSession, test_user: User,
):
    ctx = PipelineContext(
        db=async_session, user=test_user,
        message="msg with image",
        attachments=[{"type": "image", "path": "uploads/a.png"}],
        requested_session_id=None,
    )

    await ResolveSessionStage().apply(ctx)
    await PersistUserMessageStage().apply(ctx)

    assert ctx.user_message is not None
    # extra_data 实际存储为字符串（SQLAlchemy Text），CRUD 负责序列化
    assert ctx.user_message.extra_data is not None
    assert "uploads/a.png" in str(ctx.user_message.extra_data)


@pytest.mark.asyncio
async def test_empty_history_for_new_session(async_session: AsyncSession, test_user: User):
    """新建会话尚未写 user message 时 history 应为空。"""
    ctx = PipelineContext(
        db=async_session, user=test_user,
        message="hi", requested_session_id=None,
    )

    await ResolveSessionStage().apply(ctx)
    await LoadHistoryStage().apply(ctx)

    assert ctx.history == []
