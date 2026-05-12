"""
流式分块写入工具 - 支持大文件的分段生成

工作流程：
  1. start  → 创建写入会话，返回 session_id
  2. append → 追加内容块（可多次调用）
  3. finish → 完成写入，保存文件

使用场景：
  - 生成大型前端文件（React 组件、长 HTML）
  - 生成长报告或文档
  - 避免单次写入超过 token 限制
"""
import json
import logging
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Type, Literal, Optional
from uuid import uuid4

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from app.agent.tools.file_tool import resolve_path, get_session_workspace
from app.agent.tools._ctx import get_session_id

logger = logging.getLogger(__name__)

# 会话过期时间（12 小时）
SESSION_TTL = timedelta(hours=12)

WriteMode = Literal["start", "append", "finish", "abort"]


class _ChunkedWriteInput(BaseModel):
    mode: WriteMode = Field(description="写入模式：start=开始, append=追加, finish=完成, abort=中止")
    path: Optional[str] = Field(default=None, description="文件路径（mode=start 时必填）")
    content: str = Field(default="", description="要写入的内容（mode=append 时必填）")
    session_id: Optional[str] = Field(default=None, description="会话 ID（mode=append/finish/abort 时必填）")


class _WriteSession(BaseModel):
    """写入会话状态"""
    path: str
    temp_path: str
    existed_before: bool
    updated_at: str
    bytes_written: int = 0
    chunk_count: int = 0


class ChunkedWriteTool(BaseTool):
    """流式分块写入文件（支持大文件生成）"""
    name: str = "write_file_chunked"
    description: str = (
        "Write large files in chunks to avoid token limits. "
        "Flow: start → append (multiple times) → finish.\n\n"
        "Example:\n"
        "1. write_file_chunked(mode='start', path='app.tsx') → returns session_id\n"
        "2. write_file_chunked(mode='append', session_id='...', content='import React...')\n"
        "3. write_file_chunked(mode='append', session_id='...', content='export default...')\n"
        "4. write_file_chunked(mode='finish', session_id='...') → file saved\n\n"
        "Rules:\n"
        "- After start, immediately call append with first chunk (~50 lines)\n"
        "- Keep appending chunks in order until complete\n"
        "- Call finish to save the file (no content parameter)\n"
        "- Use abort to cancel and clean up"
    )
    args_schema: Type[BaseModel] = _ChunkedWriteInput
    current_session_id: Optional[str] = None

    def _get_session_dir(self) -> Path:
        """获取会话存储目录"""
        workspace = get_session_workspace(get_session_id(), ensure=True)
        session_dir = workspace / ".chunked_write_sessions"
        session_dir.mkdir(exist_ok=True)
        return session_dir

    def _get_session_file(self, session_id: str) -> Path:
        """获取会话元数据文件路径"""
        return self._get_session_dir() / f"{session_id}.json"

    def _save_session(self, session_id: str, session: _WriteSession) -> None:
        """保存会话状态"""
        self._get_session_file(session_id).write_text(
            session.model_dump_json(), encoding="utf-8"
        )

    def _load_session(self, session_id: str) -> _WriteSession:
        """加载会话状态"""
        session_file = self._get_session_file(session_id)
        if not session_file.exists():
            raise ValueError(f"Unknown write session: {session_id}")

        try:
            data = json.loads(session_file.read_text(encoding="utf-8"))
            session = _WriteSession.model_validate(data)
        except Exception as e:
            raise ValueError(f"Invalid session state: {e}")

        # 检查是否过期
        updated_at = datetime.fromisoformat(session.updated_at)
        if updated_at < datetime.now(timezone.utc) - SESSION_TTL:
            self._cleanup_session(session_id, session)
            raise ValueError(f"Session expired: {session_id}")

        return session

    def _delete_session(self, session_id: str) -> None:
        """删除会话元数据"""
        self._get_session_file(session_id).unlink(missing_ok=True)

    def _cleanup_session(self, session_id: str, session: _WriteSession) -> None:
        """清理会话临时文件"""
        temp_path = Path(session.temp_path)
        if temp_path.exists():
            temp_path.unlink()
        self._delete_session(session_id)

    def _cleanup_expired_sessions(self) -> None:
        """清理过期的会话"""
        cutoff = datetime.now(timezone.utc) - SESSION_TTL
        for session_file in self._get_session_dir().glob("*.json"):
            try:
                data = json.loads(session_file.read_text(encoding="utf-8"))
                updated_at = datetime.fromisoformat(data["updated_at"])
                if updated_at < cutoff:
                    session = _WriteSession.model_validate(data)
                    self._cleanup_session(session_file.stem, session)
            except Exception:
                pass

    def _run(self, mode: WriteMode, path: Optional[str] = None,
             content: str = "", session_id: Optional[str] = None) -> str:
        try:
            if mode == "start":
                return self._handle_start(path, content)
            elif mode == "append":
                return self._handle_append(session_id, content)
            elif mode == "finish":
                return self._handle_finish(session_id)
            elif mode == "abort":
                return self._handle_abort(session_id)
            else:
                return f"Error: Unknown mode '{mode}'"

        except Exception as e:
            logger.error(f"Chunked write error: {e}")
            return f"Error: {e}"

    def _handle_start(self, path: Optional[str], content: str) -> str:
        """处理 start 模式"""
        if not path:
            return "Error: path is required when mode=start"

        # 清理过期会话
        self._cleanup_expired_sessions()

        # 解析路径
        file_path = resolve_path(path, get_session_id())
        existed_before = file_path.exists()

        # 创建临时文件
        file_path.parent.mkdir(parents=True, exist_ok=True)
        temp_fd, temp_path_str = tempfile.mkstemp(
            prefix=f".{file_path.name}.write-",
            suffix=".tmp",
            dir=str(file_path.parent),
            text=True,
        )
        import os
        os.close(temp_fd)

        temp_path = Path(temp_path_str)
        temp_path.write_text("", encoding="utf-8")

        # 创建会话
        sid = uuid4().hex
        session = _WriteSession(
            path=str(file_path),
            temp_path=temp_path_str,
            existed_before=existed_before,
            updated_at=datetime.now(timezone.utc).isoformat(),
            bytes_written=0,
            chunk_count=0,
        )

        # 如果提供了初始内容，写入
        if content:
            temp_path.write_text(content, encoding="utf-8")
            session.bytes_written = len(content.encode("utf-8"))
            session.chunk_count = 1

        self._save_session(sid, session)

        logger.info(f"📝 Started chunked write: {file_path} (session={sid})")

        return (
            f"✅ Write session started: {sid}\n"
            f"📄 Target file: {path}\n"
            f"📊 Status: {'overwriting existing file' if existed_before else 'creating new file'}\n"
            f"💡 Next: call write_file_chunked(mode='append', session_id='{sid}', content='<first chunk>')"
        )

    def _handle_append(self, session_id: Optional[str], content: str) -> str:
        """处理 append 模式"""
        if not session_id:
            return "Error: session_id is required when mode=append"
        if not content:
            return "Error: content cannot be empty when mode=append"

        session = self._load_session(session_id)
        temp_path = Path(session.temp_path)

        # 追加内容
        with open(temp_path, "a", encoding="utf-8") as f:
            f.write(content)

        # 更新会话状态
        session.bytes_written += len(content.encode("utf-8"))
        session.chunk_count += 1
        session.updated_at = datetime.now(timezone.utc).isoformat()
        self._save_session(session_id, session)

        current_size = temp_path.stat().st_size

        logger.info(f"📝 Appended chunk {session.chunk_count}: {len(content)} chars (total: {current_size} bytes)")

        return (
            f"✅ Chunk appended (#{session.chunk_count})\n"
            f"📊 Bytes written: {session.bytes_written}\n"
            f"📄 Current size: {current_size} bytes\n"
            f"💡 Next: append more chunks or call write_file_chunked(mode='finish', session_id='{session_id}')"
        )

    def _handle_finish(self, session_id: Optional[str]) -> str:
        """处理 finish 模式"""
        if not session_id:
            return "Error: session_id is required when mode=finish"

        session = self._load_session(session_id)
        temp_path = Path(session.temp_path)
        file_path = Path(session.path)

        if session.chunk_count == 0:
            return "Error: Cannot finish - no content has been written"

        if not temp_path.exists() or temp_path.stat().st_size == 0:
            return "Error: Cannot finish - temporary file is empty"

        # 移动临时文件到目标位置
        temp_path.replace(file_path)

        final_size = file_path.stat().st_size

        logger.info(f"✅ Finished chunked write: {file_path} ({final_size} bytes, {session.chunk_count} chunks)")

        # 清理会话
        self._delete_session(session_id)

        return (
            f"✅ File written successfully: {file_path.name}\n"
            f"📊 Total size: {final_size} bytes\n"
            f"📝 Chunks written: {session.chunk_count}\n"
            f"💾 Saved to: {file_path}"
        )

    def _handle_abort(self, session_id: Optional[str]) -> str:
        """处理 abort 模式"""
        if not session_id:
            return "Error: session_id is required when mode=abort"

        session = self._load_session(session_id)
        self._cleanup_session(session_id, session)

        logger.info(f"🚫 Aborted chunked write: {session.path}")

        return f"✅ Write session aborted and cleaned up: {session_id}"

    async def _arun(self, mode: WriteMode, path: Optional[str] = None,
                    content: str = "", session_id: Optional[str] = None) -> str:
        return self._run(mode, path, content, session_id)
