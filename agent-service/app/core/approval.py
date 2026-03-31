"""
工具审批管理器（内存版）

工作流程：
  1. stream_message 检测到 HumanInTheLoop interrupt → make_request_id()
  2. SSE yield approval_required 事件到前端
  3. request_approval 挂起，等待 asyncio.Event
  4. 用户点击允许/拒绝 → POST /api/chat/approve
  5. resolve_approval 设置 Event，stream_message 继续或中止

切换到 Redis 版本只需替换 request_approval / resolve_approval 实现，
上层调用者无需改动。
"""
import asyncio
import uuid
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# 默认审批超时（秒）
DEFAULT_TIMEOUT = 60

# 高风险工具名单（需要人工审批，与 agent_factory.py 的 interrupt_on 保持同步）
HIGH_RISK_TOOLS: set[str] = {
    "run_command",
    "python_repl",
    "write_file",
}

# ── 内存存储 ──────────────────────────────────────────
_pending_events: Dict[str, asyncio.Event] = {}   # request_id → Event
_pending_results: Dict[str, Optional[bool]] = {}  # request_id → True/False/None


def make_request_id() -> str:
    return str(uuid.uuid4())


async def request_approval(request_id: str, timeout: int = DEFAULT_TIMEOUT) -> bool:
    """
    挂起当前协程，等待用户审批。
    返回 True = 允许, False = 拒绝（含超时）
    """
    event = asyncio.Event()
    _pending_events[request_id] = event
    _pending_results[request_id] = None

    logger.info(f"⏸  审批请求 {request_id[:8]}… 等待用户响应（超时 {timeout}s）")

    try:
        await asyncio.wait_for(event.wait(), timeout=timeout)
        result = _pending_results.get(request_id, False)
    except asyncio.TimeoutError:
        logger.warning(f"⏱  审批超时 {request_id[:8]}…，自动拒绝")
        result = False
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
