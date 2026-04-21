"""
FastAPI应用程序主入口
"""
import logging
import traceback
import time
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import os
from contextlib import asynccontextmanager
from app.core.config import settings
from app.database.session import engine, Base
from app.utils import setup_logging

logger = logging.getLogger(__name__)

# 导入模型以确保它们在数据库中创建
from app.models import *

# 导入路由
from app.routers import auth_router, user_router, session_router, message_router, chat_router, workspace_router, dev_router, preview_router, health_router

# 在应用程序启动时创建数据库表
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 配置日志系统（只在 worker 进程中执行一次）
    setup_logging(level=settings.LOG_LEVEL)

    # 启动时创建数据库表
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 初始化 checkpointer（AsyncSqliteSaver，持久化 LangGraph checkpoint）
    from app.agent.infra.agent_factory import init_checkpointer, close_checkpointer
    from app.agent.mcp.client import start_mcp_client, stop_mcp_client
    await init_checkpointer("data/checkpoints.db")

    # 加载 RAG 知识库索引
    if settings.RAG_ENABLED:
        from app.agent.rag.store import load_store
        await load_store(settings.RAG_INDEX_DIR)

    await start_mcp_client()

    yield

    await stop_mcp_client()

    # 关闭 checkpointer
    await close_checkpointer()

# 创建FastAPI应用实例
app = FastAPI(
    title="Ling Agent Service",
    description="Android 智能助手服务 API",
    version="1.0.0",
    lifespan=lifespan
)

# ───────────────────────── 全局异常处理器 ─────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """请求参数校验失败（422）"""
    errors = [
        {"field": ".".join(str(x) for x in e["loc"]), "message": e["msg"]}
        for e in exc.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"code": 422, "message": "请求参数错误", "errors": errors}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """捕获所有未处理的异常（500）"""
    logger.error(
        f"Unhandled exception: {request.method} {request.url}\n"
        f"{traceback.format_exc()}"
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"code": 500, "message": "服务器内部错误，请稍后重试"}
    )

# ──────────────────────────────────────────────────────────────────

# 请求日志中间件
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """记录所有 HTTP 请求的日志"""
    start_time = time.time()

    # 构建日志信息
    method = request.method
    path = request.url.path
    query = str(request.url.query) if request.url.query else ""
    client = request.client.host if request.client else "unknown"

    # 执行请求
    response = await call_next(request)

    # 计算耗时
    duration = (time.time() - start_time) * 1000  # 转换为毫秒

    # 过滤掉定时轮询请求（减少日志噪音）
    is_polling = (
        method == "GET" and
        200 <= response.status_code < 300 and
        (
            (path.startswith("/api/workspace/") and path.endswith(("/files", "/projects"))) or
            (path.startswith("/api/dev/") and ("/processes" in path or "/logs/" in path)) or
            path.startswith("/api/preview/")
        )
    )

    if is_polling:
        # 轮询请求不记录日志
        return response

    # 记录日志
    status_code = response.status_code
    log_msg = f"{method} {path}"
    if query:
        log_msg += f"?{query}"
    log_msg += f" → {status_code} ({duration:.2f}ms) [{client}]"

    # 根据状态码选择日志级别
    if 200 <= status_code < 400:
        logger.info(log_msg)
    elif 400 <= status_code < 500:
        logger.warning(log_msg)
    else:
        logger.error(log_msg)

    return response

# 添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth_router)
app.include_router(user_router)
app.include_router(session_router)
app.include_router(message_router)
app.include_router(chat_router)
app.include_router(workspace_router)
app.include_router(dev_router)
app.include_router(preview_router)
app.include_router(health_router)

# 挂载前端静态文件
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/ui", StaticFiles(directory=frontend_dir, html=True), name="frontend")

# 根路径
@app.get("/")
async def root():
    return {
        "message": "欢迎使用 Ling Agent Service API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "users": "/api/users",
            "sessions": "/api/sessions",
            "messages": "/api/messages",
            "chat": "/api/chat"
        }
    }

# 健康检查端点
@app.get("/health")
async def health_check():
    return {
        "status": "healthy", 
        "port": settings.PORT,
        "service": "Ling Agent Service"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.DEBUG,
        reload_dirs=["app"] if settings.DEBUG else None,
    )