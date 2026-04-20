import re
import uuid
import logging
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.compaction.decision import should_compact
from app.agent.compaction.splitter import split_messages
from app.agent.compaction.summarizer import generate_summary
from app.crud.message import message_crud
from app.schemas.message import MessageCreate
from app.core.config import settings

logger = logging.getLogger(__name__)

_COMPACT_SUMMARY_RE = re.compile(
    r"<compacted-summary\b[^>]*>(.*?)</compacted-summary>",
    re.DOTALL,
)


async def maybe_compact(
    db: AsyncSession,
    session_id: str,
    last_input_tokens: int,
) -> bool:
    """压缩编排入口。返回 True 表示执行了压缩。"""
    if not should_compact(last_input_tokens, settings.COMPACT_TOKEN_THRESHOLD, settings.COMPACT_ENABLED):
        return False

    messages = await message_crud.get_all_active_messages(db, session_id)
    if len(messages) < 5:
        logger.info(f"消息过少({len(messages)} 条)，跳过压缩")
        return False

    # 从全部活跃消息中提取旧摘要及其 message_id
    old_summary_ids = []
    prior_summary = None
    for msg in messages:
        if msg.get("role") == "system":
            match = _COMPACT_SUMMARY_RE.search(msg.get("content", ""))
            if match:
                prior_summary = match.group(1).strip()
                mid = msg.get("_message_id")
                if mid:
                    old_summary_ids.append(mid)

    # 分割时排除旧摘要消息，避免干扰轮次计算
    non_summary_msgs = [m for m in messages if m.get("_message_id") not in old_summary_ids]
    to_compress, to_keep, _ = split_messages(
        non_summary_msgs, settings.COMPACT_KEEP_TURNS,
    )
    if not to_compress:
        logger.debug("无可压缩消息，跳过")
        return False

    logger.info(
        f"🗜️ 开始压缩 session={session_id[:8]}... "
        f"compress={len(to_compress)} keep={len(to_keep)} "
        f"input_tokens={last_input_tokens}"
    )

    summary_text = await generate_summary(to_compress, prior_summary)

    group_id = f"cg-{uuid.uuid4().hex[:12]}"
    summary_content = f'<compacted-summary id="{group_id}">\n{summary_text}\n</compacted-summary>'

    # 收集需要标记的 ID：被压缩的消息 + 旧摘要
    compressed_message_ids = []
    for msg in to_compress:
        mid = msg.get("_message_id")
        if mid:
            compressed_message_ids.append(mid)
    compressed_message_ids.extend(old_summary_ids)

    if compressed_message_ids:
        await message_crud.mark_messages_compacted(db, compressed_message_ids, group_id)

    await message_crud.create(db, MessageCreate(
        session_id=session_id,
        role="system",
        content=summary_content,
        extra_data={"type": "compact_summary", "compact_group_id": group_id},
    ))

    logger.info(
        f"✅ 压缩完成 session={session_id[:8]}... "
        f"group_id={group_id} compressed={len(compressed_message_ids)} msgs"
    )
    return True
