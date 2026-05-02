"""
工具审批管理器（内存版）

工作流程：
  1. stream_message 检测到 HumanInTheLoop interrupt → make_request_id()
  2. SSE yield approval_required 事件到前端
  3. request_approval 挂起，等待 asyncio.Event（无超时）
  4. 用户点击允许/拒绝 → POST /api/chat/approve
  5. resolve_approval 设置 Event，stream_message 继续或中止

切换到 Redis 版本只需替换 request_approval / resolve_approval 实现，
上层调用者无需改动。
"""
import asyncio
import uuid
import logging
from typing import Dict, Optional, Set

logger = logging.getLogger(__name__)

_BUILTIN_HIGH_RISK: set[str] = {
    "run_command",
    "python_repl",
    "write_file",
    "edit_file",
    "dev_run",
}

_mcp_high_risk: set[str] = set()

HIGH_RISK_TOOLS: set[str] = set(_BUILTIN_HIGH_RISK)


def register_mcp_high_risk_tools(names: Set[str]) -> None:
    if not names:
        return
    _mcp_high_risk.update(names)
    HIGH_RISK_TOOLS.update(names)
    logger.info("已注册 MCP 高风险工具: %s", sorted(names))


def unregister_mcp_high_risk_tools() -> None:
    if not _mcp_high_risk:
        return
    HIGH_RISK_TOOLS.difference_update(_mcp_high_risk)
    removed = sorted(_mcp_high_risk)
    _mcp_high_risk.clear()
    logger.info("已撤销 MCP 高风险工具: %s", removed)

# ── 内存存储 ──────────────────────────────────────────
_pending_events: Dict[str, asyncio.Event] = {}   # request_id → Event
_pending_results: Dict[str, Optional[bool]] = {}  # request_id → True/False/None


def make_request_id() -> str:
    return str(uuid.uuid4())


async def request_approval(request_id: str) -> bool:
    """
    挂起当前协程，等待用户审批。无超时，永久等待直到用户操作。
    返回 True = 允许, False = 拒绝
    """
    event = asyncio.Event()
    _pending_events[request_id] = event
    _pending_results[request_id] = None

    logger.info(f"⏸  审批请求 {request_id[:8]}… 等待用户响应")

    try:
        await event.wait()
        result = _pending_results.get(request_id, False)
    finally:
        _pending_events.pop(request_id, None)
        _pending_results.pop(request_id, None)

    logger.info(f"{'✅' if result else '❌'} 审批结果 {request_id[:8]}…: {'允许' if result else '拒绝'}")
    return result


def resolve_approval(request_id: str, approved: bool) -> bool:
    """
    由 POST /api/chat/approve 调用，解除对应协程的挂起。
    返回 True 表示找到了等待中的请求，False 表示 request_id 不存在（已超时或无效）
    """
    if request_id not in _pending_events:
        logger.warning(f"resolve_approval: {request_id[:8]}… 不存在（已超时或无效）")
        return False

    _pending_results[request_id] = approved
    _pending_events[request_id].set()
    return True


def pending_count() -> int:
    """当前待审批数量（调试用）"""
    return len(_pending_events)


# ── 审批策略 ──────────────────────────────────────────

def _parse_prefs(user_prefs: Optional[dict]) -> dict:
    if not user_prefs:
        return {"approval_mode": "default", "tool_allowlist": [], "tool_denylist": []}
    return {
        "approval_mode": user_prefs.get("approval_mode", "default"),
        "tool_allowlist": user_prefs.get("tool_allowlist", []),
        "tool_denylist": user_prefs.get("tool_denylist", []),
    }


def should_approve(tool_name: str, user_prefs: Optional[dict]) -> str:
    """
    决定某个工具是否需要审批。
    返回 "ask" | "allow" | "deny"
    """
    prefs = _parse_prefs(user_prefs)
    mode = prefs["approval_mode"]

    if mode == "auto":
        return "allow"

    if mode == "custom":
        if tool_name in prefs["tool_allowlist"]:
            return "allow"
        if tool_name in prefs["tool_denylist"]:
            return "deny"
        return "ask"

    # default 模式
    if tool_name in HIGH_RISK_TOOLS:
        return "ask"
    return "allow"


def add_to_allowlist(user_prefs: Optional[dict], tool_name: str) -> dict:
    """将工具加入 allowlist，返回更新后的 prefs dict。"""
    prefs = _parse_prefs(user_prefs)
    if tool_name not in prefs["tool_allowlist"]:
        prefs["tool_allowlist"].append(tool_name)
    if tool_name in prefs["tool_denylist"]:
        prefs["tool_denylist"].remove(tool_name)
    return prefs
