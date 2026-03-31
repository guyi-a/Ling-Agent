"""
文件工具 - 提供文件系统的读写操作

工作区路径规则：
  - 所有操作限制在 WORKSPACE_ROOT/{session_id}/ 内
  - 相对路径自动解析为工作区内的路径
  - 绝对路径必须在工作区内，否则拒绝访问

目录结构：
  WORKSPACE_ROOT/
  └── {session_id}/
      ├── uploads/    # 用户上传的原始文件
      └── outputs/    # Agent 生成的结果文件
"""
import logging
from pathlib import Path
from typing import Type, Optional

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from app.core.config import settings

logger = logging.getLogger(__name__)


def get_session_workspace(session_id: str) -> Path:
    """获取当前 session 的工作区目录，不存在则创建"""
    workspace = Path(settings.WORKSPACE_ROOT).resolve() / session_id
    workspace.mkdir(parents=True, exist_ok=True)
    (workspace / "uploads").mkdir(exist_ok=True)
    (workspace / "outputs").mkdir(exist_ok=True)
    return workspace


def resolve_path(path: str, session_id: Optional[str] = None) -> Path:
    """
    解析文件路径：
    - 相对路径 → WORKSPACE_ROOT/{session_id}/{path}
    - 绝对路径 → 原路径（必须在 WORKSPACE_ROOT 内）
    """
    p = Path(path).expanduser()

    if not p.is_absolute():
        if session_id:
            base = get_session_workspace(session_id)
        else:
            base = Path(settings.WORKSPACE_ROOT)
            base.mkdir(parents=True, exist_ok=True)
        p = (base / path).resolve()
    else:
        p = p.resolve()

    # 安全检查：路径必须在 WORKSPACE_ROOT 内
    workspace_root = Path(settings.WORKSPACE_ROOT).resolve()
    try:
        p.relative_to(workspace_root)
    except ValueError:
        raise PermissionError(
            f"Access denied: path '{p}' is outside workspace '{workspace_root}'"
        )

    return p


class _ReadFileInput(BaseModel):
    path: str = Field(description="文件路径（相对于工作区的相对路径，如 uploads/data.csv）")


class _WriteFileInput(BaseModel):
    path: str = Field(description="文件路径（相对于工作区的相对路径，如 outputs/report.md）")
    content: str = Field(description="要写入的内容")


class _ListDirInput(BaseModel):
    path: str = Field(default=".", description="目录路径（默认为 session 工作区根目录）")


class ReadFileTool(BaseTool):
    """读取工作区内的文件内容"""
    name: str = "read_file"
    description: str = (
        "Read the contents of a file in the workspace. "
        "Use relative paths like 'uploads/data.csv' or 'outputs/report.pdf'."
    )
    args_schema: Type[BaseModel] = _ReadFileInput
    current_session_id: Optional[str] = None

    def _run(self, path: str) -> str:
        try:
            p = resolve_path(path, self.current_session_id)
            if not p.exists():
                return f"Error: File not found: {path}"
            if not p.is_file():
                return f"Error: Path is not a file: {path}"
            content = p.read_text(encoding="utf-8")
            logger.info(f"📖 Read file: {p} ({len(content)} chars)")
            return content
        except PermissionError as e:
            return f"Error: {e}"
        except Exception as e:
            return f"Error reading file '{path}': {e}"

    async def _arun(self, path: str) -> str:
        return self._run(path)


class WriteFileTool(BaseTool):
    """在工作区内写入文件（不存在则创建，存在则覆盖）"""
    name: str = "write_file"
    description: str = (
        "Write content to a file in the workspace. "
        "Use relative paths like 'outputs/report.md'. "
        "Creates parent directories automatically."
    )
    args_schema: Type[BaseModel] = _WriteFileInput
    current_session_id: Optional[str] = None

    def _run(self, path: str, content: str) -> str:
        try:
            p = resolve_path(path, self.current_session_id)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8")
            logger.info(f"✏️  Wrote file: {p} ({len(content)} chars)")
            return f"Successfully wrote {len(content)} characters to {p}"
        except PermissionError as e:
            return f"Error: {e}"
        except Exception as e:
            return f"Error writing file '{path}': {e}"

    async def _arun(self, path: str, content: str) -> str:
        return self._run(path, content)


class ListDirTool(BaseTool):
    """列出工作区目录内容"""
    name: str = "list_dir"
    description: str = (
        "List files and directories in the workspace. "
        "Default lists the session root. Use 'uploads' or 'outputs' for subdirectories."
    )
    args_schema: Type[BaseModel] = _ListDirInput
    current_session_id: Optional[str] = None

    def _run(self, path: str = ".") -> str:
        try:
            p = resolve_path(path, self.current_session_id)
            if not p.exists():
                return f"Directory is empty or not found: {path}"
            if not p.is_dir():
                return f"Error: Path is not a directory: {path}"

            entries = sorted(p.iterdir(), key=lambda x: (x.is_file(), x.name))
            if not entries:
                return f"Directory is empty: {p}"

            lines = []
            for entry in entries:
                prefix = "📄 " if entry.is_file() else "📁 "
                size = f" ({entry.stat().st_size} bytes)" if entry.is_file() else ""
                lines.append(f"{prefix}{entry.name}{size}")

            logger.info(f"📂 Listed dir: {p} ({len(entries)} entries)")
            return f"Contents of {p}:\n" + "\n".join(lines)
        except PermissionError as e:
            return f"Error: {e}"
        except Exception as e:
            return f"Error listing directory '{path}': {e}"

    async def _arun(self, path: str = ".") -> str:
        return self._run(path)
