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
    """读取工作区内的文件内容（支持纯文本和文档格式）"""
    name: str = "read_file"
    description: str = (
        "Read file contents from the workspace. "
        "Supports:\n"
        "- Text files: .txt, .md, .csv, .py, .js, .json, etc.\n"
        "- Documents: .docx (Word), .pdf (PDF), .pptx (PowerPoint)\n"
        "For documents, automatically extracts text, tables, and images.\n"
        "Use relative paths like 'uploads/report.pdf' or 'outputs/data.csv'."
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

            # 根据扩展名选择处理方式
            ext = p.suffix.lower()

            if ext == '.docx':
                return self._read_docx(p)
            elif ext == '.pdf':
                return self._read_pdf(p)
            elif ext == '.pptx':
                return self._read_pptx(p)
            else:
                # 纯文本读取
                content = p.read_text(encoding="utf-8")
                logger.info(f"📖 Read text file: {p} ({len(content)} chars)")
                return content

        except PermissionError as e:
            return f"Error: {e}"
        except UnicodeDecodeError:
            return f"Error: Cannot read binary file '{path}' as text. Use a document tool or convert it first."
        except Exception as e:
            logger.error(f"Error reading file: {e}")
            return f"Error reading file '{path}': {e}"

    def _read_docx(self, path: Path) -> str:
        """读取 Word 文档"""
        try:
            from docx import Document

            doc = Document(str(path))

            # 提取文本
            text = "\n\n".join(p.text.strip() for p in doc.paragraphs if p.text.strip())

            # 提取表格
            tables = []
            for table in doc.tables:
                rows = [[cell.text.strip() for cell in row.cells] for row in table.rows]
                if rows:
                    tables.append(rows)

            # 提取图片
            images = []
            out_dir = path.parent / f"{path.stem}_images"
            out_dir.mkdir(exist_ok=True)

            img_count = 0
            for rel in doc.part.rels.values():
                if "image" in rel.reltype:
                    try:
                        img_count += 1
                        content_type = rel.target_part.content_type
                        ext = content_type.split("/")[-1].replace("jpeg", "jpg")
                        img_path = out_dir / f"image_{img_count:03d}.{ext}"
                        img_path.write_bytes(rel.target_part.blob)
                        images.append(str(img_path))
                    except Exception as e:
                        logger.warning(f"Failed to extract image: {e}")

            logger.info(f"📄 Read Word: {len(text)} chars, {len(tables)} tables, {len(images)} images")

            # 格式化返回结果
            output = f"📄 Document: {path.name}\n"
            output += f"📊 Pages: {len(doc.paragraphs)}\n"
            output += f"📝 Text length: {len(text)} characters\n"

            if tables:
                output += f"📋 Tables: {len(tables)}\n"

            if images:
                output += f"🖼️ Images: {len(images)}\n"
                output += f"Image paths:\n"
                for img in images:
                    output += f"  - {img}\n"

            output += f"\n--- Content ---\n{text}"
            return output

        except ImportError:
            return "Error: python-docx library not installed. Run: pip install python-docx"
        except Exception as e:
            return f"Error reading Word document: {e}"

    def _read_pdf(self, path: Path) -> str:
        """读取 PDF 文档"""
        try:
            import fitz  # PyMuPDF

            doc = fitz.open(str(path))

            # 提取文本
            text_parts = []
            images = []
            out_dir = path.parent / f"{path.stem}_images"
            out_dir.mkdir(exist_ok=True)

            img_count = 0
            for page_num, page in enumerate(doc, 1):
                # 提取文本
                page_text = page.get_text()
                if page_text.strip():
                    text_parts.append(f"--- Page {page_num} ---\n{page_text}")

                # 提取图片
                for img_idx, img in enumerate(page.get_images(), 1):
                    try:
                        xref = img[0]
                        base_image = doc.extract_image(xref)
                        img_bytes = base_image["image"]
                        img_ext = base_image["ext"]

                        img_count += 1
                        img_path = out_dir / f"page{page_num}_img{img_idx}.{img_ext}"
                        img_path.write_bytes(img_bytes)
                        images.append(str(img_path))
                    except Exception as e:
                        logger.warning(f"Failed to extract image from page {page_num}: {e}")

            text = "\n\n".join(text_parts)
            page_count = doc.page_count

            logger.info(f"📕 Read PDF: {page_count} pages, {len(text)} chars, {len(images)} images")

            doc.close()

            # 格式化返回结果
            output = f"📄 Document: {path.name}\n"
            output += f"📊 Pages: {page_count}\n"
            output += f"📝 Text length: {len(text)} characters\n"

            if images:
                output += f"🖼️ Images: {len(images)}\n"
                output += f"Image paths:\n"
                for img in images:
                    output += f"  - {img}\n"

            output += f"\n--- Content ---\n{text}"
            return output

        except ImportError:
            return "Error: PyMuPDF library not installed. Run: pip install PyMuPDF"
        except Exception as e:
            return f"Error reading PDF document: {e}"

    def _read_pptx(self, path: Path) -> str:
        """读取 PowerPoint 文档"""
        try:
            from pptx import Presentation

            prs = Presentation(str(path))

            # 提取每页文本
            text_parts = []
            images = []
            out_dir = path.parent / f"{path.stem}_images"
            out_dir.mkdir(exist_ok=True)

            img_count = 0
            for slide_num, slide in enumerate(prs.slides, 1):
                slide_texts = []

                # 遍历所有形状
                for shape in slide.shapes:
                    # 提取文本
                    if hasattr(shape, "text") and shape.text.strip():
                        slide_texts.append(shape.text.strip())

                    # 提取图片
                    if shape.shape_type == 13:  # MSO_SHAPE_TYPE.PICTURE
                        try:
                            img_count += 1
                            image = shape.image
                            img_bytes = image.blob
                            img_ext = image.ext

                            img_path = out_dir / f"slide{slide_num}_img{img_count}.{img_ext}"
                            img_path.write_bytes(img_bytes)
                            images.append(str(img_path))
                        except Exception as e:
                            logger.warning(f"Failed to extract image from slide {slide_num}: {e}")

                if slide_texts:
                    text_parts.append(f"--- Slide {slide_num} ---\n" + "\n".join(slide_texts))

            text = "\n\n".join(text_parts)

            logger.info(f"📊 Read PPTX: {len(prs.slides)} slides, {len(text)} chars, {len(images)} images")

            # 格式化返回结果
            output = f"📄 Document: {path.name}\n"
            output += f"📊 Slides: {len(prs.slides)}\n"
            output += f"📝 Text length: {len(text)} characters\n"

            if images:
                output += f"🖼️ Images: {len(images)}\n"
                output += f"Image paths:\n"
                for img in images:
                    output += f"  - {img}\n"

            output += f"\n--- Content ---\n{text}"
            return output

        except ImportError:
            return "Error: python-pptx library not installed. Run: pip install python-pptx"
        except Exception as e:
            return f"Error reading PowerPoint document: {e}"

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
