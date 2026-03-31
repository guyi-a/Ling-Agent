"""
消息管理路由（需要 JWT 认证）
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.database.session import get_db
from app.crud.message import message_crud
from app.crud.session import session_crud
from app.schemas.message import MessageResponse
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/messages", tags=["messages"])


async def _check_session_owner(session_id: str, current_user: User, db: AsyncSession):
    """验证会话所属用户"""
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")
    if session.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问此会话")
    return session


@router.get("/session/{session_id}", response_model=List[MessageResponse])
async def get_session_messages(
    session_id: str,
    skip: int = 0,
    limit: int = 100,
    role: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取会话的所有消息（需要登录）"""
    await _check_session_owner(session_id, current_user, db)
    return await message_crud.get_by_session(db, session_id, skip=skip, limit=limit, role=role)


@router.get("/session/{session_id}/latest", response_model=List[MessageResponse])
async def get_latest_messages(
    session_id: str,
    count: int = 10,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取会话最新 N 条消息（需要登录）"""
    await _check_session_owner(session_id, current_user, db)
    return await message_crud.get_latest_messages(db, session_id, count)


@router.get("/session/{session_id}/history")
async def get_conversation_history(
    session_id: str,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取前端展示用的对话历史（只含 user/assistant 可见消息）"""
    await _check_session_owner(session_id, current_user, db)
    # 直接从 DB 取原始消息，过滤掉 tool 消息和无文字内容的 assistant 消息
    raw = await message_crud.get_by_session(db, session_id, skip=0, limit=limit)
    messages = [
        {"role": m.role, "content": m.content}
        for m in raw
        if m.role in ("user", "assistant") and (m.content or "").strip()
    ]
    return {"session_id": session_id, "messages": messages}


@router.get("/session/{session_id}/search", response_model=List[MessageResponse])
async def search_messages(
    session_id: str,
    keyword: str,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """搜索会话中的消息（需要登录）"""
    await _check_session_owner(session_id, current_user, db)
    return await message_crud.search_by_content(db, session_id, keyword, limit)


@router.get("/{message_id}", response_model=MessageResponse)
async def get_message(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取单条消息（需要登录）"""
    message = await message_crud.get_by_id(db, message_id)
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="消息不存在")
    # 验证消息所属会话
    await _check_session_owner(message.session_id, current_user, db)
    return message


@router.delete("/{message_id}")
async def delete_message(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """删除消息（需要登录）"""
    message = await message_crud.get_by_id(db, message_id)
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="消息不存在")
    await _check_session_owner(message.session_id, current_user, db)
    await message_crud.delete(db, message_id)
    return {"status": "success", "message": f"消息 {message_id} 已删除"}
