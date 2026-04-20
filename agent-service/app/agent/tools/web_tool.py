"""
Web 工具 - 提供网页抓取和搜索功能
"""
import logging
import re
import ipaddress
from html import unescape
from typing import Type
from urllib.parse import urlparse

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ========== SSRF 防护 ==========
_PRIVATE_HOSTNAMES = {"localhost"}

def _is_private_ip(ip: str) -> bool:
    """检查 IP 是否为私有地址"""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return bool(
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    )


def _hostname_is_private(hostname: str) -> bool:
    """检查主机名是否为私有网络"""
    hn = hostname.strip().lower().rstrip(".")
    if hn in _PRIVATE_HOSTNAMES:
        return True

    # IPv6 地址可能带方括号
    hn = hn.removeprefix("[").removesuffix("]")

    # 直接的 IP 地址
    if _is_private_ip(hn):
        return True

    # 阻止常见的内部域名
    if hn.endswith(".local") or hn.endswith(".internal"):
        return True

    return False


# ========== HTML 文本提取 ==========
_WS_RE = re.compile(r"\s+")

def _extract_text_from_html(html: str) -> str:
    """从 HTML 提取纯文本"""
    # 去除非正文内容
    html = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    # 去除剩余标签
    html = re.sub(r"(?is)<[^>]+>", " ", html)
    # HTML 实体解码
    text = unescape(html)
    # 空白归一化
    text = _WS_RE.sub(" ", text).strip()
    return text


class _WebFetchInput(BaseModel):
    url: str = Field(description="要抓取内容的 URL")
    timeout: int = Field(default=15, description="请求超时秒数")
    max_bytes: int = Field(default=2_000_000, description="最大下载字节数（默认 2MB）")


class _WebSearchInput(BaseModel):
    query: str = Field(description="搜索关键词")
    search_type: str = Field(default="text", description="搜索类型：text=常规搜索，news=新闻搜索")
    max_results: int = Field(default=10, description="返回结果数量，最多 10")
    timelimit: str = Field(default=None, description="时间过滤（仅新闻搜索）：d=天，w=周，m=月，y=年")
    region: str = Field(default="cn-zh", description="搜索地区，如 cn-zh（中文）、us-en（英文）")
    safesearch: str = Field(default="moderate", description="安全搜索：on / moderate / off")
    allowed_domains: list = Field(default=None, description="只返回这些域名的结果，如 ['zhihu.com']")
    blocked_domains: list = Field(default=None, description="排除这些域名的结果")


class WebFetchTool(BaseTool):
    """抓取指定 URL 的网页内容（返回纯文本）"""
    name: str = "web_fetch"
    description: str = (
        "Fetch the content of a web page at the given URL and return it as plain text. "
        "Use this to read documentation, articles, or any public web page. "
        "Includes SSRF protection (blocks private/localhost URLs) and size limits (max 2MB by default)."
    )
    args_schema: Type[BaseModel] = _WebFetchInput

    def _run(self, url: str, timeout: int = 15, max_bytes: int = 2_000_000) -> str:
        try:
            import httpx

            # URL 验证
            if not url or not url.strip():
                return "Error: URL is empty"

            parsed = urlparse(url.strip())
            if parsed.scheme not in ("http", "https"):
                return "Error: Only http/https URLs are supported"

            if not parsed.netloc:
                return "Error: Invalid URL - missing host"

            # SSRF 防护：阻止私有网络访问
            hostname = parsed.hostname or ""
            if _hostname_is_private(hostname):
                return (
                    f"Error: Blocked private network URL for security: {url}\n"
                    f"Private/localhost URLs are not allowed to prevent SSRF attacks."
                )

            # 大小限制验证
            if max_bytes <= 0 or max_bytes > 20_000_000:
                return "Error: max_bytes must be between 1 and 20,000,000"

            if timeout <= 0 or timeout > 120:
                return "Error: timeout must be between 1 and 120 seconds"

            # 设置请求头
            headers = {
                "User-Agent": "Ling-Agent/1.0 (+https://github.com/ling-agent)",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }

            # 发起请求（同步方式）
            with httpx.Client(
                follow_redirects=True,
                headers=headers,
                timeout=httpx.Timeout(timeout),
            ) as client:
                response = client.get(url)
                response.raise_for_status()

                # 检查响应大小
                content = response.content
                if len(content) > max_bytes:
                    return (
                        f"Error: Response too large ({len(content)} bytes), "
                        f"exceeded max_bytes={max_bytes}"
                    )

                # 解码内容
                encoding = response.encoding or "utf-8"
                html_content = content.decode(encoding, errors="replace")

            # 提取纯文本
            text = _extract_text_from_html(html_content)

            # 截断过长内容（文本级别）
            max_chars = 10000
            if len(text) > max_chars:
                text = text[:max_chars] + f"\n\n... (truncated, total {len(text)} chars)"

            logger.info(f"🌐 Fetched URL: {url} ({len(text)} chars, {len(content)} bytes)")
            return text

        except httpx.TimeoutException:
            return f"Error: Request timeout after {timeout} seconds for '{url}'"
        except httpx.HTTPStatusError as e:
            return f"Error: HTTP {e.response.status_code} for '{url}'"
        except httpx.RequestError as e:
            return f"Error: Request failed for '{url}': {e}"
        except Exception as e:
            logger.error(f"Unexpected error in web_fetch: {e}")
            return f"Unexpected error fetching '{url}': {e}"

    async def _arun(self, url: str, timeout: int = 15, max_bytes: int = 2_000_000) -> str:
        """异步版本（使用 httpx.AsyncClient）"""
        try:
            import httpx

            # URL 验证
            if not url or not url.strip():
                return "Error: URL is empty"

            parsed = urlparse(url.strip())
            if parsed.scheme not in ("http", "https"):
                return "Error: Only http/https URLs are supported"

            if not parsed.netloc:
                return "Error: Invalid URL - missing host"

            # SSRF 防护
            hostname = parsed.hostname or ""
            if _hostname_is_private(hostname):
                return (
                    f"Error: Blocked private network URL for security: {url}\n"
                    f"Private/localhost URLs are not allowed to prevent SSRF attacks."
                )

            # 大小和超时验证
            if max_bytes <= 0 or max_bytes > 20_000_000:
                return "Error: max_bytes must be between 1 and 20,000,000"
            if timeout <= 0 or timeout > 120:
                return "Error: timeout must be between 1 and 120 seconds"

            headers = {
                "User-Agent": "Ling-Agent/1.0 (+https://github.com/ling-agent)",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }

            # 异步请求
            async with httpx.AsyncClient(
                follow_redirects=True,
                headers=headers,
                timeout=httpx.Timeout(timeout),
            ) as client:
                response = await client.get(url)
                response.raise_for_status()

                content = response.content
                if len(content) > max_bytes:
                    return (
                        f"Error: Response too large ({len(content)} bytes), "
                        f"exceeded max_bytes={max_bytes}"
                    )

                encoding = response.encoding or "utf-8"
                html_content = content.decode(encoding, errors="replace")

            text = _extract_text_from_html(html_content)

            max_chars = 10000
            if len(text) > max_chars:
                text = text[:max_chars] + f"\n\n... (truncated, total {len(text)} chars)"

            logger.info(f"🌐 Fetched URL (async): {url} ({len(text)} chars, {len(content)} bytes)")
            return text

        except httpx.TimeoutException:
            return f"Error: Request timeout after {timeout} seconds for '{url}'"
        except httpx.HTTPStatusError as e:
            return f"Error: HTTP {e.response.status_code} for '{url}'"
        except httpx.RequestError as e:
            return f"Error: Request failed for '{url}': {e}"
        except Exception as e:
            logger.error(f"Unexpected error in web_fetch (async): {e}")
            return f"Unexpected error fetching '{url}': {e}"


def _is_safe_url(url: str) -> bool:
    try:
        return urlparse(url).scheme in ("http", "https")
    except Exception:
        return False


def _matches_domain(url: str, domain: str) -> bool:
    try:
        hostname = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    domain = domain.lower().strip()
    if domain.startswith("*."):
        suffix = domain[2:]
        return hostname == suffix or hostname.endswith("." + suffix)
    return hostname == domain or hostname.endswith("." + domain)


def _filter_by_domains(results: list, url_key: str, allowed: list, blocked: list) -> list:
    out = []
    for r in results:
        url = r.get(url_key, "")
        if not _is_safe_url(url):
            continue
        if blocked and any(_matches_domain(url, d) for d in blocked):
            continue
        if allowed and not any(_matches_domain(url, d) for d in allowed):
            continue
        out.append(r)
    return out


class WebSearchTool(BaseTool):
    """DuckDuckGo 搜索工具（支持常规搜索和新闻搜索）"""
    name: str = "web_search"
    description: str = (
        "Search the web using DuckDuckGo.\n"
        "Parameters:\n"
        "- query: Search keywords (required)\n"
        "- search_type: 'text' (default) or 'news'\n"
        "- max_results: Number of results (default 10, max 10)\n"
        "- region: Region code, e.g. 'cn-zh' (default), 'us-en'\n"
        "- timelimit: Time filter for news: d=day, w=week, m=month\n"
        "- allowed_domains: Only return results from these domains\n"
        "- blocked_domains: Exclude results from these domains"
    )
    args_schema: Type[BaseModel] = _WebSearchInput

    def _run(
        self,
        query: str,
        search_type: str = "text",
        max_results: int = 10,
        timelimit: str = None,
        region: str = "cn-zh",
        safesearch: str = "moderate",
        allowed_domains: list = None,
        blocked_domains: list = None,
    ) -> list:
        import functools
        import anyio.from_thread
        from ddgs import DDGS

        max_results = min(max(1, max_results), 10)
        logger.info(f"🔍 DuckDuckGo search: '{query}' (type={search_type}, region={region})")

        try:
            with DDGS() as ddgs:
                kwargs = {"max_results": max_results, "safesearch": safesearch}
                if region:
                    kwargs["region"] = region

                if search_type == "news":
                    if timelimit:
                        kwargs["timelimit"] = timelimit
                    raw = list(ddgs.news(query, **kwargs))
                    raw.sort(key=lambda x: x.get("date") or "", reverse=True)
                    url_key = "url"
                else:
                    raw = list(ddgs.text(query, **kwargs))
                    url_key = "href"

            results = _filter_by_domains(raw, url_key, allowed_domains, blocked_domains)
            logger.info(f"✅ 找到 {len(results)} 条结果")
            return results

        except Exception as e:
            logger.error(f"web_search 失败: {e}")
            return []

    async def _arun(
        self,
        query: str,
        search_type: str = "text",
        max_results: int = 10,
        timelimit: str = None,
        region: str = "cn-zh",
        safesearch: str = "moderate",
        allowed_domains: list = None,
        blocked_domains: list = None,
    ) -> list:
        import functools
        import anyio.to_thread

        max_results = min(max(1, max_results), 10)
        logger.info(f"🔍 DuckDuckGo search: '{query}' (type={search_type}, region={region})")

        try:
            from ddgs import DDGS

            with DDGS() as ddgs:
                kwargs = {"max_results": max_results, "safesearch": safesearch}
                if region:
                    kwargs["region"] = region

                if search_type == "news":
                    if timelimit:
                        kwargs["timelimit"] = timelimit
                    search_fn = functools.partial(ddgs.news, query, **kwargs)
                else:
                    search_fn = functools.partial(ddgs.text, query, **kwargs)

                raw = list(await anyio.to_thread.run_sync(search_fn))

            if search_type == "news":
                raw.sort(key=lambda x: x.get("date") or "", reverse=True)
                url_key = "url"
            else:
                url_key = "href"

            results = _filter_by_domains(raw, url_key, allowed_domains, blocked_domains)
            logger.info(f"✅ 找到 {len(results)} 条结果")
            return results

        except Exception as e:
            logger.error(f"web_search 失败: {e}")
            return []
