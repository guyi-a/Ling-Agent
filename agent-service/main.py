"""
FastAPI应用程序主入口
"""
import logging
import traceback
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import os
from contextlib import asynccontextmanager
from app.core.config import settings
from app.database.session import engine, Base

logger = logging.getLogger(__name__)

# 导入模型以确保它们在数据库中创建
from app.models import *

# 导入路由
from app.routers import auth_router, user_router, session_router, message_router, chat_router, workspace_router

# 在应用程序启动时创建数据库表
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时创建数据库表
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # 关闭时可以执行清理操作

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
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=settings.DEBUG)