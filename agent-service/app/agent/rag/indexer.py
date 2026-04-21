"""
知识库文档索引器

支持 Markdown 标题感知切片：按 #/##/### 层级分割，
每个 chunk 保留完整的父级标题作为上下文。
"""
import os
import re
import json
import logging
from pathlib import Path
from typing import List, Dict

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)


def _load_markdown(file_path: str) -> str:
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()


def _load_pdf(file_path: str) -> str:
    import fitz
    doc = fitz.open(file_path)
    text = "\n".join(page.get_text() for page in doc)
    doc.close()
    return text


def _load_docx(file_path: str) -> str:
    from docx import Document
    doc = Document(file_path)
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _load_txt(file_path: str) -> str:
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()


LOADERS = {
    ".md": _load_markdown,
    ".txt": _load_txt,
    ".pdf": _load_pdf,
    ".docx": _load_docx,
}


def _split_markdown_by_headers(text: str, source: str) -> List[Dict]:
    """
    按 Markdown 标题层级切片。

    策略：
    - 遇到 # 级标题，记录为当前 category
    - 遇到 ## 或 ### 级标题，记录为当前 subcategory
    - 每个 subcategory 下的内容聚合为一个 chunk
    - 如果没有子标题，按段落切分（fallback）

    每个 chunk 的 content 前缀带上 category + subcategory，
    帮助 embedding 捕获层级语义。
    """
    lines = text.split("\n")
    chunks = []
    current_category = ""
    current_subcategory = ""
    current_content_lines = []

    def _flush():
        content = "\n".join(current_content_lines).strip()
        if not content:
            return
        # 在内容前加上层级标题，增强语义
        prefix_parts = []
        if current_category:
            prefix_parts.append(current_category)
        if current_subcategory:
            prefix_parts.append(current_subcategory)
        if prefix_parts:
            content = " > ".join(prefix_parts) + "\n\n" + content

        chunks.append({
            "content": content,
            "source": source,
            "category": current_category,
            "subcategory": current_subcategory,
        })

    for line in lines:
        stripped = line.strip()
        # # 一级标题
        if re.match(r"^#\s+", stripped):
            _flush()
            current_category = re.sub(r"^#\s+", "", stripped)
            current_subcategory = ""
            current_content_lines = []
        # ## 或 ### 二/三级标题
        elif re.match(r"^#{2,3}\s+", stripped):
            _flush()
            current_subcategory = re.sub(r"^#{2,3}\s+", "", stripped)
            current_content_lines = []
        else:
            if stripped:
                current_content_lines.append(stripped)

    _flush()
    return chunks


def _split_plain_text(text: str, source: str, chunk_size: int, chunk_overlap: int) -> List[Dict]:
    """对非 Markdown 文档使用 RecursiveCharacterTextSplitter 切片"""
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", "。", "；", "，", " "],
    )
    docs = splitter.create_documents([text])
    return [
        {
            "content": doc.page_content,
            "source": source,
            "category": "",
            "subcategory": "",
        }
        for doc in docs
    ]


def _load_and_split(file_path: str) -> List[Dict]:
    """加载文档并切片"""
    ext = Path(file_path).suffix.lower()
    loader = LOADERS.get(ext)
    if not loader:
        logger.warning(f"不支持的文件类型: {ext}, 跳过 {file_path}")
        return []

    try:
        text = loader(file_path)
    except Exception as e:
        logger.error(f"加载文档失败 {file_path}: {e}")
        return []

    if not text.strip():
        return []

    source = Path(file_path).name

    if ext == ".md":
        chunks = _split_markdown_by_headers(text, source)
    else:
        chunks = _split_plain_text(
            text, source,
            settings.RAG_CHUNK_SIZE,
            settings.RAG_CHUNK_OVERLAP,
        )

    logger.info(f"📄 {source}: {len(chunks)} 个片段")
    return chunks


def build_index(knowledge_dir: str = None, index_dir: str = None, clear: bool = False):
    """
    构建 FAISS 索引。

    Args:
        knowledge_dir: 文档目录
        index_dir: 索引输出目录
        clear: 是否清除已有索引重建
    """
    import faiss
    from app.agent.rag.embeddings import get_embeddings

    knowledge_dir = knowledge_dir or settings.RAG_KNOWLEDGE_DIR
    index_dir = index_dir or settings.RAG_INDEX_DIR

    os.makedirs(index_dir, exist_ok=True)

    index_path = os.path.join(index_dir, "index.faiss")
    meta_path = os.path.join(index_dir, "chunks.json")

    if clear and os.path.exists(index_path):
        os.remove(index_path)
    if clear and os.path.exists(meta_path):
        os.remove(meta_path)

    # 收集所有文档
    supported_exts = set(LOADERS.keys())
    files = []
    for root, _, filenames in os.walk(knowledge_dir):
        for fname in filenames:
            if Path(fname).suffix.lower() in supported_exts:
                files.append(os.path.join(root, fname))

    if not files:
        logger.warning(f"未找到文档文件: {knowledge_dir}")
        return

    logger.info(f"📂 发现 {len(files)} 个文档文件")

    # 加载并切片
    all_chunks = []
    for f in files:
        all_chunks.extend(_load_and_split(f))

    if not all_chunks:
        logger.warning("切片后无内容，跳过索引构建")
        return

    logger.info(f"✂️ 共 {len(all_chunks)} 个文档片段，开始生成 embedding...")

    # 生成 embedding
    embeddings = get_embeddings()
    if not embeddings:
        logger.error("Embedding 实例不可用，无法构建索引")
        return

    texts = [c["content"] for c in all_chunks]

    # 分批处理，避免单次请求过大
    batch_size = 20
    all_vectors = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        vectors = embeddings.embed_documents(batch)
        all_vectors.extend(vectors)
        logger.info(f"  embedding 进度: {min(i + batch_size, len(texts))}/{len(texts)}")

    # 构建 FAISS 索引（使用 Inner Product，先 L2 归一化再用 IP = cosine similarity）
    dim = len(all_vectors[0])
    vectors_np = np.array(all_vectors, dtype=np.float32)
    faiss.normalize_L2(vectors_np)

    index = faiss.IndexFlatIP(dim)
    index.add(vectors_np)

    # 保存
    faiss.write_index(index, index_path)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(all_chunks, f, ensure_ascii=False, indent=2)

    logger.info(f"✅ 索引构建完成: {index.ntotal} 个向量 → {index_path}")
