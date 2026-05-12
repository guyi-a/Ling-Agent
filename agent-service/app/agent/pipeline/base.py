"""Stage 协议定义。"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.agent.pipeline.context import PipelineContext


@runtime_checkable
class Stage(Protocol):
    """一个 Stage 做一件事，读写 ctx，没有返回值。

    约定：
    - 每个 Stage 是普通 class，不继承基类（duck typing）
    - `name` 供日志/追踪使用
    - `apply` 直接 mutate ctx；失败抛异常让上游感知
    - Stage 之间仅通过 PipelineContext 共享状态，不要互相导入
    """

    name: str

    async def apply(self, ctx: PipelineContext) -> None: ...
