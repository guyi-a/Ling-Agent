"""Browser automation tool using browser-use CLI.

简化实现：
- 直接使用主环境（agent-service/venv）
- browser-use 安装一次，所有会话共享
- 无工作区虚拟环境开销
"""

import asyncio
import json
import logging
import os
import platform
import shlex
from pathlib import Path
from typing import Optional, Type, Literal

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from app.core.config import settings
from app.agent.tools.file_tool import get_session_workspace

logger = logging.getLogger(__name__)

type Locale = Literal["zh-CN", "zh-TW", "en"]

# Command descriptions
COMMAND_DESCRIPTIONS: dict[str, dict[Locale, str]] = {
    "open": {"zh-CN": "打开 {url}", "zh-TW": "開啟 {url}", "en": "Open {url}"},
    "state": {"zh-CN": "获取页面元素", "zh-TW": "取得頁面元素", "en": "Get page elements"},
    "click": {"zh-CN": "点击元素 [{index}]", "zh-TW": "點擊元素 [{index}]", "en": "Click element [{index}]"},
    "profile_list": {"zh-CN": "列出浏览器配置", "zh-TW": "列出瀏覽器設定", "en": "List browser profiles"},
    "close": {"zh-CN": "关闭浏览器", "zh-TW": "關閉瀏覽器", "en": "Close browser"},
    "_unknown": {"zh-CN": "执行浏览器命令", "zh-TW": "執行瀏覽器命令", "en": "Execute browser command"},
}


def _get_command_description(command: str, locale: Locale = "zh-CN") -> str:
    """生成命令的人类可读描述"""
    parts = command.strip().split()
    if not parts:
        return COMMAND_DESCRIPTIONS["_unknown"][locale]

    for part in parts:
        if not part.startswith("-"):
            action = part
            break
    else:
        return COMMAND_DESCRIPTIONS["_unknown"][locale]

    params = {}
    if action == "open" and len(parts) > 1:
        params["url"] = parts[-1]
    elif action == "click" and len(parts) > 1:
        params["index"] = parts[-1]

    template = COMMAND_DESCRIPTIONS.get(action, COMMAND_DESCRIPTIONS["_unknown"])[locale]
    try:
        return template.format(**params)
    except KeyError:
        return template


def _is_system_chrome_installed() -> bool:
    """检查系统是否安装了 Chrome"""
    system = platform.system()

    if system == "Darwin":
        chrome_paths = [Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")]
    elif system == "Windows":
        chrome_paths = [
            Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
        ]
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        if local_app_data:
            chrome_paths.append(Path(local_app_data) / "Google" / "Chrome" / "Application" / "chrome.exe")
    else:
        chrome_paths = [
            Path("/usr/bin/google-chrome-stable"),
            Path("/usr/bin/google-chrome"),
        ]

    return any(path.exists() for path in chrome_paths)


def _is_chromium_installed() -> bool:
    """检查 Playwright Chromium 是否已安装"""
    system = platform.system()
    if system == "Darwin":
        browsers_path = Path.home() / "Library" / "Caches" / "ms-playwright"
    elif system == "Windows":
        browsers_path = Path(os.environ.get("LOCALAPPDATA", "")) / "ms-playwright"
    else:
        browsers_path = Path.home() / ".cache" / "ms-playwright"

    if not browsers_path.exists():
        return False

    return any(item.name.startswith("chromium-") for item in browsers_path.iterdir())


def _is_browser_available() -> bool:
    """检查是否有可用的浏览器"""
    return _is_system_chrome_installed() or _is_chromium_installed()


def _browser_session_config_path(workspace_dir: Path, session_id: str) -> Path:
    """获取浏览器会话配置文件路径"""
    return workspace_dir / ".browser-use" / f"session-{session_id}.json"


def _load_browser_session_config(workspace_dir: Path, session_id: str) -> dict:
    """加载浏览器会话配置"""
    path = _browser_session_config_path(workspace_dir, session_id)
    if not path.exists():
        return {}

    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def _save_browser_session_config(workspace_dir: Path, session_id: str, config: dict) -> None:
    """保存浏览器会话配置"""
    path = _browser_session_config_path(workspace_dir, session_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, ensure_ascii=False))


def _clear_browser_session_config(workspace_dir: Path, session_id: str) -> None:
    """清除浏览器会话配置"""
    path = _browser_session_config_path(workspace_dir, session_id)
    path.unlink(missing_ok=True)


# =============================================================================
# Install Browser-Use Tool
# =============================================================================

class _InstallBrowserUseInput(BaseModel):
    step: str = Field(
        default="check",
        description="Installation step: check, install, or chromium"
    )
    index_url: Optional[str] = Field(
        default=None,
        description="Optional PyPI mirror URL for faster installation"
    )


class InstallBrowserUseTool(BaseTool):
    """Install browser-use CLI to main environment step by step."""

    name: str = "install_browser_use"
    description: str = (
        "Install browser-use CLI to the main Python environment step by step. "
        "Call this tool multiple times with different steps until installation is complete. "
        "Steps: check (start here), install (install CLI), chromium (install browser)."
    )
    args_schema: Type[BaseModel] = _InstallBrowserUseInput

    def _run(self, step: str = "check", index_url: Optional[str] = None) -> str:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(asyncio.run, self._execute(step, index_url))
                    return future.result()
            else:
                return loop.run_until_complete(self._execute(step, index_url))
        except Exception as e:
            return f"Error: {e}"

    async def _arun(self, step: str = "check", index_url: Optional[str] = None) -> str:
        return await self._execute(step, index_url)

    async def _execute(self, step: str, index_url: Optional[str]) -> str:
        if step == "check":
            # 检查 browser-use 命令是否可用（使用 --help 检查）
            proc = await asyncio.create_subprocess_shell(
                "browser-use --help",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()
            has_cli = proc.returncode == 0
            has_browser = _is_browser_available()

            if has_cli and has_browser:
                return "✅ browser-use CLI is already installed and ready to use.\nNext step: None (installation complete)"

            if not has_cli:
                return "📦 Need to install browser-use CLI.\nNext step: install"

            return "🌐 Need to install Chromium browser.\nNext step: chromium"

        elif step == "install":
            # 再次检查是否已安装（使用 --help 检查）
            proc = await asyncio.create_subprocess_shell(
                "browser-use --help",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()
            if proc.returncode == 0:
                next_step = "chromium" if not _is_browser_available() else "None (installation complete)"
                return f"✅ browser-use is already installed.\nNext step: {next_step}"

            # 使用 pip 安装到主环境
            install_cmd = "pip install browser-use"
            if index_url:
                install_cmd += f" -i {index_url}"

            logger.info(f"📦 Installing browser-use: {install_cmd}")

            proc = await asyncio.create_subprocess_shell(
                install_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            output = stdout.decode() + stderr.decode()

            if proc.returncode == 0:
                next_step = "chromium" if not _is_browser_available() else "None (installation complete)"
                return f"✅ browser-use installed successfully.\nNext step: {next_step}\n\nOutput:\n{output[:500]}"
            else:
                return f"❌ Failed to install browser-use.\nError:\n{output[:500]}"

        elif step == "chromium":
            if _is_browser_available():
                msg = "✅ System Chrome detected, skipping Chromium installation." \
                    if _is_system_chrome_installed() else "✅ Chromium is already installed."
                return f"{msg}\nNext step: None (installation complete)"

            # 使用 playwright 安装 Chromium
            install_cmd = "playwright install chromium"

            logger.info(f"🌐 Installing Chromium: {install_cmd}")

            proc = await asyncio.create_subprocess_shell(
                install_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            output = stdout.decode() + stderr.decode()

            if proc.returncode == 0 or _is_chromium_installed():
                return f"✅ Chromium installed successfully. browser-use is now ready!\nNext step: None (installation complete)\n\nOutput:\n{output[:500]}"
            else:
                return f"❌ Failed to install Chromium.\nError:\n{output[:500]}"

        else:
            return f"❌ Unknown step: {step}. Valid steps are: check, install, chromium"


# =============================================================================
# Browser-Use Tool
# =============================================================================

class _BrowserUseInput(BaseModel):
    command: str = Field(description="Browser-use CLI command to execute")


class BrowserUseTool(BaseTool):
    """Execute browser-use CLI commands for browser automation."""

    name: str = "browser_use"
    description: str = (
        "Execute a browser-use CLI command to control a browser. "
        "Browser window is always visible (headed mode) for user observation. "
        "If browser-use is not installed, use install_browser_use tool first. "
        "Examples: 'open https://example.com', 'state', 'click 5', 'get text 10', 'close'"
    )
    args_schema: Type[BaseModel] = _BrowserUseInput
    current_session_id: Optional[str] = None

    def _run(self, command: str) -> str:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(asyncio.run, self._execute(command))
                    return future.result()
            else:
                return loop.run_until_complete(self._execute(command))
        except Exception as e:
            return f"Error: {e}"

    async def _arun(self, command: str) -> str:
        return await self._execute(command)

    async def _execute(self, command: str) -> str:
        # 获取工作区目录（用于会话配置和 cwd）
        if self.current_session_id:
            workspace_dir = get_session_workspace(self.current_session_id)
        else:
            workspace_dir = Path(settings.WORKSPACE_ROOT).resolve()
            workspace_dir.mkdir(parents=True, exist_ok=True)

        # 生成描述
        description = _get_command_description(command, "zh-CN")
        logger.info(f"🌐 {description}")

        # 检查 browser-use 是否已安装（使用 --help 检查）
        proc = await asyncio.create_subprocess_shell(
            "browser-use --help",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        if proc.returncode != 0:
            return (
                "❌ browser-use CLI is not installed.\n"
                "Please call install_browser_use(step='check') first to check installation status "
                "and follow the returned next_step to complete installation."
            )

        if not _is_browser_available():
            return (
                "❌ No browser available.\n"
                "Please call install_browser_use(step='chromium') to install Chromium."
            )

        # 构建完整命令
        session_name = f"session-{self.current_session_id or 'default'}"
        cmd_str = f"browser-use --headed --session {session_name} {command}"

        logger.info(f"🖥️  Executing: {cmd_str}")

        # 执行命令
        proc = await asyncio.create_subprocess_shell(
            cmd_str,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(workspace_dir),
        )
        stdout, stderr = await proc.communicate()
        output = stdout.decode() + stderr.decode()

        # 添加特殊命令提示
        if "state" in command:
            output = (
                "🚫 STOP: `state` output is only for locating elements.\n\n"
                "Do NOT use text from `state` output directly in the final answer.\n"
                "Use `get text <index>` for single element or `eval` for extraction.\n\n"
                + output
            )

        if "switch" in command:
            output = (
                "🚫 STOP: `switch <index>` does NOT complete tab inspection.\n\n"
                "Continue switching through remaining tabs if this one is not the intended destination.\n\n"
                + output
            )

        # 格式化结果
        result_parts = [
            f"Command: {description}",
            f"Exit code: {proc.returncode or 0}",
        ]
        if output:
            result_parts.append(f"Output:\n{output}")

        return "\n\n".join(result_parts)
