"""Stream buffer for SSE chunk caching and resumable streams.

参考 krow-agent 的 StreamBuffer 架构：
- 用 asyncio.Queue 做多订阅者通知（每个订阅者一个 Queue），无锁
- stream_all() 先回放历史 chunks 再订阅新事件，一个方法搞定重连
- Agent 结束后 buffer 由调用方移除
"""

from __future__ import annotations
import asyncio
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncIterator

logger = logging.getLogger(__name__)


class StreamStatus(Enum):
    STREAMING = "STREAMING"
    COMPLETE = "COMPLETE"


@dataclass
class SessionStream:
    """单个会话的 SSE 事件流缓冲区。"""

    chunks: list[str] = field(default_factory=list)
    status: StreamStatus = StreamStatus.STREAMING
    _subscribers: list[asyncio.Queue[str | None]] = field(default_factory=list)
    _task: asyncio.Task | None = None
    _pending_approval_chunk: str | None = None  # 当前待审批的 SSE chunk
    _gap_text: str = ""  # DB 保存点后累积的未存文本（用于 subscribe_only catchup）

    def set_task(self, task: asyncio.Task) -> None:
        """记录后台任务引用，用于取消。"""
        self._task = task

    def cancel(self) -> bool:
        """取消后台任务。返回 True 表示成功取消。"""
        if self._task and not self._task.done():
            self._task.cancel()
            return True
        return False

    def mark_save_point(self) -> None:
        """标记 DB 保存点，重置间隙文本。"""
        self._gap_text = ""

    def append_gap_text(self, text: str) -> None:
        """追加间隙文本（token 事件的文本）。"""
        self._gap_text += text

    def append(self, chunk: str) -> None:
        """追加一个已编码的 SSE chunk，通知所有订阅者。"""
        self.chunks.append(chunk)
        # 追踪待审批状态：subscribe_only 模式需要注入当前审批事件
        if 'event: approval_required' in chunk:
            self._pending_approval_chunk = chunk
        elif self._pending_approval_chunk and any(
            marker in chunk for marker in [
                'event: approval_rejected', 'event: tool_start',
                'event: done', 'event: cancelled', 'event: error',
            ]
        ):
            self._pending_approval_chunk = None
        for queue in self._subscribers:
            queue.put_nowait(chunk)

    def finish(self) -> None:
        """标记流完成，通知所有订阅者。"""
        self.status = StreamStatus.COMPLETE
        for queue in self._subscribers:
            queue.put_nowait(None)

    async def subscribe(self) -> AsyncIterator[str]:
        """订阅新 chunk。流完成时自动结束。

        注意：如果调用时 buffer 已经 COMPLETE，立即返回（不会永远阻塞）。
        """
        queue: asyncio.Queue[str | None] = asyncio.Queue()
        # 注册 + 检查状态在同一同步块（无 await），不会被其他协程插入
        self._subscribers.append(queue)
        already_complete = self.status == StreamStatus.COMPLETE
        try:
            if already_complete:
                # finish() 可能在 append 之后、检查之前将 None 推入了 queue
                while not queue.empty():
                    chunk = queue.get_nowait()
                    if chunk is not None:
                        yield chunk
                return
            while True:
                chunk = await queue.get()
                if chunk is None:
                    break
                yield chunk
        finally:
            self._subscribers.remove(queue)

    async def stream_all(self) -> AsyncIterator[str]:
        """回放所有历史 chunk + 订阅新 chunk。重连的核心方法。

        解决竞态条件：先注册 Queue，再回放。回放只 yield 注册时刻
        已有的 chunks（按 count 截止），之后的新 chunk 全部从 Queue 读取，
        不会丢失也不会重复。
        """
        queue: asyncio.Queue[str | None] = asyncio.Queue()
        # 注册 + 快照在同一同步块，无 yield/await，不会被其他协程插入
        self._subscribers.append(queue)
        replay_count = len(self.chunks)

        try:
            # 回放注册前已有的 chunks
            for i in range(replay_count):
                yield self.chunks[i]

            # 如果注册前就已经完成（finish 在注册前调用），不等待
            if self.status == StreamStatus.COMPLETE:
                # 排空 Queue 中可能残留的 chunk（finish 期间追加的）
                while not queue.empty():
                    chunk = queue.get_nowait()
                    if chunk is not None:
                        yield chunk
                return

            # 从 Queue 读取后续新 chunk
            while True:
                chunk = await queue.get()
                if chunk is None:
                    break
                yield chunk
        finally:
            self._subscribers.remove(queue)


class StreamBufferManager:
    """全局 stream buffer 管理器。"""

    def __init__(self) -> None:
        self._buffers: dict[str, SessionStream] = {}

    def get(self, session_id: str) -> SessionStream | None:
        return self._buffers.get(session_id)

    def create(self, session_id: str) -> SessionStream:
        """创建新 buffer，替换已有的。"""
        self._buffers[session_id] = SessionStream()
        logger.info(f"StreamBuffer: created for {session_id[:8]}...")
        return self._buffers[session_id]

    def is_streaming(self, session_id: str) -> bool:
        buffer = self._buffers.get(session_id)
        return buffer is not None and buffer.status == StreamStatus.STREAMING

    def remove(self, session_id: str) -> None:
        self._buffers.pop(session_id, None)


# 全局单例
stream_buffers = StreamBufferManager()
