"""
聊天对话路由 - 核心对话接口（需要 JWT 认证）
"""
import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import Optional, AsyncIterator
from datetime import datetime
import logging

from app.core.approval import resolve_approval

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


async def _prepare_session(request: ChatRequest, current_user: User, db: AsyncSession):
    """公共逻辑：获取或创建会话，保存用户消息，返回 (session, user_message, history, is_new)"""
    is_new_session = False
    await user_crud.update_last_active(db, current_user.user_id)

    if request.session_id:
        session = await session_crud.get_by_id(db, request.session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")
        if session.user_id != current_user.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问此会话")
    else:
        from app.schemas.session import SessionCreate
        from zoneinfo import ZoneInfo
        session = await session_crud.create(
            db,
            SessionCreate(title=f"Chat at {datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d %H:%M')}"),
            current_user.user_id
        )
        is_new_session = True

    user_message = await message_crud.create(db, MessageCreate(
        session_id=session.session_id,
        role="user",
        content=request.message
    ))
    history = await message_crud.get_conversation_history(db, session.session_id, limit=20)
    return session, user_message, history, is_new_session


@router.post("/", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """聊天接口（非流式，保留兼容）"""
    session, user_message, history, is_new_session = await _prepare_session(request, current_user, db)

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
    except Exception as e:
        logger.error(f"❌ Agent 处理失败: {e}", exc_info=True)
        assistant_response = "处理消息时发生错误，请稍后重试。"
        await message_crud.create(db, MessageCreate(
            session_id=session.session_id, role="assistant", content=assistant_response
        ))

    return ChatResponse(
        session_id=session.session_id,
        user_message_id=user_message.message_id,
        assistant_response=assistant_response,
        is_new_session=is_new_session
    )


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """SSE 流式聊天接口"""
    session, user_message, history, is_new_session = await _prepare_session(request, current_user, db)

    agent_service = get_agent_service()

    def sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    async def generate() -> AsyncIterator[str]:
        # 先推送会话元信息
        yield sse("session", {
            "session_id": session.session_id,
            "user_message_id": user_message.message_id,
            "is_new_session": is_new_session
        })

        if not agent_service.is_ready():
            yield sse("token", {"text": "抱歉，AI 助手暂时不可用，请稍后重试。"})
            yield sse("done", {})
            return

        try:
            async for chunk in agent_service.stream_message(
                db=db,
                session_id=session.session_id,
                user_message=request.message,
                history=history
            ):
                chunk_type = chunk.get("type")
                if chunk_type == "token":
                    yield sse("token", {"text": chunk["text"]})
                elif chunk_type == "model_start":
                    yield sse("model_start", {})
                elif chunk_type == "tool_start":
                    yield sse("tool_start", {"tool_name": chunk["tool_name"]})
                elif chunk_type == "tool_end":
                    yield sse("tool_end", {"tool_name": chunk["tool_name"]})
                elif chunk_type == "approval_required":
                    yield sse("approval_required", {
                        "request_id": chunk["request_id"],
                        "tool_name": chunk["tool_name"],
                        "tool_input": chunk.get("tool_input", {}),
                    })
                elif chunk_type == "approval_rejected":
                    yield sse("approval_rejected", {"tool_name": chunk["tool_name"]})
                elif chunk_type == "done":
                    yield sse("done", {})
        except Exception as e:
            logger.error(f"SSE stream error: {e}", exc_info=True)
            yield sse("error", {"message": str(e)})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


class ApprovalRequest(BaseModel):
    request_id: str
    approved: bool


@router.post("/approve")
async def approve_tool(
    body: ApprovalRequest,
    current_user: User = Depends(get_current_user),
):
    """工具审批接口：前端用户点击允许/拒绝后调用"""
    found = resolve_approval(body.request_id, body.approved)
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="审批请求不存在或已超时"
        )
    return {"status": "ok", "approved": body.approved}


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


@router.post("/{session_id}/stop")
async def stop_generation(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """停止指定会话的 Agent 生成（需要登录）"""
    # 验证会话权限
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")
    if session.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问此会话")

    # 尝试取消 Agent 执行
    agent_service = get_agent_service()
    cancelled = agent_service.cancel_session(session_id)

    if cancelled:
        return {"status": "ok", "message": "生成已停止"}
    else:
        return {"status": "not_running", "message": "该会话当前没有正在执行的任务"}
