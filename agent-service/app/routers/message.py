"""
消息管理路由
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.database.session import get_db
from app.crud.message import message_crud
from app.crud.session import session_crud
from app.schemas.message import MessageCreate, MessageResponse

router = APIRouter(prefix="/api/messages", tags=["messages"])


@router.post("/", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    message_in: MessageCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    创建新消息
    
    - **session_id**: 必填，会话ID
    - **role**: 必填，角色（user/assistant/system）
    - **content**: 必填，消息内容
    - **extra_data**: 可选，额外元数据
    """
    # 检查会话是否存在
    session = await session_crud.get_by_id(db, message_in.session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {message_in.session_id} not found"
        )
    
    message = await message_crud.create(db, message_in)
    return message


@router.get("/{message_id}", response_model=MessageResponse)
async def get_message(
    message_id: str,
    db: AsyncSession = Depends(get_db)
):
    """根据 message_id 获取消息"""
    message = await message_crud.get_by_id(db, message_id)
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Message {message_id} not found"
        )
    return message


@router.get("/session/{session_id}", response_model=List[MessageResponse])
async def get_session_messages(
    session_id: str,
    skip: int = 0,
    limit: int = 100,
    role: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    获取会话的所有消息
    
    - **role**: 可选，筛选特定角色的消息（user/assistant/system）
    """
    # 检查会话是否存在
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    messages = await message_crud.get_by_session(
        db, session_id, skip=skip, limit=limit, role=role
    )
    return messages


@router.get("/session/{session_id}/latest", response_model=List[MessageResponse])
async def get_latest_messages(
    session_id: str,
    count: int = 10,
    db: AsyncSession = Depends(get_db)
):
    """获取会话最新的 N 条消息"""
    # 检查会话是否存在
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    messages = await message_crud.get_latest_messages(db, session_id, count)
    return messages


@router.get("/session/{session_id}/history")
async def get_conversation_history(
    session_id: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """
    获取会话历史（格式化为对话格式）
    
    返回格式适用于传递给 LLM
    """
    # 检查会话是否存在
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    history = await message_crud.get_conversation_history(db, session_id, limit)
    return {"session_id": session_id, "messages": history}


@router.get("/session/{session_id}/search", response_model=List[MessageResponse])
async def search_messages(
    session_id: str,
    keyword: str,
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """在会话中搜索消息"""
    # 检查会话是否存在
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    messages = await message_crud.search_by_content(db, session_id, keyword, limit)
    return messages


@router.delete("/{message_id}")
async def delete_message(
    message_id: str,
    db: AsyncSession = Depends(get_db)
):
    """删除消息"""
    message = await message_crud.get_by_id(db, message_id)
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Message {message_id} not found"
        )
    
    success = await message_crud.delete(db, message_id)
    if success:
        return {"status": "success", "message": f"Message {message_id} deleted"}
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete message"
        )


@router.delete("/session/{session_id}/all")
async def delete_session_messages(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """删除会话的所有消息"""
    # 检查会话是否存在
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    deleted_count = await message_crud.delete_by_session(db, session_id)
    return {
        "status": "success",
        "message": f"Deleted {deleted_count} messages from session {session_id}"
    }
