"""
FastAPI应用程序主入口
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import settings
from app.database.session import engine, Base

# 导入模型以确保它们在数据库中创建
from app.models import *

# 导入路由
from app.routers import user_router, session_router, message_router, chat_router

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

# 添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(user_router)
app.include_router(session_router)
app.include_router(message_router)
app.include_router(chat_router)

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