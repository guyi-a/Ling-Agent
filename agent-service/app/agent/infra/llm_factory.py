"""
LLM工厂类 - 统一创建和管理LLM实例
"""
import logging
from typing import Optional
from langchain_openai import ChatOpenAI
from app.core.config import settings
from app.agent.infra.provider_config import resolve_model

logger = logging.getLogger(__name__)


def get_llm(model: str = None, temperature: float = 0.3) -> Optional[ChatOpenAI]:
    """
    获取LLM实例，自动路由到对应的 provider。

    Args:
        model: 模型名称（如 "deepseek-v4-flash"、"glm-4.7"），不传则使用默认模型
        temperature: 温度参数

    Returns:
        LLM实例，如果配置不完整则返回None
    """
    model_name = model or settings.LLM_MODEL
    base_url, api_key, resolved_model = resolve_model(model_name)

    if not api_key:
        logger.warning(f"No API key available for model '{model_name}'")
        return None

    if not base_url:
        logger.warning(f"No base_url available for model '{model_name}'")
        return None

    try:
        llm = ChatOpenAI(
            temperature=temperature,
            max_tokens=65536,
            timeout=None,
            max_retries=2,
            base_url=base_url,
            api_key=api_key,
            model=resolved_model,
            stream_usage=True,
        )
        logger.info(f"LLM instance created: model={resolved_model}, base_url={base_url[:30]}...")
        return llm
    except Exception as e:
        logger.error(f"Failed to create LLM instance: {e}", exc_info=True)
        return None
