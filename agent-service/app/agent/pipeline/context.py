"""Stage 间共享的可变状态。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.service.event_buffer import SessionStream
from app.models.message import Message
from app.models.session import Session
from app.models.user import User


@dataclass
class PipelineContext:
    """Stage 间唯一通信通道。

    字段按生命周期分组：
    - 入口（路由层填入）：db/user/message/attachments/requested_session_id
    - 中间产物（前置 Stage 填入）：session/is_new_session/user_message/history
    - 终态（StartAgentStage 填入）：buffer（SSE 流缓冲区）

    约定：某字段 "在 StageX 之后一定非空" 的语义通过 Stage 执行顺序保证；
    后续 Stage 可以 `assert ctx.session is not None` 辅助类型收窄。
    """

    # ── 入口 ──────────────────────────────────────────────
    db: AsyncSession
    user: User
    message: str
    attachments: list[dict[str, Any]] | None = None
    requested_session_id: str | None = None

    # ── 中间产物 ──────────────────────────────────────────
    session: Session | None = None
    is_new_session: bool = False
    user_message: Message | None = None
    history: list[dict[str, Any]] = field(default_factory=list)

    # ── 终态 ──────────────────────────────────────────────
    buffer: SessionStream | None = None
    early_response_reason: str | None = None
    """非空表示路由应立即返回现有 buffer 不再继续后续 Stage（如 is_streaming 命中）。"""
