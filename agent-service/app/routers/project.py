"""
项目管理路由（需要 JWT 认证）
"""
import mimetypes
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.config import settings

from app.database.session import get_db
from app.crud.project import project_crud
from app.schemas.project import (
    ProjectCreate, ProjectUpdate, ProjectResponse,
    ProjectDetail, SessionBrief, AdhocSessionResponse,
)
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取当前用户所有已物化的项目"""
    rows = await project_crud.get_materialized_by_user(db, current_user.user_id)
    results = []
    for row in rows:
        project = row["project"]
        results.append(ProjectResponse(
            id=project.id,
            slug=project.slug,
            title=project.title,
            description=project.description,
            icon=project.icon,
            user_id=project.user_id,
            created_at=project.created_at,
            updated_at=project.updated_at,
            session_count=row["session_count"],
            last_active_at=row["last_active_at"],
        ))
    return results


@router.get("/adhoc", response_model=List[AdhocSessionResponse])
async def list_adhoc_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取当前用户所有临时对话（未物化项目下的会话）"""
    rows = await project_crud.get_adhoc_sessions_by_user(db, current_user.user_id)
    results = []
    for row in rows:
        session = row["session"]
        results.append(AdhocSessionResponse(
            session_id=session.session_id,
            project_id=row["project_id"],
            title=session.title,
            updated_at=session.updated_at,
        ))
    return results


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_in: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建项目"""
    project = await project_crud.create(db, project_in, current_user.user_id)
    return ProjectResponse(
        id=project.id,
        slug=project.slug,
        title=project.title,
        description=project.description,
        icon=project.icon,
        user_id=project.user_id,
        created_at=project.created_at,
        updated_at=project.updated_at,
        session_count=0,
        last_active_at=None,
    )


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取项目详情（含会话列表）"""
    project = await project_crud.get_detail(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="无权访问此项目")

    sessions_sorted = sorted(project.sessions, key=lambda s: s.updated_at, reverse=True)
    return ProjectDetail(
        id=project.id,
        slug=project.slug,
        title=project.title,
        description=project.description,
        icon=project.icon,
        user_id=project.user_id,
        created_at=project.created_at,
        updated_at=project.updated_at,
        session_count=len(project.sessions),
        last_active_at=sessions_sorted[0].updated_at if sessions_sorted else None,
        sessions=[
            SessionBrief(
                session_id=s.session_id,
                title=s.title,
                updated_at=s.updated_at,
                is_pinned=s.is_pinned or False,
            )
            for s in sessions_sorted
            if s.is_active
        ],
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_update: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新项目信息"""
    project = await project_crud.get_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="无权修改此项目")

    updated = await project_crud.update(db, project_id, project_update)
    return ProjectResponse(
        id=updated.id,
        slug=updated.slug,
        title=updated.title,
        description=updated.description,
        icon=updated.icon,
        user_id=updated.user_id,
        created_at=updated.created_at,
        updated_at=updated.updated_at,
        session_count=0,
        last_active_at=None,
    )


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除项目（级联删除所有会话和工作区文件）"""
    project = await project_crud.get_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="无权删除此项目")

    success = await project_crud.delete(db, project_id)
    if success:
        return {"status": "success", "message": f"项目已删除"}
    raise HTTPException(status_code=500, detail="删除失败")


def _icon_dir() -> Path:
    d = Path(settings.WORKSPACE_ROOT) / ".icons"
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.post("/{project_id}/icon")
async def upload_icon(
    project_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """上传项目自定义图标"""
    project = await project_crud.get_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="无权修改此项目")

    content = await file.read(10 * 1024 * 1024 + 1)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="图片不超过 10MB")

    ext = Path(file.filename).suffix.lower() if file.filename else ".png"
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        raise HTTPException(status_code=400, detail="仅支持 PNG/JPG/WEBP/GIF")

    icon_path = _icon_dir() / f"{project_id}{ext}"
    for old in _icon_dir().glob(f"{project_id}.*"):
        old.unlink()
    icon_path.write_bytes(content)

    icon_value = f"__img__{ext}"
    from app.schemas.project import ProjectUpdate
    await project_crud.update(db, project_id, ProjectUpdate(icon=icon_value))

    return {"status": "success", "icon": icon_value}


@router.get("/{project_id}/icon")
async def get_icon(project_id: int):
    """获取项目自定义图标"""
    for f in _icon_dir().glob(f"{project_id}.*"):
        if f.is_file():
            media_type, _ = mimetypes.guess_type(str(f))
            return FileResponse(str(f), media_type=media_type or "image/png")
    raise HTTPException(status_code=404, detail="无自定义图标")


@router.post("/{project_id}/open")
async def open_project_in_finder(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """在系统文件管理器中打开项目工作区"""
    project = await project_crud.get_by_id(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="无权访问此项目")

    workspace = Path(settings.WORKSPACE_ROOT) / f"{project.id}_{project.slug}"
    if not workspace.is_dir():
        raise HTTPException(status_code=404, detail="工作区目录不存在")

    if sys.platform == "darwin":
        subprocess.Popen(["open", str(workspace)])
    elif sys.platform == "win32":
        subprocess.Popen(["explorer", str(workspace)])
    else:
        subprocess.Popen(["xdg-open", str(workspace)])

    return {"status": "success", "path": str(workspace)}
