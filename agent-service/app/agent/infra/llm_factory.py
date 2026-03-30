"""
LLM工厂类 - 统一创建和管理LLM实例
"""
import logging
from typing import Optional
from langchain_openai import ChatOpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)


def get_llm() -> Optional[ChatOpenAI]:
    """
    获取LLM实例

    Returns:
        LLM实例，如果配置不完整则返回None
    """
    if not settings.DASHSCOPE_API_KEY:
        logger.warning("DASHSCOPE_API_KEY 未配置，LLM功能将不可用")
        return None

    if not settings.LLM_BASE_URL:
        logger.warning("LLM_BASE_URL 未配置，LLM功能将不可用")
        return None

    try:
        llm = ChatOpenAI(
            temperature=0.3,
            max_tokens=50000,
            timeout=None,
            max_retries=2,
            base_url=settings.LLM_BASE_URL,
            api_key=settings.DASHSCOPE_API_KEY,
            model=settings.LLM_MODEL
        )
        logger.info(f"✓ LLM实例已创建 - model: {settings.LLM_MODEL}")
        return llm
    except Exception as e:
        logger.error(f"创建LLM实例失败: {e}", exc_info=True)
        return None