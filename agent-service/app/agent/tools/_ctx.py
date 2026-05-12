"""工具层读取 per-request 上下文的小 helper。

所有工具文件用这两个函数代替 self.current_session_id / self.current_user_id，
数据源统一从 app.core.trace_context 的 ContextVar 读取。

为什么不直接 import ContextVar：这层封装让我们将来换实现（比如 OpenTelemetry
baggage）时只改一个文件。
"""
from __future__ import annotations

from app.core.trace_context import current_session_id, current_user_id


def get_session_id() -> str | None:
    return current_session_id.get()


def get_user_id() -> str | None:
    return current_user_id.get()
