"""
聊天对话路由 - 核心对话接口（需要 JWT 认证）

请求处理流程被拆成显式 Pipeline，定义在 app.agent.pipeline。
本模块只做：构造 PipelineContext → 跑 pipeline → 把 ctx 终态映射为 HTTP 响应。
"""
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.pipeline.context import PipelineContext
from app.agent.pipeline.stages import PREPARE_PIPELINE, STREAM_PIPELINE
from app.agent.service.agent_service import get_agent_service
from app.agent.service.event_buffer import stream_buffers
from app.core.approval import add_to_allowlist, resolve_approval
from app.core.deps import get_current_user
from app.crud.message import message_crud
from app.crud.session import session_crud
from app.crud.user import user_crud
from app.database.session import get_db
from app.models.user import User
from app.schemas.message import MessageCreate

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger(__name__)

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
}


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


def _build_ctx(request: ChatRequest, current_user: User, db: AsyncSession) -> PipelineContext:
    return PipelineContext(
        db=db,
        user=current_user,
        message=request.message,
        attachments=request.attachments,
        requested_session_id=request.session_id,
    )


@router.post("/", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """聊天接口（非流式，保留兼容）。复用 PREPARE_PIPELINE 完成会话/持久化/历史加载。"""
    ctx = _build_ctx(request, current_user, db)
    for stage in PREPARE_PIPELINE:
        await stage.apply(ctx)

    assert ctx.session is not None and ctx.user_message is not None

    try:
        agent_service = get_agent_service()
        if not agent_service.is_ready():
            assistant_response = "抱歉，AI 助手暂时不可用，请稍后重试。"
            await message_crud.create(db, MessageCreate(
                session_id=ctx.session.session_id,
                role="assistant",
                content=assistant_response,
            ))
        else:
            assistant_response = await agent_service.process_message(
                db=db,
                session_id=ctx.session.session_id,
                user_message=request.message,
                history=ctx.history,
                attachments=request.attachments,
            )
    except Exception as e:
        logger.error(f"❌ Agent 处理失败: {e}", exc_info=True)
        assistant_response = "处理消息时发生错误，请稍后重试。"
        await message_crud.create(db, MessageCreate(
            session_id=ctx.session.session_id,
            role="assistant",
            content=assistant_response,
        ))

    return ChatResponse(
        session_id=ctx.session.session_id,
        user_message_id=ctx.user_message.message_id,
        assistant_response=assistant_response,
        is_new_session=ctx.is_new_session,
    )


# ---------------------------------------------------------------------------
# SSE streaming endpoints
# ---------------------------------------------------------------------------

@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SSE 流式聊天接口。所有业务逻辑在 STREAM_PIPELINE 里。"""
    ctx = _build_ctx(request, current_user, db)
    for stage in STREAM_PIPELINE:
        await stage.apply(ctx)

    assert ctx.buffer is not None, "STREAM_PIPELINE 应由 StartAgentStage 填入 ctx.buffer"
    return StreamingResponse(
        ctx.buffer.stream_all(),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@router.get("/{session_id}/resume")
async def resume_stream(
    session_id: str,
    subscribe_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
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
            pending = buffer._pending_approval_chunk
            if pending:
                yield pending
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
            detail="审批请求不存在或已超时",
        )

    if body.approved and body.always_allow and body.tool_name:
        import json as _json
        existing = {}
        if current_user.preferences:
            try:
                existing = _json.loads(current_user.preferences)
            except (_json.JSONDecodeError, TypeError):
                existing = {}
        new_prefs = add_to_allowlist(existing, body.tool_name)
        from app.schemas.user import UserUpdate
        await user_crud.update(db, current_user.user_id, UserUpdate(preferences=new_prefs))

    return {"status": "ok", "approved": body.approved}


# ---------------------------------------------------------------------------
# Session history / status / stop
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/messages")
async def get_session_messages(
    session_id: str,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取会话历史消息（需要登录，仅限自己的会话）"""
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
        "messages": history,
    }


@router.post("/{session_id}/stop")
async def stop_generation(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
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


@router.get("/status")
async def get_agent_status():
    """获取 Agent 服务状态（公开接口）"""
    return get_agent_service().get_status()
