"""JSONText TypeDecorator：读写自动做 JSON，兼容老数据。"""
from __future__ import annotations

import json

import pytest
from sqlalchemy import Column, Integer, create_engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.models.types import JSONText

Base = declarative_base()


class _Row(Base):
    __tablename__ = "jsontext_rows"
    id = Column(Integer, primary_key=True)
    data = Column(JSONText)


@pytest.fixture
async def sessionmaker_():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    yield maker
    await engine.dispose()


@pytest.mark.asyncio
async def test_dict_roundtrip(sessionmaker_):
    async with sessionmaker_() as db:
        db.add(_Row(data={"attachments": [{"type": "image", "path": "a.png"}]}))
        await db.commit()

    async with sessionmaker_() as db:
        row = (await db.execute(__import__("sqlalchemy").select(_Row))).scalar_one()
        assert row.data == {"attachments": [{"type": "image", "path": "a.png"}]}
        assert isinstance(row.data, dict)


@pytest.mark.asyncio
async def test_none_roundtrip(sessionmaker_):
    async with sessionmaker_() as db:
        db.add(_Row(data=None))
        await db.commit()
    async with sessionmaker_() as db:
        row = (await db.execute(__import__("sqlalchemy").select(_Row))).scalar_one()
        assert row.data is None


@pytest.mark.asyncio
async def test_legacy_json_string_readable(sessionmaker_):
    """老数据：直接塞 JSON 字符串进去，读出来应该是 dict。"""
    async with sessionmaker_() as db:
        db.add(_Row(data='{"attachments": [{"type": "file", "path": "x.pdf"}]}'))
        await db.commit()

    async with sessionmaker_() as db:
        row = (await db.execute(__import__("sqlalchemy").select(_Row))).scalar_one()
        assert isinstance(row.data, dict)
        assert row.data["attachments"][0]["path"] == "x.pdf"


@pytest.mark.asyncio
async def test_malformed_string_falls_back_to_raw(sessionmaker_):
    """脏数据（不是 JSON 的字符串）不应该让 query 挂掉。"""
    # bind_param 走 string 分支：解析失败会打 warning，按原样存
    async with sessionmaker_() as db:
        db.add(_Row(data="not-json-at-all"))
        await db.commit()

    async with sessionmaker_() as db:
        row = (await db.execute(__import__("sqlalchemy").select(_Row))).scalar_one()
        # 读取端解析失败 fallback 成 raw string，不挂
        assert row.data == "not-json-at-all"


def test_list_roundtrip_sync():
    """纯 Python 侧走一遍编解码，不过 async，看列表也能过。"""
    from sqlalchemy.engine.default import DefaultDialect

    td = JSONText()
    dialect = DefaultDialect()
    stored = td.process_bind_param([1, 2, {"x": "y"}], dialect)
    assert json.loads(stored) == [1, 2, {"x": "y"}]
    loaded = td.process_result_value(stored, dialect)
    assert loaded == [1, 2, {"x": "y"}]
