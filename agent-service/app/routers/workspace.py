"""
工作区文件管理路由（需要 JWT 认证）
支持文件上传、列表、下载、删除
"""
import os
import mimetypes
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.crud.session import session_crud
from app.core.deps import get_current_user
from app.core.config import settings
from app.models.user import User

router = APIRouter(prefix="/api/workspace", tags=["workspace"])

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


def _get_session_workspace(session_id: str) -> Path:
    workspace = Path(settings.WORKSPACE_ROOT) / session_id
    (workspace / "uploads").mkdir(parents=True, exist_ok=True)
    (workspace / "outputs").mkdir(parents=True, exist_ok=True)
    return workspace


async def _check_session_owner(session_id: str, current_user: User, db: AsyncSession) -> None:
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")
    if session.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问此会话")


@router.post("/{session_id}/upload")
async def upload_file(
    session_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """上传文件到会话工作区的 uploads/ 目录"""
    await _check_session_owner(session_id, current_user, db)

    workspace = _get_session_workspace(session_id)
    uploads_dir = workspace / "uploads"

    # 读取文件内容（限制大小）
    content = await file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail="文件超过 50MB 限制")

    # 安全文件名：去掉路径分隔符
    safe_name = Path(file.filename).name if file.filename else "upload"
    dest = uploads_dir / safe_name

    # 若同名文件存在，自动重命名
    if dest.exists():
        stem = dest.stem
        suffix = dest.suffix
        counter = 1
        while dest.exists():
            dest = uploads_dir / f"{stem}_{counter}{suffix}"
            counter += 1

    dest.write_bytes(content)

    return {
        "filename": dest.name,
        "path": f"uploads/{dest.name}",
        "size": len(content),
        "content_type": file.content_type,
    }


@router.get("/{session_id}/files")
async def list_files(
    session_id: str,
    folder: str = "",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出会话工作区的文件（folder: 'uploads' | 'outputs' | '' 表示全部）"""
    await _check_session_owner(session_id, current_user, db)

    workspace = _get_session_workspace(session_id)
    folders = ["uploads", "outputs"] if not folder else [folder]

    result = []
    for f in folders:
        d = workspace / f
        if not d.is_dir():
            continue
        for item in sorted(d.iterdir()):
            if item.is_file():
                stat = item.stat()
                result.append({
                    "name": item.name,
                    "path": f"{f}/{item.name}",
                    "folder": f,
                    "size": stat.st_size,
                    "modified_at": stat.st_mtime,
                })

    return {"session_id": session_id, "files": result}


@router.get("/{session_id}/projects")
async def list_projects(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出 outputs/projects/ 下的所有项目目录"""
    await _check_session_owner(session_id, current_user, db)

    workspace = _get_session_workspace(session_id)
    projects_dir = workspace / "outputs" / "projects"

    result = []
    if projects_dir.is_dir():
        for item in sorted(projects_dir.iterdir()):
            if item.is_dir():
                # 统计文件数和总大小
                file_count = 0
                total_size = 0
                for f in item.rglob("*"):
                    if f.is_file():
                        file_count += 1
                        total_size += f.stat().st_size
                result.append({
                    "name": item.name,
                    "path": f"outputs/projects/{item.name}",
                    "file_count": file_count,
                    "total_size": total_size,
                })

    return {"session_id": session_id, "projects": result}


@router.get("/{session_id}/tree")
async def get_tree(
    session_id: str,
    path: str = "outputs/projects",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取指定目录的树形结构（递归）"""
    await _check_session_owner(session_id, current_user, db)

    workspace = _get_session_workspace(session_id).resolve()
    target = (workspace / path).resolve()

    # 安全检查：必须在 workspace 内
    if not target.is_relative_to(workspace):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="路径越界")
    if not target.is_dir():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="目录不存在")

    def _build_tree(directory: Path, rel_base: Path) -> list:
        entries = []
        for item in sorted(directory.iterdir(), key=lambda x: (x.is_file(), x.name)):
            rel_path = str(item.relative_to(rel_base))
            if item.is_dir():
                entries.append({
                    "name": item.name,
                    "path": rel_path,
                    "type": "dir",
                    "children": _build_tree(item, rel_base),
                })
            else:
                entries.append({
                    "name": item.name,
                    "path": rel_path,
                    "type": "file",
                    "size": item.stat().st_size,
                })
        return entries

    return {
        "session_id": session_id,
        "root": path,
        "entries": _build_tree(target, workspace),
    }


@router.get("/{session_id}/download")
async def download_by_path(
    session_id: str,
    path: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """通过相对路径下载工作区文件（支持嵌套目录）"""
    await _check_session_owner(session_id, current_user, db)

    workspace = _get_session_workspace(session_id).resolve()
    file_path = (workspace / path).resolve()

    # 安全检查：必须在 workspace 内
    if not file_path.is_relative_to(workspace):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="路径越界")
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")

    media_type, _ = mimetypes.guess_type(str(file_path))
    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type=media_type or "application/octet-stream",
    )


@router.get("/{session_id}/files/{folder}/{filename}")
async def download_file(
    session_id: str,
    folder: str,
    filename: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """下载工作区文件（folder: uploads | outputs）"""
    await _check_session_owner(session_id, current_user, db)

    if folder not in ("uploads", "outputs"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的目录")

    workspace = _get_session_workspace(session_id)
    file_path = workspace / folder / Path(filename).name  # Path.name 防止路径穿越

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")

    media_type, _ = mimetypes.guess_type(str(file_path))
    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type=media_type or "application/octet-stream",
    )


@router.delete("/{session_id}/files/{folder}/{filename}")
async def delete_file(
    session_id: str,
    folder: str,
    filename: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除工作区文件"""
    await _check_session_owner(session_id, current_user, db)

    if folder not in ("uploads", "outputs"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的目录")

    workspace = _get_session_workspace(session_id)
    file_path = workspace / folder / Path(filename).name

    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")

    file_path.unlink()
    return {"status": "success", "message": f"{folder}/{filename} 已删除"}
