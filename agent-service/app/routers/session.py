"""
会话管理路由
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.database.session import get_db
from app.crud.session import session_crud
from app.crud.user import user_crud
from app.schemas.session import SessionCreate, SessionUpdate, SessionResponse, SessionWithMessages

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("/", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    session_in: SessionCreate,
    user_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    创建新会话
    
    - **user_id**: 必填，用户ID（查询参数）
    - **title**: 可选，会话标题
    """
    # 检查用户是否存在
    user = await user_crud.get_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found"
        )
    
    session = await session_crud.create(db, session_in, user_id)
    return session


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """根据 session_id 获取会话"""
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    return session


@router.get("/{session_id}/with-messages", response_model=SessionWithMessages)
async def get_session_with_messages(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取会话及其所有消息"""
    session = await session_crud.get_with_messages(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    return session


@router.get("/user/{user_id}", response_model=List[SessionResponse])
async def get_user_sessions(
    user_id: str,
    skip: int = 0,
    limit: int = 50,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db)
):
    """获取用户的所有会话"""
    # 检查用户是否存在
    user = await user_crud.get_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found"
        )
    
    sessions = await session_crud.get_by_user(
        db, user_id, skip=skip, limit=limit, is_active=is_active
    )
    return sessions


@router.get("/user/{user_id}/latest", response_model=SessionResponse)
async def get_user_latest_session(
    user_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取用户最新的会话"""
    session = await session_crud.get_latest_by_user(db, user_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active session found for user {user_id}"
        )
    return session


@router.put("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: str,
    session_update: SessionUpdate,
    db: AsyncSession = Depends(get_db)
):
    """更新会话信息"""
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    updated_session = await session_crud.update(db, session_id, session_update)
    return updated_session


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    hard_delete: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """
    删除会话
    
    - **hard_delete**: False 为软删除（默认），True 为硬删除（会删除所有消息）
    """
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    if hard_delete:
        success = await session_crud.hard_delete(db, session_id)
    else:
        success = await session_crud.delete(db, session_id)
    
    if success:
        return {"status": "success", "message": f"Session {session_id} deleted"}
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete session"
        )
