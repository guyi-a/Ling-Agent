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
    code: str = Field(
        default="",
        description="要执行的 Python 代码片段。全量写入模式必填；edit 模式可留空（仅替换后执行）。",
    )
    filename: Optional[str] = Field(
        default=None,
        description="指定脚本文件名（如 'generate_pdf.py'）。指定后会覆盖同名文件，适合迭代修改同一个脚本。不指定则自动生成带时间戳的新文件。",
    )
    old_string: Optional[str] = Field(
        default=None,
        description="Edit 模式：要替换的原始代码片段。必须与文件中的内容精确匹配（含缩进）。需配合 filename 和 new_string 使用。",
    )
    new_string: Optional[str] = Field(
        default=None,
        description="Edit 模式：替换后的新代码片段。与 old_string 配对使用。",
    )
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
        "The script will be saved to outputs/scripts/ for future reference. "
        "Supports 3 modes: "
        "(1) New script: just pass `code` — auto-generates a timestamped file. "
        "(2) Rewrite script: pass `code` + `filename` — overwrites the named file and executes. "
        "(3) Edit script: pass `filename` + `old_string` + `new_string` — patches the existing file and re-executes (no `code` needed). "
        "Prefer edit mode for small changes to avoid resending the entire script. "
        "stdout and stderr are both captured and returned."
    )
    args_schema: Type[BaseModel] = _PythonReplInput
    current_session_id: Optional[str] = None

    def _run(self, code: str = "", filename: Optional[str] = None,
             old_string: Optional[str] = None, new_string: Optional[str] = None,
             timeout: int = _DEFAULT_TIMEOUT) -> str:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(asyncio.run, self._execute(code, filename, old_string, new_string, timeout))
                    return future.result()
            else:
                return loop.run_until_complete(self._execute(code, filename, old_string, new_string, timeout))
        except Exception as e:
            return f"Error: {e}"

    async def _arun(self, code: str = "", filename: Optional[str] = None,
                    old_string: Optional[str] = None, new_string: Optional[str] = None,
                    timeout: int = _DEFAULT_TIMEOUT) -> str:
        return await self._execute(code, filename, old_string, new_string, timeout)

    async def _execute(self, code: str, filename: Optional[str],
                       old_string: Optional[str], new_string: Optional[str],
                       timeout: int) -> str:
        if self.current_session_id:
            cwd = get_session_workspace(self.current_session_id)
        else:
            cwd = Path(settings.WORKSPACE_ROOT).resolve()
            cwd.mkdir(parents=True, exist_ok=True)

        # 创建 scripts 目录用于保存执行的脚本
        scripts_dir = cwd / "outputs" / "scripts"
        scripts_dir.mkdir(parents=True, exist_ok=True)

        # 确定脚本文件路径
        if filename:
            safe_name = Path(filename).name
            if not safe_name.endswith(".py"):
                safe_name += ".py"
            script_path = scripts_dir / safe_name
        else:
            from datetime import datetime
            from zoneinfo import ZoneInfo
            timestamp = datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y%m%d_%H%M%S")
            script_path = scripts_dir / f"script_{timestamp}.py"

        # Edit 模式：局部替换已有文件内容后执行
        if old_string is not None and new_string is not None:
            if not script_path.exists():
                return f"Error: File not found: {script_path.relative_to(cwd)}. Edit mode requires an existing file."
            content = script_path.read_text(encoding="utf-8")
            if old_string not in content:
                return (
                    f"Error: old_string not found in {script_path.relative_to(cwd)}. "
                    "Make sure it matches exactly (including whitespace and indentation)."
                )
            content = content.replace(old_string, new_string, 1)
            script_path.write_text(content, encoding="utf-8")
            logger.info(f"✏️  Edited script: {script_path.relative_to(cwd)} (replaced {len(old_string)} → {len(new_string)} chars)")
        else:
            # 全量写入模式
            if not code:
                return "Error: `code` is required when not using edit mode (old_string + new_string)."
            script_path.write_text(textwrap.dedent(code), encoding="utf-8")

        logger.info(f"🐍 Run Python script: {script_path.relative_to(cwd)} ({len(code)} chars)")

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
                return f"Python code timed out after {timeout} seconds.\n\nScript saved: {script_path.relative_to(cwd)}"
            except asyncio.CancelledError:
                _kill_process(proc)
                await proc.wait()
                raise
        except Exception as e:
            return f"Error executing script: {e}\n\nScript saved: {script_path.relative_to(cwd)}"

        stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
        stderr = stderr_bytes.decode("utf-8", errors="replace").strip()
        exit_code = proc.returncode or 0

        # 构建返回结果（包含脚本保存位置）
        relative_path = script_path.relative_to(cwd)
        parts = [
            f"Script saved: {relative_path}",
            f"Exit code: {exit_code}"
        ]
        if stdout:
            parts.append(f"Output:\n{stdout}")
        if stderr:
            parts.append(f"Stderr:\n{stderr}")

        logger.info(f"🐍 Python script finished (exit={exit_code}, saved={relative_path})")
        return "\n\n".join(parts)
