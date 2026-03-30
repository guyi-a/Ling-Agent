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
    LLM_MODEL: str = "qwen-max"

    # Memory Configuration
    MEMORY_MAX_TOKENS: int = 2000

    # Application
    PORT: int = 9000
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    # JWT Configuration
    JWT_SECRET_KEY: str = "change-this-secret-key-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
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