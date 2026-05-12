"""自定义 SQLAlchemy 类型。"""
from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

logger = logging.getLogger(__name__)


class JSONText(TypeDecorator):
    """TEXT 列，Python 侧自动做 JSON 序列化/反序列化。

    为什么不直接用 sqlalchemy.JSON：
    - 历史遗留 extra_data 列已经是 TEXT，切到 JSON 需要 migration；
    - SQLite JSON 类型支持不完整，Postgres/MySQL 有各自的方言；
    - TypeDecorator 不碰 DDL，纯在 Python 侧编解码，换 DB 不用动。

    兼容性：
    - 读取到非 JSON 字符串（老数据或脏数据）时，保留原字符串回传，
      并打 warning，不会让 query 整体炸。
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect) -> str | None:
        """Python → DB。None 写 NULL；其他 dump 成 json。"""
        if value is None:
            return None
        if isinstance(value, str):
            # 显式传字符串的兼容路径：当场尝试解析，能解就存回去规范化，
            # 解不了就按字面量存（极少见，通常是错误使用）
            try:
                json.loads(value)
                return value
            except (json.JSONDecodeError, TypeError):
                logger.warning("JSONText: bound string is not valid JSON, storing as raw")
                return value
        return json.dumps(value, ensure_ascii=False)

    def process_result_value(self, value: Any, dialect) -> Any:
        """DB → Python。NULL 返回 None；合法 JSON 反序列化；否则原样返回。"""
        if value is None:
            return None
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            logger.warning("JSONText: row value is not valid JSON, returning raw string")
            return value
