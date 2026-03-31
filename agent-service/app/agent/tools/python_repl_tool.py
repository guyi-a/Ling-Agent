"""
Python REPL 工具 - 直接执行 Python 代码片段

安全限制：
  - 代码执行目录限制在 WORKSPACE_ROOT/{session_id}/ 内
  - 默认超时 60 秒
  - 需要人工审批（HIGH_RISK_TOOLS）
"""
import asyncio
import logging
import os
import platform
import signal
import sys
import textwrap
from pathlib import Path
from typing import Optional, Type

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from app.core.config import settings
from app.agent.tools.file_tool import get_session_workspace

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = 60


def _kill_process(proc: asyncio.subprocess.Process) -> None:
    if platform.system() == "Windows":
        try:
            import subprocess
            subprocess.run(
                ["taskkill", "/T", "/F", "/PID", str(proc.pid)],
                capture_output=True,
            )
        except OSError:
            pass
    else:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass


class _PythonReplInput(BaseModel):
    code: str = Field(description="要执行的 Python 代码片段")
    timeout: int = Field(
        default=_DEFAULT_TIMEOUT,
        description=f"超时秒数，默认 {_DEFAULT_TIMEOUT} 秒",
    )


class PythonReplTool(BaseTool):
    """在 session 工作区内执行 Python 代码片段"""

    name: str = "python_repl"
    description: str = (
        "Execute a Python code snippet and return its output. "
        "The working directory is the session workspace, so you can read/write files there. "
        "Use this for data analysis, calculations, file processing, generating charts, etc. "
        "stdout and stderr are both captured and returned."
    )
    args_schema: Type[BaseModel] = _PythonReplInput
    current_session_id: Optional[str] = None

    def _run(self, code: str, timeout: int = _DEFAULT_TIMEOUT) -> str:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(asyncio.run, self._execute(code, timeout))
                    return future.result()
            else:
                return loop.run_until_complete(self._execute(code, timeout))
        except Exception as e:
            return f"Error: {e}"

    async def _arun(self, code: str, timeout: int = _DEFAULT_TIMEOUT) -> str:
        return await self._execute(code, timeout)

    async def _execute(self, code: str, timeout: int) -> str:
        if self.current_session_id:
            cwd = get_session_workspace(self.current_session_id)
        else:
            cwd = Path(settings.WORKSPACE_ROOT).resolve()
            cwd.mkdir(parents=True, exist_ok=True)

        # 将代码写入临时文件执行，避免 shell 转义问题
        script_path = cwd / "_repl_tmp.py"
        script_path.write_text(textwrap.dedent(code), encoding="utf-8")

        logger.info(f"🐍 Run Python snippet in {cwd} ({len(code)} chars)")

        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, str(script_path),
                cwd=str(cwd),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                start_new_session=True,
            )

            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    proc.communicate(), timeout=timeout
                )
            except asyncio.TimeoutError:
                _kill_process(proc)
                await proc.wait()
                return f"Python code timed out after {timeout} seconds."
            except asyncio.CancelledError:
                _kill_process(proc)
                await proc.wait()
                raise
        finally:
            try:
                script_path.unlink(missing_ok=True)
            except Exception:
                pass

        stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
        stderr = stderr_bytes.decode("utf-8", errors="replace").strip()
        exit_code = proc.returncode or 0

        parts = [f"Exit code: {exit_code}"]
        if stdout:
            parts.append(f"Output:\n{stdout}")
        if stderr:
            parts.append(f"Stderr:\n{stderr}")

        logger.info(f"🐍 Python snippet finished (exit={exit_code})")
        return "\n\n".join(parts)
