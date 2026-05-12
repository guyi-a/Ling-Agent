"""
日志配置工具 - 统一管理应用日志输出
"""
import logging
import sys
from typing import Optional

from app.core.trace_context import current_request_id, current_session_id, current_user_id


class TraceContextFilter(logging.Filter):
    """把 per-request ContextVar 注入到每条 LogRecord。

    模板里 %(session_id)s / %(user_id)s / %(request_id)s 即可使用。
    缺省值为 '-'，避免格式化时 KeyError。
    """

    def filter(self, record: logging.LogRecord) -> bool:
        sid = current_session_id.get()
        uid = current_user_id.get()
        rid = current_request_id.get()
        record.session_id = (sid[:8] if sid else "-")
        record.user_id = (uid[:8] if uid else "-")
        record.request_id = rid or "-"
        return True


def setup_logging(
    level: str = "INFO",
    format: Optional[str] = None,
    suppress_modules: Optional[list[str]] = None
) -> None:
    """
    配置应用日志系统

    Args:
        level: 日志级别（DEBUG, INFO, WARNING, ERROR, CRITICAL）
        format: 日志格式（None 使用默认格式）
        suppress_modules: 需要抑制日志输出的模块列表
    """
    # 默认日志格式（带 session/user 前缀）
    if format is None:
        format = '%(asctime)s [%(levelname)s] [s=%(session_id)s u=%(user_id)s] %(name)s - %(message)s'

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(TraceContextFilter())

    # 配置根日志记录器
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format=format,
        datefmt='%Y-%m-%d %H:%M:%S',
        handlers=[handler],
        force=True  # 强制重新配置（覆盖已有配置）
    )

    # 抑制第三方库的冗余日志
    default_suppress = [
        "sqlalchemy.engine",      # SQLAlchemy SQL 语句输出
        "sqlalchemy.pool",        # 数据库连接池日志
        "httpx",                  # HTTP 客户端日志
        "httpcore",               # HTTP 核心日志
        "uvicorn.access",         # Uvicorn 访问日志（保留 error）
        "urllib3",                # URL 请求库
        "asyncio",                # 异步 IO 日志
    ]

    suppress_list = suppress_modules or []
    for module in default_suppress + suppress_list:
        logging.getLogger(module).setLevel(logging.WARNING)

    # 保持应用核心模块的日志级别
    app_modules = [
        "app",                    # 应用主模块
        "app.agent",              # Agent 相关日志
        "app.routers",            # 路由日志
        "app.core",               # 核心模块日志
    ]

    for module in app_modules:
        logging.getLogger(module).setLevel(getattr(logging, level.upper(), logging.INFO))

    logger = logging.getLogger(__name__)
    logger.info(f"✓ 日志系统已配置 (级别={level})")


def get_logger(name: str) -> logging.Logger:
    """
    获取指定名称的日志记录器

    Args:
        name: 日志记录器名称（通常是 __name__）

    Returns:
        logging.Logger 实例
    """
    return logging.getLogger(name)
