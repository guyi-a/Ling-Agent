"""
用户管理路由
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database.session import get_db
from app.crud.user import user_crud
from app.schemas.user import UserCreate, UserUpdate, UserResponse, UserWithSessions

router = APIRouter(prefix="/api/users", tags=["users"])


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
