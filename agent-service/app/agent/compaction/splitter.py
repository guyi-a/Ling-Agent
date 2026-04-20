import re
import logging
from typing import List, Tuple, Optional

logger = logging.getLogger(__name__)

_COMPACT_SUMMARY_RE = re.compile(
    r"<compacted-summary\b[^>]*>(.*?)</compacted-summary>",
    re.DOTALL,
)


def _find_user_turn_starts(messages: List[dict]) -> List[int]:
    """找到所有用户 turn 的起始索引。

    用户 turn = 一条 role=user 的消息，后面跟着 assistant/tool 消息直到下一个 user。
    排除 <compacted-summary> 的 system 消息（它不是真正的用户 turn）。
    """
    starts = []
    for i, msg in enumerate(messages):
        if msg.get("role") == "user":
            starts.append(i)
    return starts


def _has_orphan_tool_call(to_compress: List[dict]) -> bool:
    """检查待压缩区尾部是否有未配对的 tool_calls。"""
    if not to_compress:
        return False
    last = to_compress[-1]
    return last.get("role") == "assistant" and bool(last.get("tool_calls"))


def split_messages(
    messages: List[dict],
    keep_turns: int,
) -> Tuple[List[dict], List[dict], Optional[str]]:
    """将消息列表分割为待压缩和保留两部分。

    Returns:
        (to_compress, to_keep, prior_summary)
        - to_compress: 要被压缩的旧消息
        - to_keep: 保留的最近消息
        - prior_summary: 如果旧消息中有上一次的摘要，提取其正文
    """
    if len(messages) < 3:
        return [], messages, None

    starts = _find_user_turn_starts(messages)

    if len(starts) <= keep_turns:
        return [], messages, None

    cut_at = starts[-keep_turns]

    to_compress = messages[:cut_at]
    to_keep = messages[cut_at:]

    # 回退切分点：确保 assistant[tool_calls] 和对应 tool 消息不被拆开
    while _has_orphan_tool_call(to_compress):
        cut_at -= 1
        if cut_at <= 0:
            return [], messages, None
        to_compress = messages[:cut_at]
        to_keep = messages[cut_at:]

    if not to_compress:
        return [], messages, None

    # 提取上一次的摘要（如果有）
    prior_summary = None
    for msg in to_compress:
        if msg.get("role") == "system":
            match = _COMPACT_SUMMARY_RE.search(msg.get("content", ""))
            if match:
                prior_summary = match.group(1).strip()

    return to_compress, to_keep, prior_summary
