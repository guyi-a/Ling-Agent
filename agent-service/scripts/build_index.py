#!/usr/bin/env python3
"""
知识库索引构建脚本

用法:
    python scripts/build_index.py              # 索引 data/knowledge_base/ 下所有文档
    python scripts/build_index.py --dir /path  # 指定文档目录
    python scripts/build_index.py --clear      # 清除已有索引重建
"""
import sys
import os
import argparse
import logging

# 确保能导入 app 模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)


def main():
    parser = argparse.ArgumentParser(description="构建 RAG 知识库 FAISS 索引")
    parser.add_argument("--dir", type=str, default=None, help="文档目录（默认 data/knowledge_base）")
    parser.add_argument("--output", type=str, default=None, help="索引输出目录（默认 data/vector_store）")
    parser.add_argument("--clear", action="store_true", help="清除已有索引重建")
    args = parser.parse_args()

    from app.agent.rag.indexer import build_index

    build_index(
        knowledge_dir=args.dir,
        index_dir=args.output,
        clear=args.clear,
    )


if __name__ == "__main__":
    main()
