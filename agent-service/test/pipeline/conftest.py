"""Pipeline 测试共享 fixture。

用 in-memory SQLite 跑真 CRUD，不 mock —— mock CRUD 的测试毫无价值。
每个测试独立 engine + session，彼此不干扰。
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, User  # noqa: F401 - 触发所有 model 注册


@pytest_asyncio.fixture
async def async_session() -> AsyncSession:
    """每个测试独立 in-memory SQLite，建表 + 返回 session。"""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", echo=False, future=True,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture
async def test_user(async_session: AsyncSession) -> User:
    """创建一个测试用户并返回。"""
    user = User(
        user_id=f"test-user-{uuid.uuid4().hex[:8]}",
        username="tester",
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def other_user(async_session: AsyncSession) -> User:
    """第二个用户，用于测试跨用户权限隔离。"""
    user = User(
        user_id=f"other-user-{uuid.uuid4().hex[:8]}",
        username="other",
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    return user
