"""
配置管理模块
从环境变量读取配置
"""
import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """应用配置"""

    # Database
    DATABASE_URL: str = "sqlite:///./app.db"

    # LLM Configuration
    DASHSCOPE_API_KEY: Optional[str] = None
    LLM_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    LLM_MODEL: str = "qwen3.5-plus"  # 最新最强模型
    LLM_MODEL_ROUTER: str = "qwen-max"  # 路由 Agent
    LLM_MODEL_DEVELOPER: str = "qwen3.5-plus"  # 开发者 Agent：最强代码能力
    LLM_MODEL_GENERAL: str = "qwen3.5-plus"  # 通用 Agent：性价比均衡
    LLM_MODEL_PSYCH: str = "qwen-plus"  # 心理健康 Agent
    LLM_MODEL_DATA: str = "qwen-plus"  # 数据分析 Agent
    LLM_MODEL_DOCUMENT: str = "qwen-plus"  # 文档处理 Agent

    # Workspace Configuration
    WORKSPACE_ROOT: str = "./workspace"

    # Dev Services
    DEV_PORT_RANGE_START: int = 9100
    DEV_PORT_RANGE_END: int = 9199

    # Memory Configuration
    MEMORY_MAX_TOKENS: int = 2000
    MEMORY_DIR: str = "data/memories"

    # Application
    PORT: int = 9000
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    # Prompt mode: "core" (default) or "psych" (psychology health competition)
    PROMPT_MODE: str = "core"

    # Langfuse Observability (optional)
    LANGFUSE_PUBLIC_KEY: Optional[str] = None
    LANGFUSE_SECRET_KEY: Optional[str] = None
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"

    # RAG Knowledge Base
    RAG_ENABLED: bool = True
    RAG_INDEX_DIR: str = "data/vector_store"
    RAG_KNOWLEDGE_DIR: str = "data/knowledge_base"
    RAG_EMBEDDING_MODEL: str = "text-embedding-v3"
    RAG_CHUNK_SIZE: int = 500
    RAG_CHUNK_OVERLAP: int = 100
    RAG_TOP_K: int = 5

    # Context Compaction
    COMPACT_ENABLED: bool = True
    COMPACT_TOKEN_THRESHOLD: int = 30000
    COMPACT_KEEP_TURNS: int = 2
    COMPACT_MODEL: str = "qwen-turbo"
    COMPACT_SUMMARY_MAX_TOKENS: int = 1500

    # JWT Configuration
    JWT_SECRET_KEY: str = "change-this-secret-key-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 天
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    class Config:
        env_file = ".env"
        extra = "ignore"


# 全局配置实例
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """获取配置单例"""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


settings = get_settings()