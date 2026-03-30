"""
Web 工具 - 提供网页抓取和搜索功能
"""
import logging
from typing import Type

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class _WebFetchInput(BaseModel):
    url: str = Field(description="要抓取内容的 URL")
    timeout: int = Field(default=15, description="请求超时秒数")


class _WebSearchInput(BaseModel):
    query: str = Field(description="搜索关键词")
    max_results: int = Field(default=5, description="返回结果数量，最多 10")


class WebFetchTool(BaseTool):
    """抓取指定 URL 的网页内容（返回纯文本）"""
    name: str = "web_fetch"
    description: str = (
        "Fetch the content of a web page at the given URL and return it as plain text. "
        "Use this to read documentation, articles, or any public web page."
    )
    args_schema: Type[BaseModel] = _WebFetchInput

    def _run(self, url: str, timeout: int = 15) -> str:
        try:
            import urllib.request
            import html.parser

            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; LingAgent/1.0)"}
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                charset = resp.headers.get_content_charset() or "utf-8"
                html_text = raw.decode(charset, errors="replace")

            # 简单去除 HTML 标签
            class _Stripper(html.parser.HTMLParser):
                def __init__(self):
                    super().__init__()
                    self.parts = []
                    self._skip = False

                def handle_starttag(self, tag, attrs):
                    if tag in ("script", "style"):
                        self._skip = True

                def handle_endtag(self, tag):
                    if tag in ("script", "style"):
                        self._skip = False

                def handle_data(self, data):
                    if not self._skip:
                        stripped = data.strip()
                        if stripped:
                            self.parts.append(stripped)

            stripper = _Stripper()
            stripper.feed(html_text)
            text = "\n".join(stripper.parts)

            # 截断过长内容
            max_chars = 8000
            if len(text) > max_chars:
                text = text[:max_chars] + f"\n\n... (truncated, total {len(text)} chars)"

            logger.info(f"🌐 Fetched URL: {url} ({len(text)} chars)")
            return text

        except Exception as e:
            return f"Error fetching '{url}': {e}"

    async def _arun(self, url: str, timeout: int = 15) -> str:
        return self._run(url, timeout)


class WebSearchTool(BaseTool):
    """使用 DuckDuckGo 搜索网页（无需 API Key）"""
    name: str = "web_search"
    description: str = (
        "Search the web using DuckDuckGo and return a list of results with titles, URLs, and snippets. "
        "Use this for general web searches, finding information, or locating resources."
    )
    args_schema: Type[BaseModel] = _WebSearchInput

    def _run(self, query: str, max_results: int = 5) -> str:
        try:
            import urllib.request
            import urllib.parse
            import json

            max_results = min(max_results, 10)
            params = urllib.parse.urlencode({
                "q": query,
                "format": "json",
                "no_html": "1",
                "skip_disambig": "1",
            })
            url = f"https://api.duckduckgo.com/?{params}"

            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; LingAgent/1.0)"}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            results = []

            # Instant Answer
            if data.get("AbstractText"):
                results.append(
                    f"**{data.get('Heading', 'Summary')}**\n"
                    f"{data['AbstractText']}\n"
                    f"Source: {data.get('AbstractURL', '')}"
                )

            # Related Topics
            for topic in data.get("RelatedTopics", [])[:max_results]:
                if isinstance(topic, dict) and topic.get("Text"):
                    results.append(
                        f"- {topic['Text']}\n"
                        f"  URL: {topic.get('FirstURL', '')}"
                    )

            if not results:
                return f"No results found for: {query}"

            logger.info(f"🔍 Web search: '{query}' ({len(results)} results)")
            return f"Search results for '{query}':\n\n" + "\n\n".join(results)

        except Exception as e:
            return f"Error searching '{query}': {e}"

    async def _arun(self, query: str, max_results: int = 5) -> str:
        return self._run(query, max_results)
