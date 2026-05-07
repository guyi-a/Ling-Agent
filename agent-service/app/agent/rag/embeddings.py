"""
RAG Embedding 封装

使用 OpenAI 兼容接口调用 DashScope text-embedding-v3
"""
import logging
from typing import Optional

from langchain_openai import OpenAIEmbeddings
from app.core.config import settings

logger = logging.getLogger(__name__)

_embeddings: Optional[OpenAIEmbeddings] = None


def get_embeddings() -> Optional[OpenAIEmbeddings]:
    global _embeddings
    if _embeddings is not None:
        return _embeddings

    api_key = settings.QWEN_API_KEY
    if not api_key:
        logger.warning("QWEN_API_KEY 未配置，Embedding 不可用")
        return None

    _embeddings = OpenAIEmbeddings(
        model=settings.RAG_EMBEDDING_MODEL,
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key=api_key,
        check_embedding_ctx_length=False,
    )
    logger.info(f"✓ Embedding 实例已创建 - model: {settings.RAG_EMBEDDING_MODEL}")
    return _embeddings
