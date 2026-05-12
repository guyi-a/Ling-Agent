"""trace_context ContextVar 的并发隔离测试。

ContextVar 最关键的性质：asyncio 不同 Task 之间互不干扰。
这些 case 锁住这一点 —— 如果未来有人把它换成模块级全局，立刻会炸。
"""
from __future__ import annotations

import asyncio

import pytest

from app.core.trace_context import (
    current_request_id,
    current_session_id,
    current_user_id,
)


@pytest.mark.asyncio
async def test_default_is_none():
    assert current_session_id.get() is None
    assert current_user_id.get() is None
    assert current_request_id.get() is None


@pytest.mark.asyncio
async def test_set_and_reset_roundtrip():
    tok = current_session_id.set("abc")
    assert current_session_id.get() == "abc"
    current_session_id.reset(tok)
    assert current_session_id.get() is None


@pytest.mark.asyncio
async def test_concurrent_tasks_do_not_leak():
    """两个并发 task 各自设不同的 session_id，彼此不该看见对方的值。"""
    barrier = asyncio.Event()
    seen_a: list[str | None] = []
    seen_b: list[str | None] = []

    async def worker(tag: str, bucket: list):
        current_session_id.set(tag)
        # 给对方协程机会也 set，看看我们的值会不会被覆盖
        await barrier.wait()
        bucket.append(current_session_id.get())

    task_a = asyncio.create_task(worker("A-sid", seen_a))
    task_b = asyncio.create_task(worker("B-sid", seen_b))
    await asyncio.sleep(0.01)  # 两个 task 都先 set 再等
    barrier.set()
    await asyncio.gather(task_a, task_b)

    assert seen_a == ["A-sid"]
    assert seen_b == ["B-sid"]
    # 主 task 自己的 context 不受影响
    assert current_session_id.get() is None


@pytest.mark.asyncio
async def test_nested_reset_restores_outer_value():
    outer_tok = current_user_id.set("outer")

    async def inner():
        inner_tok = current_user_id.set("inner")
        assert current_user_id.get() == "inner"
        current_user_id.reset(inner_tok)
        assert current_user_id.get() == "outer"

    await inner()
    assert current_user_id.get() == "outer"
    current_user_id.reset(outer_tok)
    assert current_user_id.get() is None
