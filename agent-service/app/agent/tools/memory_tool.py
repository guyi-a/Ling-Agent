"""
用户记忆工具 - 基于文件系统的跨会话记忆存储（单文件方案）

每个用户一个 .md 文件：data/memories/{user_id}.md
格式：每行一条记忆 "- **name**: content"
"""
import os
import re
import logging
import threading
from typing import Type

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from app.core.config import settings

logger = logging.getLogger(__name__)

_LINE_RE = re.compile(r"^- \*\*(.+?)\*\*: (.+)$")
_file_locks: dict[str, threading.Lock] = {}
_locks_lock = threading.Lock()


def _get_lock(user_id: str) -> threading.Lock:
    with _locks_lock:
        if user_id not in _file_locks:
            _file_locks[user_id] = threading.Lock()
        return _file_locks[user_id]


def _slugify(name: str) -> str:
    s = re.sub(r"[^\w\-]", "_", name.strip().lower())
    s = re.sub(r"_+", "_", s).strip("_")
    return s[:60] or "unnamed"


def _memory_path(user_id: str) -> str:
    return os.path.join(settings.MEMORY_DIR, f"{user_id}.md")


def _read_entries(user_id: str) -> list[tuple[str, str]]:
    path = _memory_path(user_id)
    if not os.path.exists(path):
        return []
    entries = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            m = _LINE_RE.match(line.strip())
            if m:
                entries.append((m.group(1), m.group(2)))
    return entries


def _write_entries(user_id: str, entries: list[tuple[str, str]]) -> None:
    os.makedirs(settings.MEMORY_DIR, exist_ok=True)
    path = _memory_path(user_id)
    with open(path, "w", encoding="utf-8") as f:
        for name, content in entries:
            f.write(f"- **{name}**: {content}\n")


def load_user_memory(user_id: str) -> str | None:
    path = _memory_path(user_id)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        content = f.read().strip()
    if not content:
        return None
    max_chars = settings.MEMORY_MAX_TOKENS
    if len(content) > max_chars:
        content = content[:max_chars] + "\n..."
    return content


class _SaveMemoryInput(BaseModel):
    name: str = Field(description="记忆名称，简短描述性的英文标识（如 favorite_language, work_role）")
    content: str = Field(description="记忆内容，简洁的一句话描述")


class _DeleteMemoryInput(BaseModel):
    name: str = Field(description="要删除的记忆名称")


class SaveMemoryTool(BaseTool):
    name: str = "save_memory"
    description: str = (
        "Save a memory about the user that persists across conversations. "
        "Use when the user explicitly asks you to remember something. "
        "Keep content concise (under 200 characters)."
    )
    args_schema: Type[BaseModel] = _SaveMemoryInput
    current_user_id: str = ""

    def _run(self, name: str, content: str) -> str:
        if not self.current_user_id:
            return "Error: user_id not available"

        slug = _slugify(name)
        lock = _get_lock(self.current_user_id)
        with lock:
            entries = _read_entries(self.current_user_id)

            updated = False
            for i, (n, _) in enumerate(entries):
                if n == slug:
                    entries[i] = (slug, content)
                    updated = True
                    break
            if not updated:
                entries.append((slug, content))

            _write_entries(self.current_user_id, entries)

        logger.info(f"💾 记忆已保存: {slug}={content!r} (user: {self.current_user_id[:8]}...)")
        return f"已记住: {name}"


class DeleteMemoryTool(BaseTool):
    name: str = "delete_memory"
    description: str = (
        "Delete a previously saved memory. "
        "Use when the user asks you to forget something."
    )
    args_schema: Type[BaseModel] = _DeleteMemoryInput
    current_user_id: str = ""

    def _run(self, name: str) -> str:
        if not self.current_user_id:
            return "Error: user_id not available"

        slug = _slugify(name)
        lock = _get_lock(self.current_user_id)
        with lock:
            entries = _read_entries(self.current_user_id)
            new_entries = [(n, c) for n, c in entries if n != slug]

            if len(new_entries) == len(entries):
                return f"未找到名为 '{name}' 的记忆"

            _write_entries(self.current_user_id, new_entries)

        logger.info(f"🗑️ 记忆已删除: {slug} (user: {self.current_user_id[:8]}...)")
        return f"已忘记: {name}"
