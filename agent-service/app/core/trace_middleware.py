"""HTTP middleware：为每个请求注入 trace_context ContextVar。

职责分工：
- middleware 负责：request_id（兜底生成）+ user_id（从 JWT 解析）
- ResolveSessionStage 负责：session_id（会话对象确定后再设）

为什么不在 middleware 里解 session_id：
- session_id 在路径参数 / request body / 新建会话中有三种来源，
  middleware 层面准确提取成本高；
- Pipeline 自己知道 session 从哪来，由它设更直接。
"""
from __future__ import annotations

import logging
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.security import decode_token
from app.core.trace_context import (
    current_request_id,
    current_session_id,
    current_user_id,
)

logger = logging.getLogger(__name__)


class TraceContextMiddleware(BaseHTTPMiddleware):
    """为每个请求设置 ContextVar，请求结束后 reset。"""

    async def dispatch(self, request: Request, call_next) -> Response:
        # request_id: 优先用客户端传的，否则新生成
        req_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        req_tok = current_request_id.set(req_id)

        # user_id: best-effort 从 Authorization 里解析，失败就留 None
        user_tok = current_user_id.set(_extract_user_id(request))

        # session_id 每次请求开始时清空；真正的值由 Pipeline 里的 Stage 注入
        sess_tok = current_session_id.set(None)

        try:
            response = await call_next(request)
        finally:
            current_request_id.reset(req_tok)
            current_user_id.reset(user_tok)
            current_session_id.reset(sess_tok)

        response.headers["x-request-id"] = req_id
        return response


def _extract_user_id(request: Request) -> str | None:
    """从 Authorization: Bearer <jwt> 里提取 user_id，失败返回 None。

    这里**不**校验 token 是否过期 / 是否是 access token —— 那是 get_current_user
    依赖的职责。middleware 只用于埋点，best-effort 即可。
    """
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    sub = payload.get("sub")
    return str(sub) if sub else None
