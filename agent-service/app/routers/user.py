"""
用户管理路由
"""
import os
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import List, Optional

from app.database.session import get_db
from app.crud.user import user_crud
from app.schemas.user import UserCreate, UserUpdate, UserResponse, UserWithSessions
from app.core.config import settings
from app.core.deps import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)

AVATAR_DIR = os.path.join(settings.WORKSPACE_ROOT, "avatars")
os.makedirs(AVATAR_DIR, exist_ok=True)

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
):
    """获取当前登录用户信息（通过 JWT token）"""
    return current_user


class PreferencesUpdate(BaseModel):
    approval_mode: Optional[str] = Field(None, pattern=r"^(default|auto|custom)$")
    tool_allowlist: Optional[List[str]] = None
    tool_denylist: Optional[List[str]] = None


@router.get("/me/preferences")
async def get_preferences(
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的审批偏好"""
    if current_user.preferences:
        try:
            return json.loads(current_user.preferences)
        except (json.JSONDecodeError, TypeError):
            pass
    return {"approval_mode": "default", "tool_allowlist": [], "tool_denylist": []}


@router.put("/me/preferences")
async def update_preferences(
    body: PreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新当前用户的审批偏好"""
    existing = {}
    if current_user.preferences:
        try:
            existing = json.loads(current_user.preferences)
        except (json.JSONDecodeError, TypeError):
            existing = {}

    update_data = body.model_dump(exclude_unset=True)
    existing.update(update_data)

    await user_crud.update(db, current_user.user_id, UserUpdate(preferences=existing))
    return existing


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    创建新用户
    
    - **device_id**: 必填，Android 设备ID
    - **user_id**: 可选，不提供则自动生成 UUID
    - **username**: 可选，用户名
    - **device_model**: 可选，设备型号
    - **preferences**: 可选，用户偏好设置（JSON格式）
    """
    # 检查设备ID是否已存在
    existing_user = await user_crud.get_by_device_id(db, user_in.device_id)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Device ID {user_in.device_id} already registered"
        )
    
    user = await user_crud.create(db, user_in)
    return user


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db)
):
    """根据 user_id 获取用户信息"""
    user = await user_crud.get_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found"
        )
    return user


@router.get("/{user_id}/with-sessions", response_model=UserWithSessions)
async def get_user_with_sessions(
    user_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取用户及其所有会话"""
    user = await user_crud.get_with_sessions(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found"
        )
    return user


@router.get("/device/{device_id}", response_model=UserResponse)
async def get_user_by_device(
    device_id: str,
    db: AsyncSession = Depends(get_db)
):
    """根据设备ID获取用户"""
    user = await user_crud.get_by_device_id(db, device_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device {device_id} not found"
        )
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_update: UserUpdate,
    db: AsyncSession = Depends(get_db)
):
    """更新用户信息"""
    user = await user_crud.get_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found"
        )
    
    updated_user = await user_crud.update(db, user_id, user_update)
    return updated_user


@router.post("/{user_id}/active")
async def update_last_active(
    user_id: str,
    db: AsyncSession = Depends(get_db)
):
    """更新用户最后活跃时间"""
    user = await user_crud.get_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found"
        )
    
    await user_crud.update_last_active(db, user_id)
    return {"status": "success", "message": "Last active time updated"}


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    hard_delete: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """
    删除用户
    
    - **hard_delete**: False 为软删除（默认），True 为硬删除
    """
    user = await user_crud.get_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found"
        )
    
    if hard_delete:
        success = await user_crud.hard_delete(db, user_id)
    else:
        success = await user_crud.delete(db, user_id)
    
    if success:
        return {"status": "success", "message": f"User {user_id} deleted"}
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete user"
        )


@router.post("/{user_id}/avatar")
async def upload_avatar(
    user_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """上传用户头像"""
    user = await user_crud.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")

    # 验证文件类型
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="仅支持 JPEG/PNG/WebP/GIF 格式")

    # 保存文件
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    filename = f"{user_id}.{ext}"
    filepath = os.path.join(AVATAR_DIR, filename)

    # 删除旧头像
    if user.avatar:
        old_path = os.path.join(AVATAR_DIR, user.avatar)
        if os.path.exists(old_path):
            os.remove(old_path)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    # 更新数据库
    user.avatar = filename
    await db.commit()

    logger.info(f"✓ 用户 {user_id} 上传头像: {filename}")
    return {"status": "success", "avatar": filename}


@router.get("/{user_id}/avatar")
async def get_avatar(user_id: str, db: AsyncSession = Depends(get_db)):
    """获取用户头像"""
    user = await user_crud.get_by_id(db, user_id)
    if not user or not user.avatar:
        raise HTTPException(status_code=404, detail="头像不存在")

    filepath = os.path.join(AVATAR_DIR, user.avatar)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="头像文件不存在")

    return FileResponse(filepath)


@router.get("/", response_model=List[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    is_active: bool = None,
    db: AsyncSession = Depends(get_db)
):
    """获取用户列表"""
    users = await user_crud.get_all(db, skip=skip, limit=limit, is_active=is_active)
    return users
