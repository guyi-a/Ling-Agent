"""
预览反向代理 — 将前端 iframe 请求转发到本地 dev server

路由：/api/preview/{port}/{path:path}
安全：验证 port 属于受管进程
"""

import logging

from fastapi import APIRouter, HTTPException, Request, status

from app.agent.service.process_manager import is_port_active
from app.routers._proxy import proxy_to_local

router = APIRouter(prefix="/api/preview", tags=["preview"])
logger = logging.getLogger(__name__)


def _verify_port(port: int) -> None:
    """验证端口属于受管的运行中进程"""
    if not is_port_active(port):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No running process on port {port}",
        )


@router.api_route("/{port}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_to_dev_server(port: int, path: str, request: Request):
    """反向代理到 dev server"""
    _verify_port(port)
    return await proxy_to_local(port, path, request)


@router.api_route("/{port}", methods=["GET"])
async def proxy_root(port: int, request: Request):
    """代理根路径（无尾斜杠）"""
    _verify_port(port)
    return await proxy_to_local(port, "", request)
