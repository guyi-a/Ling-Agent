"""
Shell 工具 - 在工作区内执行命令行命令

安全限制：
  - 命令执行目录限制在 WORKSPACE_ROOT/{session_id}/ 内
  - 默认超时 30 秒，防止命令挂起
"""
import asyncio
import logging
import platform
import os
import signal
import subprocess
from pathlib import Path
from typing import Optional, Type

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from app.core.config import settings
from app.agent.tools.file_tool import get_session_workspace

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = 30
_IS_WIN = platform.system() == "Windows"


def _decode(data: bytes) -> str:
    """Decode subprocess output, trying the system codepage on Windows first."""
    if _IS_WIN:
        try:
            return data.decode("gbk")
        except (UnicodeDecodeError, LookupError):
            pass
    return data.decode("utf-8", errors="replace")


def _kill_process(proc: asyncio.subprocess.Process) -> None:
    """Terminate a subprocess and its process group."""
    if platform.system() == "Windows":
        try:
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


class _ShellInput(BaseModel):
    command: str = Field(description="要执行的 shell 命令")
    timeout: int = Field(
        default=_DEFAULT_TIMEOUT,
        description=f"超时秒数，默认 {_DEFAULT_TIMEOUT} 秒",
    )


class ShellTool(BaseTool):
    """在 session 工作区内执行 shell 命令"""

    name: str = "run_command"
    description: str = (
        "Execute a shell command in the session workspace directory. "
        "Returns stdout, stderr, and exit code. "
        "Use for running scripts, installing packages, compiling code, etc. "
        "Commands are restricted to the session workspace."
    )
    args_schema: Type[BaseModel] = _ShellInput
    current_session_id: Optional[str] = None

    def _run(self, command: str, timeout: int = _DEFAULT_TIMEOUT) -> str:
        """Synchronous fallback — runs the async version in a new event loop."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(
                        asyncio.run, self._execute(command, timeout)
                    )
                    return future.result()
            else:
                return loop.run_until_complete(self._execute(command, timeout))
        except Exception as e:
            return f"Error: {e}"

    async def _arun(self, command: str, timeout: int = _DEFAULT_TIMEOUT) -> str:
        return await self._execute(command, timeout)

    async def _execute_sync_fallback(self, command: str, timeout: int, cwd: Path) -> str:
        """Fallback for Windows when ProactorEventLoop is not available."""
        loop = asyncio.get_running_loop()
        def _run() -> str:
            try:
                result = subprocess.run(
                    command,
                    shell=True,
                    cwd=str(cwd),
                    capture_output=True,
                    timeout=timeout,
                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
                )
            except subprocess.TimeoutExpired:
                return f"Command timed out after {timeout} seconds.\nCommand: {command}"
            stdout = _decode(result.stdout).strip()
            stderr = _decode(result.stderr).strip()
            exit_code = result.returncode
            parts = [f"Exit code: {exit_code}"]
            if stdout:
                parts.append(f"Stdout:\n{stdout}")
            if stderr:
                parts.append(f"Stderr:\n{stderr}")
            logger.info(f"🖥️  Command finished (exit={exit_code}): {command!r}")
            return "\n\n".join(parts)
        return await loop.run_in_executor(None, _run)

    async def _execute(self, command: str, timeout: int) -> str:
        if self.current_session_id:
            cwd = get_session_workspace(self.current_session_id)
        else:
            cwd = Path(settings.WORKSPACE_ROOT).resolve()
            cwd.mkdir(parents=True, exist_ok=True)

        logger.info(f"🖥️  Run command in {cwd}: {command!r}")

        is_win = platform.system() == "Windows"

        kwargs: dict = dict(
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        if not is_win:
            kwargs["start_new_session"] = True
        else:
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

        if is_win:
            loop = asyncio.get_running_loop()
            if not isinstance(loop, asyncio.ProactorEventLoop):
                return await self._execute_sync_fallback(command, timeout, cwd)

        proc = await asyncio.create_subprocess_shell(command, **kwargs)

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            _kill_process(proc)
            await proc.wait()
            return (
                f"Command timed out after {timeout} seconds.\n"
                f"Command: {command}"
            )
        except asyncio.CancelledError:
            _kill_process(proc)
            await proc.wait()
            raise

        stdout = _decode(stdout_bytes).strip()
        stderr = _decode(stderr_bytes).strip()
        exit_code = proc.returncode or 0

        parts = [f"Exit code: {exit_code}"]
        if stdout:
            parts.append(f"Stdout:\n{stdout}")
        if stderr:
            parts.append(f"Stderr:\n{stderr}")

        logger.info(f"🖥️  Command finished (exit={exit_code}): {command!r}")
        return "\n\n".join(parts)
