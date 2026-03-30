"""
聊天对话路由 - 核心对话接口
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import Optional
import logging

from app.database.session import get_db
from app.crud.user import user_crud
from app.crud.session import session_crud
from app.crud.message import message_crud
from app.schemas.message import MessageCreate
from app.agent.service.agent_service import get_agent_service

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    """聊天请求"""
    user_id: str = Field(..., description="用户ID")
    message: str = Field(..., description="用户消息")
    session_id: Optional[str] = Field(None, description="会话ID（不提供则创建新会话）")
    device_id: Optional[str] = Field(None, description="设备ID（用于创建用户）")


class ChatResponse(BaseModel):
    """聊天响应"""
    session_id: str
    user_message_id: str
    assistant_response: str
    is_new_session: bool


@router.post("/", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    聊天接口 - 核心对话功能
    
    流程:
    1. 验证/创建用户
    2. 获取/创建会话
    3. 保存用户消息
    4. 调用 AgentService 生成回复（内部自动保存 tool + assistant 消息）
    5. 返回结果
    """
    is_new_session = False
    
    # 步骤 1: 验证用户是否存在
    user = await user_crud.get_by_id(db, request.user_id)
    if not user:
        # 如果用户不存在且提供了 device_id，自动创建用户
        if request.device_id:
            from app.schemas.user import UserCreate
            user_create = UserCreate(
                user_id=request.user_id,
                device_id=request.device_id
            )
            user = await user_crud.create(db, user_create)
            logger.info(f"✓ 新用户已创建: {request.user_id}")
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User {request.user_id} not found. Please provide device_id to create user."
            )
    
    # 更新用户最后活跃时间
    await user_crud.update_last_active(db, request.user_id)
    
    # 步骤 2: 获取或创建会话
    if request.session_id:
        # 使用指定的会话
        session = await session_crud.get_by_id(db, request.session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Session {request.session_id} not found"
            )
        # 验证会话是否属于该用户
        if session.user_id != request.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Session does not belong to this user"
            )
    else:
        # 创建新会话
        from app.schemas.session import SessionCreate
        from datetime import datetime
        session_create = SessionCreate(
            title=f"Chat at {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
        )
        session = await session_crud.create(db, session_create, request.user_id)
        is_new_session = True
        logger.info(f"✓ 新会话已创建: {session.session_id}")
    
    # 步骤 3: 保存用户消息
    user_message_create = MessageCreate(
        session_id=session.session_id,
        role="user",
        content=request.message
    )
    user_message = await message_crud.create(db, user_message_create)
    logger.info(f"💬 用户消息已保存: {user_message.message_id}")
    
    # 步骤 4: 调用 AgentService 生成回复
    # 获取历史消息（用于上下文）
    history = await message_crud.get_conversation_history(
        db, 
        session.session_id, 
        limit=20  # 最近 20 条消息作为上下文
    )
    
    try:
        # 获取 AgentService 实例
        agent_service = get_agent_service()
        
        # 检查 Agent 是否就绪
        if not agent_service.is_ready():
            logger.warning("⚠️ AgentService 未就绪，返回降级响应")
            assistant_response = "抱歉，AI 助手暂时不可用。请稍后重试。"
            # 手动保存降级响应
            fallback_message = MessageCreate(
                session_id=session.session_id,
                role="assistant",
                content=assistant_response
            )
            await message_crud.create(db, fallback_message)
        else:
            # 调用 Agent 处理消息
            # 注意：AgentService 内部会自动保存 tool messages 和 assistant message
            assistant_response = await agent_service.process_message(
                db=db,
                session_id=session.session_id,
                user_message=request.message,
                history=history
            )
            logger.info(f"🤖 Agent 响应已生成 ({len(assistant_response)} 字符)")
    
    except Exception as e:
        logger.error(f"❌ Agent 处理失败: {e}", exc_info=True)
        assistant_response = f"处理消息时发生错误: {str(e)}"
        # 保存错误响应
        error_message = MessageCreate(
            session_id=session.session_id,
            role="assistant",
            content=assistant_response
        )
        await message_crud.create(db, error_message)
    
    # 步骤 5: 返回结果
    return ChatResponse(
        session_id=session.session_id,
        user_message_id=user_message.message_id,
        assistant_response=assistant_response,
        is_new_session=is_new_session
    )


@router.get("/{session_id}/history")
async def get_chat_history(
    session_id: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """获取聊天历史"""
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    history = await message_crud.get_conversation_history(db, session_id, limit)
    
    return {
        "session_id": session_id,
        "title": session.title,
        "message_count": len(history),
        "messages": history
    }


@router.get("/status")
async def get_agent_status():
    """获取 Agent 服务状态"""
    agent_service = get_agent_service()
    return agent_service.get_status()
