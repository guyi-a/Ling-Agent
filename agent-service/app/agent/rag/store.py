"""
FAISS 向量存储管理

启动时加载索引到内存，提供语义搜索接口。
"""
import os
import json
import logging
from typing import List, Dict, Optional

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)

_index = None
_chunks: List[Dict] = []


async def load_store(index_dir: str = None):
    """从磁盘加载 FAISS 索引和文档片段元数据"""
    global _index, _chunks

    index_dir = index_dir or settings.RAG_INDEX_DIR
    index_path = os.path.join(index_dir, "index.faiss")
    meta_path = os.path.join(index_dir, "chunks.json")

    if not os.path.exists(index_path) or not os.path.exists(meta_path):
        logger.info("RAG 索引文件不存在，跳过加载（需先运行 build_index）")
        return

    try:
        import faiss
        _index = faiss.read_index(index_path)

        with open(meta_path, "r", encoding="utf-8") as f:
            _chunks = json.load(f)

        assert _index.ntotal == len(_chunks), (
            f"索引数量 ({_index.ntotal}) 与元数据数量 ({len(_chunks)}) 不匹配"
        )
        logger.info(f"✅ RAG 索引已加载: {_index.ntotal} 个文档片段")
    except Exception as e:
        logger.error(f"❌ 加载 RAG 索引失败: {e}", exc_info=True)
        _index = None
        _chunks = []


def is_ready() -> bool:
    return _index is not None and len(_chunks) > 0


def search(query_embedding: List[float], k: int = None) -> List[Dict]:
    """
    语义搜索，返回 top-k 最相关的文档片段。

    Args:
        query_embedding: 查询文本的 embedding 向量
        k: 返回结果数

    Returns:
        [{"content": "...", "source": "...", "category": "...", "score": 0.85}, ...]
    """
    if not is_ready():
        return []

    k = k or settings.RAG_TOP_K
    k = min(k, _index.ntotal)

    import faiss
    query_vec = np.array([query_embedding], dtype=np.float32)
    faiss.normalize_L2(query_vec)

    distances, indices = _index.search(query_vec, k)

    results = []
    for i, idx in enumerate(indices[0]):
        if idx < 0 or idx >= len(_chunks):
            continue
        chunk = _chunks[idx]
        results.append({
            "content": chunk["content"],
            "source": chunk.get("source", ""),
            "category": chunk.get("category", ""),
            "subcategory": chunk.get("subcategory", ""),
            "score": float(distances[0][i]),
        })

    return results
