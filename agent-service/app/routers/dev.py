"""
Dev Services 路由 — 前端查询/操作后台进程（需要 JWT 认证）
"""

import asyncio
import logging
import shlex
import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.crud.session import session_crud
from app.core.deps import get_current_user
from app.models.user import User
from app.agent.service.process_manager import (
    start_process as pm_start,
    stop_process as pm_stop,
    restart_process as pm_restart,
    list_processes as pm_list,
    get_logs as pm_get_logs,
    allocate_port, release_port, detect_port,
)
from app.agent.tools.file_tool import get_session_workspace

router = APIRouter(prefix="/api/dev", tags=["dev"])

logger = logging.getLogger(__name__)


class StartProcessRequest(BaseModel):
    name: str = Field(description="进程名称")
    command: str = Field(description="Shell 命令")
    workdir: str = Field(default="", description="相对于工作区的工作目录")
    port: int | None = Field(default=None, description="端口号")


async def _check_session_owner(session_id: str, current_user: User, db: AsyncSession) -> None:
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")
    if session.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问此会话")


def _install_deps(project_dir: Path) -> None:
    """在项目目录创建 venv 并安装 requirements.txt"""
    req_file = project_dir / "requirements.txt"
    if not req_file.exists():
        return

    venv_dir = project_dir / ".venv"
    logger.info(f"Installing deps for {project_dir.name}...")

    subprocess.run(
        ["python", "-m", "venv", str(venv_dir)],
        cwd=str(project_dir),
        check=True,
        capture_output=True,
        timeout=60,
    )

    pip = venv_dir / "bin" / "pip"
    subprocess.run(
        [str(pip), "install", "-r", "requirements.txt"],
        cwd=str(project_dir),
        check=True,
        capture_output=True,
        timeout=120,
    )
    logger.info(f"Deps installed for {project_dir.name}")


def _rewrite_cmd_for_venv(cmd_list: list[str], work_path: Path) -> list[str]:
    """如果项目有 venv，将命令中的 uvicorn 替换为 venv 里的"""
    venv_dir = work_path / ".venv"
    if not venv_dir.exists():
        return cmd_list

    uvicorn_bin = str(venv_dir / "bin" / "uvicorn")

    # 处理 python -m uvicorn ... 的情况
    if (
        len(cmd_list) >= 3
        and cmd_list[0].endswith("python")
        and cmd_list[1] == "-m"
        and cmd_list[2] == "uvicorn"
    ):
        return [uvicorn_bin] + cmd_list[3:]

    # 处理直接调用 uvicorn 的情况
    return [uvicorn_bin if arg == "uvicorn" else arg for arg in cmd_list]


@router.get("/{session_id}/processes")
async def list_processes(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出 session 的所有后台进程"""
    await _check_session_owner(session_id, current_user, db)
    processes = pm_list(session_id)
    return {
        "session_id": session_id,
        "processes": processes,
    }


@router.post("/{session_id}/start")
async def start_process(
    session_id: str,
    req: StartProcessRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """启动后台进程（自动安装依赖）"""
    await _check_session_owner(session_id, current_user, db)

    workspace = get_session_workspace(session_id)
    if req.workdir:
        work_path = (workspace / req.workdir).resolve()
        if not work_path.is_relative_to(workspace.resolve()):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="工作目录越界")
    else:
        work_path = workspace

    cmd_list = shlex.split(req.command)
    if not cmd_list:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="命令不能为空")

    # 自动安装依赖
    req_file = work_path / "requirements.txt"
    if req_file.exists() and not (work_path / ".venv").exists():
        try:
            await asyncio.to_thread(_install_deps, work_path)
        except subprocess.CalledProcessError as e:
            stderr_text = e.stderr.decode("utf-8", errors="replace") if e.stderr else str(e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"依赖安装失败: {stderr_text}",
            )

    # 使用 venv 的 uvicorn
    cmd_list = _rewrite_cmd_for_venv(cmd_list, work_path)

    # 端口管理
    port = req.port
    if port is None:
        try:
            port = allocate_port()
        except RuntimeError as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

        detected = detect_port(cmd_list)
        if detected is not None:
            for i, arg in enumerate(cmd_list):
                if arg == str(detected) and i > 0 and cmd_list[i - 1] in ("--port", "-p", "-P"):
                    cmd_list[i] = str(port)
                    break
        else:
            cmd_list.extend(["--port", str(port)])

    try:
        info = pm_start(
            session_id=session_id,
            name=req.name,
            command=cmd_list,
            workdir=work_path,
            port=None,  # 端口已在命令中
        )
    except RuntimeError as e:
        release_port(port)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    return {
        "status": "ok",
        "process": info,
    }


@router.get("/{session_id}/logs/{name}")
async def get_process_logs(
    session_id: str,
    name: str,
    lines: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取进程日志"""
    await _check_session_owner(session_id, current_user, db)

    try:
        log_lines = pm_get_logs(session_id, name, lines)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"进程 '{name}' 不存在")

    return {
        "session_id": session_id,
        "name": name,
        "lines": log_lines,
    }


@router.post("/{session_id}/stop/{name}")
async def stop_process(
    session_id: str,
    name: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """停止进程"""
    await _check_session_owner(session_id, current_user, db)

    try:
        pm_stop(session_id, name)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"进程 '{name}' 不存在")

    return {"status": "ok", "message": f"进程 '{name}' 已停止"}


@router.post("/{session_id}/restart/{name}")
async def restart_process(
    session_id: str,
    name: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """重启进程（复用端口）"""
    await _check_session_owner(session_id, current_user, db)

    try:
        info = pm_restart(session_id, name)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"进程 '{name}' 不存在")
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    return {
        "status": "ok",
        "process": info,
    }
