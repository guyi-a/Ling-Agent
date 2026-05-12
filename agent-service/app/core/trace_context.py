"""Per-request 上下文变量，跨 async 边界自动传递。

用法：
    # middleware / Stage 里设置
    from app.core.trace_context import current_session_id
    token = current_session_id.set("abc")
    try:
        ...
    finally:
        current_session_id.reset(token)

    # 任何地方读取（log / tool / ...）
    sid = current_session_id.get()  # None 如果未设置

为什么用 ContextVar 而不是模块级变量：
- asyncio.Task 之间自动隔离，不会串号
- 嵌套作用域通过 token reset 正确恢复
- 日志 Filter 可以直接 .get() 注入到 LogRecord
"""
from __future__ import annotations

import contextvars

current_user_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_user_id", default=None,
)
current_session_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_session_id", default=None,
)
current_request_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_request_id", default=None,
)
