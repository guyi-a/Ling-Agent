"""SafeToolset：给 BaseTool 包一层异常安全外壳。

问题：LangChain 的 agent 循环遇到工具抛 Exception（非 ToolException）时会整个 run 炸掉。
解决：SafeTool wrapper 把任意 Exception 吞住转成 ToolException，
并开启 handle_tool_error=True，让字符串回到 LLM 上下文，agent 可以自己决策重试。

用法：
    from app.agent.tools.safe_toolset import safe_wrap
    tools = [safe_wrap(t) for t in get_all_tools()]

设计取舍：
- 包装器是 BaseTool 子类，而不是 monkey-patch 原工具，避免影响单例状态。
- 原工具的 name/description/args_schema 全部透传，对 LLM 无感。
- SystemExit/KeyboardInterrupt/asyncio.CancelledError 不吞，由上层处理。
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from langchain_core.tools import BaseTool, ToolException

logger = logging.getLogger(__name__)


class SafeTool(BaseTool):
    """代理一个工具，把业务异常包成 ToolException。"""

    inner: BaseTool

    # pydantic v2 需要允许任意类型（BaseTool 不是 pydantic model 子类也行，这里显式）
    model_config = {"arbitrary_types_allowed": True}

    def __init__(self, inner: BaseTool, **kwargs):
        super().__init__(
            name=inner.name,
            description=inner.description,
            args_schema=inner.args_schema,
            handle_tool_error=True,  # ToolException → str 给 LLM
            handle_validation_error=True,
            inner=inner,
            **kwargs,
        )

    def _run(self, *args: Any, **kwargs: Any) -> Any:
        try:
            return self.inner._run(*args, **kwargs)
        except ToolException:
            raise
        except (SystemExit, KeyboardInterrupt):
            raise
        except Exception as exc:
            logger.warning(
                f"tool {self.inner.name} raised {type(exc).__name__}: {exc}",
                exc_info=True,
            )
            raise ToolException(f"{type(exc).__name__}: {exc}") from exc

    async def _arun(self, *args: Any, **kwargs: Any) -> Any:
        try:
            # 某些工具只实现 _run，BaseTool 会 fallback；这里跟随 inner
            return await self.inner._arun(*args, **kwargs)
        except ToolException:
            raise
        except asyncio.CancelledError:
            raise
        except (SystemExit, KeyboardInterrupt):
            raise
        except Exception as exc:
            logger.warning(
                f"tool {self.inner.name} raised {type(exc).__name__}: {exc}",
                exc_info=True,
            )
            raise ToolException(f"{type(exc).__name__}: {exc}") from exc


def safe_wrap(tool: BaseTool) -> BaseTool:
    """包一层异常安全外壳。已是 SafeTool 则原样返回，避免重复包装。"""
    if isinstance(tool, SafeTool):
        return tool
    return SafeTool(tool)
