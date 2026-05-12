"""启动时自动跑 Alembic upgrade head。

目标：部署/开发拉完代码后不用手动 `alembic upgrade head`，服务起来就自动同步。

失败策略：只打 warning，不中断启动。理由：
- 开发环境如果是全新数据库，Alembic 没有基线版本号，upgrade 会报 schema 已存在。
  此时 `Base.metadata.create_all` 仍然能兜底建表（create_all 对已存在的表是 no-op）。
- 生产环境部署前应该已经人工过了一遍 migration，这里只是兜底自动化。

调用方：main.lifespan 开头，create_all 之前。
"""
from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

logger = logging.getLogger(__name__)


def run_alembic_upgrade() -> None:
    """尝试把数据库推到 alembic head。失败只告警。"""
    ini_path = Path(__file__).resolve().parents[2] / "alembic.ini"
    if not ini_path.exists():
        logger.warning("alembic.ini 不存在，跳过自动 upgrade")
        return

    try:
        cfg = Config(str(ini_path))
        # env.py 自己会从 settings.DATABASE_URL 覆盖，不用在这里指定
        command.upgrade(cfg, "head")
        logger.info("✓ Alembic upgrade head 完成")
    except Exception as exc:
        logger.warning(
            "Alembic upgrade 失败：%s。create_all 会兜底建表；"
            "如果是已有数据库请手动 `alembic stamp head` 再 upgrade。",
            exc,
        )
