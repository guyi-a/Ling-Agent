"""
聊天对话路由 - 核心对话接口（需要 JWT 认证）
"""
import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import Optional, AsyncIterator, List, Dict, Any
import logging

from app.core.approval import resolve_approval, add_to_allowlist

from app.database.session import get_db, AsyncSessionLocal
from app.crud.session import session_crud
from app.crud.message import message_crud
from app.crud.user import user_crud

from app.schemas.message import MessageCreate
from app.agent.service.agent_service import get_agent_service
from app.agent.service.event_buffer import stream_buffers
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger(__name__)

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
}


def _validate_attachments(attachments: List[Dict[str, Any]]) -> bool:
    """验证附件列表的安全性"""
    if not attachments:
        return True

    for att in attachments:
        att_type = att.get("type")
        att_path = att.get("path", "")

        if att_type not in ["image", "file"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid attachment type: {att_type}"
            )
        if ".." in att_path or att_path.startswith("/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid attachment path: path traversal detected"
            )
        allowed_prefixes = ["uploads/", "outputs/"]
        if not any(att_path.startswith(prefix) for prefix in allowed_prefixes):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Attachment path must start with 'uploads/' or 'outputs/': {att_path}"
            )

    return True


class ChatRequest(BaseModel):
    """聊天请求"""
    message: str = Field(..., description="用户消息")
    session_id: Optional[str] = Field(None, description="会话ID（不提供则自动创建新会话）")
    attachments: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="附件列表（图片等），格式: [{type: 'image', path: 'uploads/img.png'}]"
    )


class ChatResponse(BaseModel):
    """聊天响应"""
    session_id: str
    user_message_id: str
    assistant_response: str
    is_new_session: bool


async def _prepare_session(request: ChatRequest, current_user: User, db: AsyncSession):
    """公共逻辑：获取或创建会话，保存用户消息，返回 (session, user_message, history, is_new)"""
    _validate_attachments(request.attachments)

    is_new_session = False
    await user_crud.update_last_active(db, current_user.user_id)

    if request.session_id:
        session = await session_crud.get_by_id(db, request.session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")
        if session.user_id != current_user.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问此会话")
        # 会话标题为空时（如粘贴图片自动创建的），用第一条消息补标题
        if not session.title:
            title = request.message[:30] + "..." if len(request.message) > 30 else request.message
            from app.schemas.session import SessionUpdate
            await session_crud.update(db, session.session_id, SessionUpdate(title=title))
            session.title = title
    else:
        from app.schemas.session import SessionCreate
        title = request.message[:30] + "..." if len(request.message) > 30 else request.message
        session = await session_crud.create(
            db,
            SessionCreate(title=title),
            current_user.user_id
        )
        is_new_session = True

    extra_data = {}
    if request.attachments:
        extra_data["attachments"] = request.attachments
        logger.info(
            f"💬 用户消息包含 {len(request.attachments)} 个附件 "
            f"(session: {session.session_id[:8]}...)"
        )

    user_message = await message_crud.create(db, MessageCreate(
        session_id=session.session_id,
        role="user",
        content=request.message,
        extra_data=extra_data if extra_data else None
    ))
    history = await message_crud.get_conversation_history(db, session.session_id, limit=50)
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
                history=history,
                attachments=request.attachments
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


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------

def _sse(event: str, data: dict) -> str:
    """格式化 SSE 事件为已编码的字符串"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _map_chunk_to_sse(chunk: dict) -> str:
    """将 agent_service.stream_message() 的 chunk 映射并编码为 SSE 字符串"""
    chunk_type = chunk.get("type")
    if chunk_type == "token":
        return _sse("token", {"text": chunk["text"]})
    elif chunk_type == "model_start":
        return _sse("model_start", {})
    elif chunk_type == "tool_start":
        return _sse("tool_start", {"tool_name": chunk["tool_name"], "tool_input": chunk.get("tool_input", {})})
    elif chunk_type == "tool_end":
        return _sse("tool_end", {"tool_name": chunk["tool_name"], "tool_output": chunk.get("tool_output", "")})
    elif chunk_type == "tool_generating":
        return _sse("tool_generating", {"tool_name": chunk["tool_name"]})
    elif chunk_type == "approval_required":
        return _sse("approval_required", {
            "request_id": chunk["request_id"],
            "tool_name": chunk["tool_name"],
            "tool_input": chunk.get("tool_input", {}),
        })
    elif chunk_type == "handoff":
        return _sse("handoff", {"to": chunk["to"], "direction": chunk.get("direction", "to")})
    elif chunk_type == "approval_rejected":
        return _sse("approval_rejected", {"tool_name": chunk["tool_name"]})
    elif chunk_type == "cancelled":
        return _sse("cancelled", {"text": chunk.get("text", "")})
    elif chunk_type == "compacting":
        return _sse("compacting", {})
    elif chunk_type == "compacting_done":
        return _sse("compacting_done", {})
    elif chunk_type == "done":
        return _sse("done", {"assistant_message_id": chunk.get("assistant_message_id")})
    else:
        return _sse(chunk_type or "unknown", chunk)


# ---------------------------------------------------------------------------
# SSE streaming endpoints
# ---------------------------------------------------------------------------

@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """SSE 流式聊天接口。Agent 在后台 task 中执行，事件写入 StreamBuffer。"""
    session, user_message, history, is_new_session = await _prepare_session(request, current_user, db)

    # 如果同一 session 已有活跃流，直接返回 stream_all
    if stream_buffers.is_streaming(session.session_id):
        buffer = stream_buffers.get(session.session_id)
        return StreamingResponse(
            buffer.stream_all(),
            media_type="text/event-stream",
            headers=SSE_HEADERS,
        )

    agent_service = get_agent_service()
    buffer = stream_buffers.create(session.session_id)

    # 推送 session 元信息作为第一个 chunk
    buffer.append(_sse("session", {
        "session_id": session.session_id,
        "user_message_id": user_message.message_id,
        "is_new_session": is_new_session,
    }))

    if not agent_service.is_ready():
        buffer.append(_sse("token", {"text": "抱歉，AI 助手暂时不可用，请稍后重试。"}))
        buffer.append(_sse("done", {}))
        buffer.finish()
    else:
        # 后台任务运行 Agent，事件写入 buffer
        async def run_agent():
            async with AsyncSessionLocal() as agent_db:
                try:
                    async for chunk in agent_service.stream_message(
                        db=agent_db,
                        session_id=session.session_id,
                        user_message=request.message,
                        history=history,
                        attachments=request.attachments,
                        user_id=current_user.user_id,
                    ):
                        # 内部标记：DB 保存点，不发给前端
                        if chunk.get("type") == "_save_point":
                            buffer.mark_save_point()
                            continue
                        # 追踪间隙文本（token 类型）
                        if chunk.get("type") == "token":
                            buffer.append_gap_text(chunk["text"])
                        buffer.append(_map_chunk_to_sse(chunk))
                except asyncio.CancelledError:
                    try:
                        buffer.append(_sse("cancelled", {"text": "生成已被停止"}))
                    except Exception:
                        pass
                except Exception as e:
                    logger.error(f"Background agent error: {e}", exc_info=True)
                    buffer.append(_sse("error", {"message": str(e)}))
                finally:
                    buffer.finish()
                    stream_buffers.remove(session.session_id)

        task = asyncio.create_task(run_agent())
        buffer.set_task(task)

    return StreamingResponse(
        buffer.stream_all(),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@router.get("/{session_id}/resume")
async def resume_stream(
    session_id: str,
    subscribe_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """重连端点。subscribe_only=true 只订阅新事件（配合 DB 历史使用），否则回放完整流。无活跃流返回 204。"""
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")
    if session.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问此会话")

    if not stream_buffers.is_streaming(session_id):
        return Response(status_code=204)

    buffer = stream_buffers.get(session_id)
    if subscribe_only:
        # subscribe 模式：只注入待审批事件，然后订阅新事件。
        # 不注入 gap_text：前端通过 loadSessionHistory 已加载 DB 历史，
        # 重复注入 gap_text 会导致同一内容在多次重连时被追加多次。
        async def _subscribe_with_catchup():
            # 注入待审批事件（如果有）
            pending = buffer._pending_approval_chunk
            if pending:
                yield pending
            # 订阅后续新事件
            async for chunk in buffer.subscribe():
                yield chunk
        stream = _subscribe_with_catchup()
    else:
        stream = buffer.stream_all()
    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


class ApprovalRequest(BaseModel):
    request_id: str
    approved: bool
    always_allow: bool = False
    tool_name: Optional[str] = None


@router.post("/approve")
async def approve_tool(
    body: ApprovalRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """工具审批接口：前端用户点击允许/拒绝后调用"""
    found = resolve_approval(body.request_id, body.approved)
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="审批请求不存在或已超时"
        )

    if body.approved and body.always_allow and body.tool_name:
        import json
        existing = {}
        if current_user.preferences:
            try:
                existing = json.loads(current_user.preferences)
            except (json.JSONDecodeError, TypeError):
                existing = {}
        new_prefs = add_to_allowlist(existing, body.tool_name)
        from app.schemas.user import UserUpdate
        await user_crud.update(db, current_user.user_id, UserUpdate(preferences=new_prefs))

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
    session = await session_crud.get_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")
    if session.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问此会话")

    # 优先用 buffer.cancel() 取消后台任务
    buffer = stream_buffers.get(session_id)
    if buffer and buffer.cancel():
        return {"status": "ok", "message": "生成已停止"}

    # 兜底：通过 agent_service 取消
    agent_service = get_agent_service()
    cancelled = agent_service.cancel_session(session_id)
    if cancelled:
        return {"status": "ok", "message": "生成已停止"}

    return {"status": "not_running", "message": "该会话当前没有正在执行的任务"}
