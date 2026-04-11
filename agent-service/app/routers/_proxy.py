"""
通用反向代理 — 转发请求到本地端口
"""

import httpx
from fastapi import HTTPException, Request, status
from fastapi.responses import Response

# 需要移除的响应头（允许 iframe 嵌入）
_STRIP_HEADERS = {"x-frame-options", "content-security-policy", "content-security-policy-report-only"}


async def proxy_to_local(port: int, path: str, request: Request) -> Response:
    """
    反向代理到 127.0.0.1:{port}/{path}

    - 转发请求方法、头部、body
    - 移除阻止 iframe 嵌入的响应头
    """
    target_url = f"http://127.0.0.1:{port}/{path}"
    query = str(request.url.query)
    if query:
        target_url += f"?{query}"

    forward_headers = {}
    for k, v in request.headers.items():
        if k.lower() not in ("host", "authorization", "connection"):
            forward_headers[k] = v

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            proxy_resp = await client.request(
                method=request.method,
                url=target_url,
                headers=forward_headers,
                content=await request.body(),
                follow_redirects=True,
            )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Cannot connect to service on port {port}",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Service request timed out",
        )

    resp_headers = {}
    for k, v in proxy_resp.headers.items():
        if k.lower() not in _STRIP_HEADERS and k.lower() != "transfer-encoding":
            resp_headers[k] = v

    return Response(
        content=proxy_resp.content,
        status_code=proxy_resp.status_code,
        headers=resp_headers,
    )
