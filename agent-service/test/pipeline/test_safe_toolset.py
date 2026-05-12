"""SafeToolset 异常包装测试。"""
from __future__ import annotations

from typing import Type

import pytest
from langchain_core.tools import BaseTool, ToolException
from pydantic import BaseModel, Field

from app.agent.tools.safe_toolset import SafeTool, safe_wrap


class _Input(BaseModel):
    x: int = Field(...)


class _RaiseFileNotFound(BaseTool):
    name: str = "raises_fnf"
    description: str = "raises FileNotFoundError"
    args_schema: Type[BaseModel] = _Input

    def _run(self, x: int) -> str:
        raise FileNotFoundError("missing")


class _RaiseRuntime(BaseTool):
    name: str = "raises_rt"
    description: str = "raises RuntimeError"
    args_schema: Type[BaseModel] = _Input

    def _run(self, x: int) -> str:
        raise RuntimeError("boom")


class _Normal(BaseTool):
    name: str = "normal"
    description: str = "returns value"
    args_schema: Type[BaseModel] = _Input

    def _run(self, x: int) -> str:
        return f"got {x}"


def test_wraps_into_safe_tool():
    wrapped = safe_wrap(_Normal())
    assert isinstance(wrapped, SafeTool)
    assert wrapped.name == "normal"
    assert wrapped.description == "returns value"


def test_normal_call_passes_through():
    wrapped = safe_wrap(_Normal())
    assert wrapped.invoke({"x": 42}) == "got 42"


def test_file_not_found_becomes_string():
    wrapped = safe_wrap(_RaiseFileNotFound())
    out = wrapped.invoke({"x": 1})
    assert isinstance(out, str)
    assert "FileNotFoundError" in out
    assert "missing" in out


def test_runtime_error_becomes_string():
    wrapped = safe_wrap(_RaiseRuntime())
    out = wrapped.invoke({"x": 1})
    assert isinstance(out, str)
    assert "RuntimeError" in out


def test_double_wrap_is_idempotent():
    once = safe_wrap(_Normal())
    twice = safe_wrap(once)
    # 包两次还是同一个 SafeTool，不会嵌套
    assert twice is once


def test_tool_exception_still_becomes_string():
    """工具自己抛 ToolException 也走 handle_tool_error，不会穿透。"""

    class _RaiseTE(BaseTool):
        name: str = "te"
        description: str = "raises ToolException"
        args_schema: Type[BaseModel] = _Input

        def _run(self, x: int) -> str:
            raise ToolException("explicit")

    wrapped = safe_wrap(_RaiseTE())
    out = wrapped.invoke({"x": 1})
    assert "explicit" in out
