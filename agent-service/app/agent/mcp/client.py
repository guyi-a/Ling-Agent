from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List

from langchain.tools import BaseTool

logger = logging.getLogger(__name__)

_MCP_DIR = Path(__file__).resolve().parent
_CONFIG_PATH = _MCP_DIR / "mcp_servers.json"

_client = None
_mcp_tools: List[BaseTool] = []
_high_risk_names: set[str] = set()


def _expand_env(value: Any) -> Any:
    if isinstance(value, str):
        return os.path.expandvars(value)
    if isinstance(value, list):
        return [_expand_env(v) for v in value]
    if isinstance(value, dict):
        return {k: _expand_env(v) for k, v in value.items()}
    return value


def _load_config() -> Dict[str, Any]:
    if not _CONFIG_PATH.exists():
        logger.info("MCP 配置文件不存在，跳过: %s", _CONFIG_PATH)
        return {}

    try:
        raw = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.error("读取 MCP 配置失败: %s", exc)
        return {}

    return _expand_env(raw)


def _build_connections(config: Dict[str, Any]) -> tuple[
    Dict[str, Dict[str, Any]],
    Dict[str, Dict[str, Any]],
]:
    """返回 (connections_for_client, meta_per_server)"""
    servers = config.get("servers") or {}
    connections: Dict[str, Dict[str, Any]] = {}
    meta: Dict[str, Dict[str, Any]] = {}

    for name, cfg in servers.items():
        if not cfg or not cfg.get("enabled", False):
            continue

        transport = cfg.get("transport")
        conn: Dict[str, Any] = {}

        if transport == "stdio":
            command = cfg.get("command")
            if not command:
                logger.warning("MCP server '%s' 缺少 command，已跳过", name)
                continue
            conn = {"transport": "stdio", "command": command, "args": cfg.get("args", [])}
            if cfg.get("env"):
                conn["env"] = cfg["env"]

        elif transport == "sse":
            url = cfg.get("url")
            if not url:
                logger.warning("MCP server '%s' 缺少 url，已跳过", name)
                continue
            conn = {"transport": "sse", "url": url}
            if cfg.get("headers"):
                conn["headers"] = cfg["headers"]

        elif transport in ("http", "streamable_http", "streamable-http"):
            url = cfg.get("url")
            if not url:
                logger.warning("MCP server '%s' 缺少 url，已跳过", name)
                continue
            conn = {"transport": "http", "url": url}
            if cfg.get("headers"):
                conn["headers"] = cfg["headers"]

        else:
            logger.warning("MCP server '%s' transport=%s 不支持，已跳过", name, transport)
            continue

        connections[name] = conn
        meta[name] = {
            "risk_level": str(cfg.get("risk_level", "low")).lower(),
            "high_risk_tools": set(cfg.get("high_risk_tools") or []),
        }

    return connections, meta


async def start_mcp_client() -> None:
    global _client, _mcp_tools, _high_risk_names

    _mcp_tools = []
    _high_risk_names = set()

    config = _load_config()
    if not config:
        return

    connections, meta = _build_connections(config)
    if not connections:
        logger.info("无已启用的 MCP Server，跳过")
        return

    from langchain_mcp_adapters.client import MultiServerMCPClient

    all_tools: List[BaseTool] = []
    for server_name, conn in connections.items():
        try:
            client = MultiServerMCPClient({server_name: conn})
            tools = await client.get_tools()
        except Exception as exc:
            logger.warning("MCP server '%s' 连接失败，已跳过: %s", server_name, exc)
            continue

        server_meta = meta[server_name]
        is_high_risk_server = server_meta["risk_level"] == "high"
        high_risk_tool_set = server_meta["high_risk_tools"]

        for tool in tools:
            original_name = getattr(tool, "name", "")
            prefixed_name = f"{server_name}__{original_name}"
            tool.name = prefixed_name

            if is_high_risk_server or original_name in high_risk_tool_set:
                _high_risk_names.add(prefixed_name)

        all_tools.extend(tools)
        logger.info("MCP server '%s': %d 个工具", server_name, len(tools))

    _mcp_tools = all_tools

    if _high_risk_names:
        from app.core.approval import register_mcp_high_risk_tools
        register_mcp_high_risk_tools(_high_risk_names)

    logger.info(
        "MCP 已连接: %d 个工具来自 %s，高风险: %s",
        len(_mcp_tools),
        list(connections.keys()),
        sorted(_high_risk_names) or "无",
    )


async def stop_mcp_client() -> None:
    global _client, _mcp_tools, _high_risk_names
    if _high_risk_names:
        from app.core.approval import unregister_mcp_high_risk_tools
        unregister_mcp_high_risk_tools()
    _mcp_tools = []
    _high_risk_names = set()
    _client = None


def get_mcp_tools() -> List[BaseTool]:
    return list(_mcp_tools)


def get_mcp_high_risk_tool_names() -> set[str]:
    return set(_high_risk_names)
