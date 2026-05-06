"""
数据库会话管理（异步版本 + 同步版本）
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session as SyncSession
from app.core.config import settings

# 创建异步数据库引擎
engine = create_async_engine(
    settings.DATABASE_URL.replace("sqlite:///", "sqlite+aiosqlite:///"),
    echo=False,
    future=True
)

# 创建异步会话工厂
AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# 同步引擎（供 agent 工具等非 async 上下文使用）
_sync_engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
)

sync_session_factory = sessionmaker(
    _sync_engine, class_=SyncSession, expire_on_commit=False
)

# 基础模型类
Base = declarative_base()


async def get_db():
    """获取异步数据库会话"""
    async with AsyncSessionLocal() as session:
        yield session