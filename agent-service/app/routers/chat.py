"""
聊天对话路由 - 核心对话接口（需要 JWT 认证）
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import logging

from app.database.session import get_db
from app.crud.session import session_crud
from app.crud.message import message_crud
from app.crud.user import user_crud
from app.schemas.message import MessageCreate
from app.agent.service.agent_service import get_agent_service
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    """聊天请求"""
    message: str = Field(..., description="用户消息")
    session_id: Optional[str] = Field(None, description="会话ID（不提供则自动创建新会话）")


class ChatResponse(BaseModel):
    """聊天响应"""
    session_id: str
    user_message_id: str
    assistant_response: str
    is_new_session: bool


@router.post("/", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    聊天接口（需要登录）
    
    流程：
    1. JWT 认证 → 获取当前用户
    2. 获取/创建会话
    3. 保存用户消息
    4. 调用 AgentService 生成回复（内部自动保存 tool + assistant 消息）
    5. 返回结果
    """
    is_new_session = False

    # 更新用户最后活跃时间
    await user_crud.update_last_active(db, current_user.user_id)

    # 获取或创建会话
    if request.session_id:
        session = await session_crud.get_by_id(db, request.session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")
        if session.user_id != current_user.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问此会话")
    else:
        from app.schemas.session import SessionCreate
        session = await session_crud.create(
            db,
            SessionCreate(title=f"Chat at {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"),
            current_user.user_id
        )
        is_new_session = True
        logger.info(f"✓ 新会话已创建: {session.session_id}")

    # 保存用户消息
    user_message = await message_crud.create(db, MessageCreate(
        session_id=session.session_id,
        role="user",
        content=request.message
    ))
    logger.info(f"💬 用户消息已保存: {user_message.message_id}")

    # 获取历史消息作为上下文
    history = await message_crud.get_conversation_history(db, session.session_id, limit=20)

    # 调用 AgentService
    try:
        agent_service = get_agent_service()
        if not agent_service.is_ready():
            assistant_response = "抱歉，AI 助手暂时不可用，请稍后重试。"
            await message_crud.create(db, MessageCreate(
                session_id=session.session_id, role="assistant", content=assistant_response
            ))
        else:
            assistant_response = await agent_service.process_message(
                db=db,
                session_id=session.session_id,
                user_message=request.message,
                history=history
            )
            logger.info(f"🤖 Agent 响应已生成 ({len(assistant_response)} 字符)")
    except Exception as e:
        logger.error(f"❌ Agent 处理失败: {e}", exc_info=True)
        assistant_response = f"处理消息时发生错误，请稍后重试。"
        await message_crud.create(db, MessageCreate(
            session_id=session.session_id, role="assistant", content=assistant_response
        ))

    return ChatResponse(
        session_id=session.session_id,
        user_message_id=user_message.message_id,
        assistant_response=assistant_response,
        is_new_session=is_new_session
    )


@router.get("/status")
async def get_agent_status():
    """获取 Agent 服务状态（公开接口）"""
    return get_agent_service().get_status()


@router.get("/{session_id}/history")
async def get_chat_history(
    session_id: str,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取聊天历史（需要登录）"""
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")
    if session.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问此会话")

    history = await message_crud.get_conversation_history(db, session_id, limit)
    return {
        "session_id": session_id,
        "title": session.title,
        "message_count": len(history),
        "messages": history
    }
