"""
RAG 知识库搜索工具

让 Agent 在对话中检索开发者预置的知识库内容。
"""
import logging
from typing import Type

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class _SearchKnowledgeInput(BaseModel):
    query: str = Field(description="搜索关键词或问题描述")
    top_k: int = Field(default=5, description="返回结果数量，默认 5")


class SearchKnowledgeTool(BaseTool):
    """搜索内部知识库，获取与查询相关的专业知识片段"""
    name: str = "search_knowledge"
    description: str = (
        "Search the internal knowledge base for relevant information. "
        "Use this tool when the user's question is related to psychological health, "
        "emotional experiences, physical symptoms, or mind-body connections. "
        "Returns relevant knowledge snippets with source and category information. "
        "Always prefer this over web_search for psychology/health domain questions."
    )
    args_schema: Type[BaseModel] = _SearchKnowledgeInput

    def _run(self, query: str, top_k: int = 5) -> str:
        return self._search(query, top_k)

    async def _arun(self, query: str, top_k: int = 5) -> str:
        return self._search(query, top_k)

    def _search(self, query: str, top_k: int = 5) -> str:
        from app.agent.rag.store import is_ready, search
        from app.agent.rag.embeddings import get_embeddings

        if not is_ready():
            return "知识库未加载，无法搜索。"

        embeddings = get_embeddings()
        if not embeddings:
            return "Embedding 服务不可用。"

        try:
            query_vector = embeddings.embed_query(query)
        except Exception as e:
            logger.error(f"生成查询 embedding 失败: {e}")
            return f"搜索失败: {e}"

        results = search(query_vector, k=top_k)

        if not results:
            return "未找到相关知识。"

        parts = []
        for i, r in enumerate(results, 1):
            header = f"[{i}]"
            if r.get("category"):
                header += f" {r['category']}"
            if r.get("subcategory"):
                header += f" > {r['subcategory']}"
            parts.append(f"{header}\n{r['content']}")

        logger.info(f"🔍 知识库搜索: '{query}' → {len(results)} 条结果")
        return "\n\n---\n\n".join(parts)
