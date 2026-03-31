"""
字体管理工具 - 自动下载和配置中文字体

提供：
  - install_noto_sans_sc: 下载思源黑体到 ~/.ling-agent/fonts/
  - get_font_config_code: 返回各种库的字体配置代码模板
"""
import asyncio
import logging
from pathlib import Path
from typing import Optional, Type

import httpx
from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from app.core.config import settings

logger = logging.getLogger(__name__)

# 字体存储目录
FONT_DIR = Path.home() / ".ling-agent" / "fonts"
NOTO_SANS_SC_URL = (
    "https://raw.githubusercontent.com/google/fonts/main/"
    "ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf"
)


class _InstallFontInput(BaseModel):
    pass  # 无需参数


class InstallNotoSansSCTool(BaseTool):
    """下载思源黑体到 ~/.ling-agent/fonts/NotoSansSC.ttf（幂等）"""

    name: str = "install_noto_sans_sc"
    description: str = (
        "Download NotoSansSC variable font to ~/.ling-agent/fonts/NotoSansSC.ttf. "
        "Idempotent - skips if already present. "
        "Use this before generating Chinese charts, PDFs, or PPTXs."
    )
    args_schema: Type[BaseModel] = _InstallFontInput

    def _run(self) -> str:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(asyncio.run, self._download())
                    return future.result()
            else:
                return loop.run_until_complete(self._download())
        except Exception as e:
            return f"Error: {e}"

    async def _arun(self) -> str:
        return await self._download()

    async def _download(self) -> str:
        dest = FONT_DIR / "NotoSansSC.ttf"
        if dest.exists():
            return f"✅ NotoSansSC already installed at {dest}"

        FONT_DIR.mkdir(parents=True, exist_ok=True)
        logger.info(f"📥 Downloading NotoSansSC from {NOTO_SANS_SC_URL}...")

        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
                async with client.stream("GET", NOTO_SANS_SC_URL) as resp:
                    resp.raise_for_status()
                    total = int(resp.headers.get("Content-Length") or 0) or None
                    received = 0

                    with open(dest, "wb") as f:
                        async for chunk in resp.aiter_bytes(65536):
                            f.write(chunk)
                            received += len(chunk)
                            if total:
                                logger.info(f"Progress: {received / total * 100:.1f}%")

            logger.info(f"✅ NotoSansSC installed at {dest}")
            return f"✅ NotoSansSC installed at {dest} ({received / 1048576:.1f} MB)"
        except Exception as e:
            logger.error(f"Failed to download font: {e}", exc_info=True)
            return f"❌ Failed to download font: {e}"


# 字体配置代码模板（供 Skills 使用）
MATPLOTLIB_FONT_CONFIG = """
# ========== 字体配置 - 必须放在最开头 ==========
import matplotlib.font_manager as fm
from pathlib import Path

font_path = Path.home() / ".ling-agent" / "fonts" / "NotoSansSC.ttf"
if not font_path.exists():
    raise FileNotFoundError(
        f"Font not found: {font_path}\\n"
        "Please run: install_noto_sans_sc() first"
    )

fm.fontManager.addfont(str(font_path))

import matplotlib.pyplot as plt  # 必须在 addfont 之后导入！

def set_chinese_font():
    plt.rcParams["font.family"] = fm.FontProperties(fname=str(font_path)).get_name()
    plt.rcParams["axes.unicode_minus"] = False

set_chinese_font()
# ==============================================
"""

REPORTLAB_FONT_CONFIG = """
# ========== ReportLab 字体配置 ==========
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pathlib import Path

font_path = Path.home() / ".ling-agent" / "fonts" / "NotoSansSC.ttf"
if not font_path.exists():
    raise FileNotFoundError(f"Font not found: {font_path}")

pdfmetrics.registerFont(TTFont('NotoSansSC', str(font_path)))
PDF_FONT = 'NotoSansSC'
# =========================================
"""

PPTX_FONT_CONFIG = """
# ========== python-pptx 字体配置 ==========
from pptx.oxml.ns import qn

PPTX_FONT = "Microsoft YaHei"  # Windows 默认中文字体

def apply_chinese_font(shape):
    \"\"\"将 shape 的所有文本设置为中文字体\"\"\"
    if not shape.has_text_frame:
        return
    for para in shape.text_frame.paragraphs:
        for run in para.runs:
            run.font.name = PPTX_FONT
            run._r.get_or_add_rPr().get_or_add_rFonts().set(qn('a:ea'), PPTX_FONT)
# ==========================================
"""
