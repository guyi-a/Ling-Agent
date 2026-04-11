"""
Dev Services 工具 — Agent 可调用的后台进程管理接口

工具列表：
  - dev_run:     启动后台进程（需要审批）
  - dev_stop:    停止进程
  - dev_restart:  重启进程
  - dev_logs:    查看进程日志
"""

import shlex
import logging
from pathlib import Path
from typing import Optional, Type

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from app.agent.tools.file_tool import get_session_workspace
from app.agent.service.process_manager import (
    start_process as pm_start,
    stop_process as pm_stop,
    restart_process as pm_restart,
    get_logs as pm_get_logs,
    get_process_status as pm_status,
    allocate_port, release_port, detect_port,
)

logger = logging.getLogger(__name__)


# ── dev_run ─────────────────────────────────────────────────

class _DevRunInput(BaseModel):
    name: str = Field(description="Unique process name, e.g. 'api-server', 'frontend'")
    command: str = Field(
        description="Shell command to run, e.g. 'python server.py' or 'npx vite --port 9101'"
    )
    port: Optional[int] = Field(
        default=None,
        description="Port the process listens on. Auto-allocated if not specified."
    )
    workdir: Optional[str] = Field(
        default=None,
        description="Working directory relative to workspace root. Defaults to workspace root."
    )


class DevRunTool(BaseTool):
    """Start a background dev process"""

    name: str = "dev_run"
    description: str = (
        "Start a persistent background process (e.g., API server, frontend dev server). "
        "The process keeps running until stopped with dev_stop. "
        "Use dev_logs afterward to verify it started correctly. "
        "Returns process name, PID, and allocated port."
    )
    args_schema: Type[BaseModel] = _DevRunInput
    current_session_id: Optional[str] = None

    def _run(self, **kwargs) -> str:
        try:
            return self._execute(**kwargs)
        except Exception as e:
            return f"Error: {e}"

    async def _arun(self, **kwargs) -> str:
        return self._run(**kwargs)

    def _execute(
        self,
        name: str,
        command: str,
        port: Optional[int] = None,
        workdir: Optional[str] = None,
    ) -> str:
        if not self.current_session_id:
            return "Error: session_id not set"

        workspace = get_session_workspace(self.current_session_id)
        if workdir:
            work_path = (workspace / workdir).resolve()
            if not work_path.is_relative_to(workspace):
                return f"Error: workdir must be within workspace: {workdir}"
        else:
            work_path = workspace

        cmd_list = shlex.split(command)
        if not cmd_list:
            return "Error: empty command"

        # 端口管理：始终由系统分配安全端口
        if port is None:
            try:
                port = allocate_port()
            except RuntimeError as e:
                return f"Error: {e}"

            # 替换或注入 --port 参数
            detected = detect_port(cmd_list)
            if detected is not None:
                for i, arg in enumerate(cmd_list):
                    if arg == str(detected) and i > 0 and cmd_list[i - 1] in ("--port", "-p"):
                        cmd_list[i] = str(port)
                        break
                    if arg.startswith("--port=") or arg.startswith("-p="):
                        cmd_list[i] = f"--port={port}"
                        break
            else:
                cmd_list.extend(["--port", str(port)])

        try:
            info = pm_start(
                session_id=self.current_session_id,
                name=name,
                command=cmd_list,
                workdir=work_path,
                port=None,  # 端口已在命令中
            )
        except RuntimeError as e:
            release_port(port)
            return f"Error: {e}"

        return (
            f"Process '{info['name']}' started\n"
            f"  PID: {info['pid']}\n"
            f"  Port: {info['port']}\n"
            f"  Command: {command}\n"
            f"  Workdir: {work_path}\n\n"
            f"Use dev_logs(name='{name}') to check output."
        )


# ── dev_stop ────────────────────────────────────────────────

class _DevStopInput(BaseModel):
    name: str = Field(description="Name of the process to stop")


class DevStopTool(BaseTool):
    """Stop a running dev process"""

    name: str = "dev_stop"
    description: str = "Stop a running background dev process by name."
    args_schema: Type[BaseModel] = _DevStopInput
    current_session_id: Optional[str] = None

    def _run(self, **kwargs) -> str:
        try:
            return self._execute(**kwargs)
        except Exception as e:
            return f"Error: {e}"

    async def _arun(self, **kwargs) -> str:
        return self._run(**kwargs)

    def _execute(self, name: str) -> str:
        if not self.current_session_id:
            return "Error: session_id not set"

        try:
            pm_status(self.current_session_id, name)
        except KeyError:
            return f"Error: process '{name}' not found"

        pm_stop(self.current_session_id, name)
        return f"Process '{name}' stopped."


# ── dev_restart ─────────────────────────────────────────────

class _DevRestartInput(BaseModel):
    name: str = Field(description="Name of the process to restart")


class DevRestartTool(BaseTool):
    """Restart a dev process (keeps same config, resets logs)"""

    name: str = "dev_restart"
    description: str = (
        "Restart a dev process. Stops the current instance and starts a new one "
        "with the same command and port. Logs are reset."
    )
    args_schema: Type[BaseModel] = _DevRestartInput
    current_session_id: Optional[str] = None

    def _run(self, **kwargs) -> str:
        try:
            return self._execute(**kwargs)
        except Exception as e:
            return f"Error: {e}"

    async def _arun(self, **kwargs) -> str:
        return self._run(**kwargs)

    def _execute(self, name: str) -> str:
        if not self.current_session_id:
            return "Error: session_id not set"

        try:
            info = pm_restart(self.current_session_id, name)
        except KeyError:
            return f"Error: process '{name}' not found"
        except RuntimeError as e:
            return f"Error: {e}"

        return (
            f"Process '{name}' restarted\n"
            f"  PID: {info['pid']}\n"
            f"  Port: {info['port']}"
        )


# ── dev_logs ────────────────────────────────────────────────

class _DevLogsInput(BaseModel):
    name: str = Field(description="Name of the process")
    lines: int = Field(default=50, description="Number of recent log lines to return")


class DevLogsTool(BaseTool):
    """Get log output from a dev process"""

    name: str = "dev_logs"
    description: str = (
        "Get recent stdout/stderr output from a dev process. "
        "Use this to verify a process started correctly or to debug errors."
    )
    args_schema: Type[BaseModel] = _DevLogsInput
    current_session_id: Optional[str] = None

    def _run(self, **kwargs) -> str:
        return self._execute(**kwargs)

    async def _arun(self, **kwargs) -> str:
        return self._execute(**kwargs)

    def _execute(self, name: str, lines: int = 50) -> str:
        if not self.current_session_id:
            return "Error: session_id not set"

        try:
            log_lines = pm_get_logs(self.current_session_id, name, lines)
        except KeyError:
            return f"Error: process '{name}' not found"

        if not log_lines:
            return f"No output from process '{name}' yet."

        return "\n".join(log_lines)
