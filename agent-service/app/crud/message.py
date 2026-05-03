"""
Message CRUD 操作
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, update
from typing import Optional, List, Dict
from datetime import datetime
import uuid
import json

from app.models.message import Message
from app.schemas.message import MessageCreate


def _drop_orphan_tool_calls(messages: List[dict]) -> List[dict]:
    """
    修复 assistant[tool_calls] 与后续 tool 消息不匹配的问题。
    - 完全没有 tool 响应 → 整条 assistant 消息被跳过（保留文本部分）
    - 部分 tool_call 没有响应 → 剥离无响应的 tool_call，只保留匹配的
    """
    result = []
    i = 0
    while i < len(messages):
        msg = messages[i]
        if msg.get("role") == "assistant" and msg.get("tool_calls"):
            j = i + 1
            tool_ids = set()
            while j < len(messages) and messages[j].get("role") == "tool":
                tid = messages[j].get("tool_call_id", "")
                if tid:
                    tool_ids.add(tid)
                j += 1

            if not tool_ids:
                if msg.get("content"):
                    result.append({"role": "assistant", "content": msg["content"]})
                i = j
                continue

            matched_tcs = [tc for tc in msg["tool_calls"] if tc.get("id", "") in tool_ids]
            if matched_tcs:
                result.append({**msg, "tool_calls": matched_tcs})
            elif msg.get("content"):
                result.append({"role": "assistant", "content": msg["content"]})
            # 跳过不匹配的 tool 消息不需要，因为 tool 消息已按 tool_call_id 收集
            i += 1
            continue

        result.append(msg)
        i += 1
    return result


class MessageCRUD:
    """消息数据库操作"""

    async def create(
        self,
        db: AsyncSession,
        message_in: MessageCreate
    ) -> Message:
        """创建消息"""
        message_id = str(uuid.uuid4())

        extra_data_json = None
        if message_in.extra_data:
            extra_data_json = json.dumps(message_in.extra_data)

        db_message = Message(
            message_id=message_id,
            session_id=message_in.session_id,
            role=message_in.role,
            content=message_in.content,
            extra_data=extra_data_json,
        )

        db.add(db_message)
        await db.commit()
        await db.refresh(db_message)

        from app.crud.session import session_crud
        await session_crud.touch(db, message_in.session_id)

        return db_message

    async def get_by_id(self, db: AsyncSession, message_id: str) -> Optional[Message]:
        """根据 message_id 获取消息"""
        result = await db.execute(
            select(Message).where(Message.message_id == message_id)
        )
        return result.scalar_one_or_none()

    async def get_by_session(
        self,
        db: AsyncSession,
        session_id: str,
        skip: int = 0,
        limit: int = 100,
        role: Optional[str] = None
    ) -> List[Message]:
        """获取会话的消息列表"""
        query = select(Message).where(Message.session_id == session_id)
        if role:
            query = query.where(Message.role == role)
        query = query.order_by(Message.created_at.asc()).offset(skip).limit(limit)
        result = await db.execute(query)
        return result.scalars().all()

    async def get_latest_messages(
        self,
        db: AsyncSession,
        session_id: str,
        count: int = 10,
        active_only: bool = False,
    ) -> List[Message]:
        """获取会话最新的 N 条消息。active_only=True 时只返回未压缩的。"""
        query = select(Message).where(Message.session_id == session_id)
        if active_only:
            query = query.where(Message.compacted_at.is_(None))
        query = query.order_by(Message.created_at.desc()).limit(count)
        result = await db.execute(query)
        messages = result.scalars().all()
        return list(reversed(messages))

    async def get_conversation_history(
        self,
        db: AsyncSession,
        session_id: str,
        limit: int = 50
    ) -> List[dict]:
        """
        获取会话历史，返回格式化的对话历史（适合传给 LangChain agent）

        - assistant 消息若含 tool_calls（存在 extra_data），重建为带 tool_calls 字段的消息
        - tool 消息重建为带 tool_call_id 字段的消息
        - 过滤孤儿 assistant[tool_calls]（审批拒绝时没有对应 tool 消息）
        """
        messages = await self.get_latest_messages(db, session_id, limit, active_only=True)

        result = []
        for msg in messages:
            extra = {}
            if msg.extra_data:
                try:
                    extra = json.loads(msg.extra_data)
                except Exception:
                    pass

            if msg.role == "tool":
                tool_call_id = extra.get("tool_call_id", "")
                tool_name = extra.get("tool_name", "unknown")
                if not tool_call_id:
                    continue
                # 保底校验：往回找最近的非 tool 消息，必须是带 tool_calls 的 assistant
                parent_found = False
                for k in range(len(result) - 1, -1, -1):
                    if result[k].get("role") != "tool":
                        parent_found = result[k].get("role") == "assistant" and bool(result[k].get("tool_calls"))
                        break
                if not parent_found:
                    continue
                result.append({
                    "role": "tool",
                    "content": msg.content,
                    "tool_call_id": tool_call_id,
                    "name": tool_name,
                    "_message_id": msg.message_id,
                })
            elif msg.role == "assistant":
                entry: Dict = {"role": "assistant", "content": msg.content, "_message_id": msg.message_id}
                tool_calls = extra.get("tool_calls")
                if tool_calls:
                    entry["tool_calls"] = [
                        {
                            "id": tc.get("id", ""),
                            "type": "function",
                            "function": {
                                "name": tc.get("name", ""),
                                "arguments": json.dumps(tc.get("args", {})),
                            }
                        }
                        for tc in tool_calls
                    ]
                result.append(entry)
            else:
                result.append({"role": msg.role, "content": msg.content, "_message_id": msg.message_id})

        # 移除孤儿 assistant[tool_calls]（审批被拒绝时没有对应 tool 消息）
        result = _drop_orphan_tool_calls(result)
        return result

    async def update_extra_data(
        self,
        db: AsyncSession,
        session_id: str,
        updates: dict,
    ) -> bool:
        """更新该会话最近一条 assistant 消息的 extra_data（合并式更新）。

        用于持久化审批状态等运行时信息。值为 None 的 key 会被删除。
        """
        result = await db.execute(
            select(Message)
            .where(Message.session_id == session_id, Message.role == "assistant")
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        msg = result.scalar_one_or_none()
        if not msg:
            return False
        existing = json.loads(msg.extra_data) if msg.extra_data else {}
        for k, v in updates.items():
            if v is None:
                existing.pop(k, None)
            else:
                existing[k] = v
        msg.extra_data = json.dumps(existing, ensure_ascii=False)
        await db.commit()
        return True

    async def delete(self, db: AsyncSession, message_id: str) -> bool:
        """删除消息"""
        result = await db.execute(
            delete(Message).where(Message.message_id == message_id)
        )
        await db.commit()
        return result.rowcount > 0

    async def delete_by_session(self, db: AsyncSession, session_id: str) -> int:
        """删除会话的所有消息"""
        result = await db.execute(
            delete(Message).where(Message.session_id == session_id)
        )
        await db.commit()
        return result.rowcount

    async def count_by_session(self, db: AsyncSession, session_id: str) -> int:
        """统计会话的消息数量"""
        result = await db.execute(
            select(func.count(Message.id)).where(Message.session_id == session_id)
        )
        return result.scalar() or 0

    async def search_by_content(
        self,
        db: AsyncSession,
        session_id: str,
        keyword: str,
        limit: int = 20
    ) -> List[Message]:
        """在会话中搜索消息（简单的文本匹配）"""
        result = await db.execute(
            select(Message)
            .where(
                Message.session_id == session_id,
                Message.content.contains(keyword)
            )
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        return result.scalars().all()

    async def search_global(
        self,
        db: AsyncSession,
        user_id: str,
        keyword: str,
        limit: int = 30
    ) -> List[dict]:
        """跨会话全局搜索消息，返回消息 + 会话标题"""
        from app.models.session import Session

        result = await db.execute(
            select(Message, Session.title)
            .join(Session, Message.session_id == Session.session_id)
            .where(
                Session.user_id == user_id,
                Session.is_active == True,
                Message.role.in_(["user", "assistant"]),
                Message.content.contains(keyword),
            )
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        rows = result.all()
        return [
            {
                "message_id": msg.message_id,
                "session_id": msg.session_id,
                "role": msg.role,
                "content": msg.content[:200] if msg.content else "",
                "created_at": msg.created_at.isoformat(),
                "session_title": title or "未命名对话",
            }
            for msg, title in rows
        ]

    async def get_all_active_messages(
        self,
        db: AsyncSession,
        session_id: str,
    ) -> List[dict]:
        """获取会话所有未压缩消息（无 limit），供 compactor 使用。"""
        query = (
            select(Message)
            .where(Message.session_id == session_id, Message.compacted_at.is_(None))
            .order_by(Message.created_at.asc())
        )
        result = await db.execute(query)
        messages = result.scalars().all()

        out = []
        for msg in messages:
            extra = {}
            if msg.extra_data:
                try:
                    extra = json.loads(msg.extra_data)
                except Exception:
                    pass

            if msg.role == "tool":
                tool_call_id = extra.get("tool_call_id", "")
                tool_name = extra.get("tool_name", "unknown")
                if not tool_call_id:
                    continue
                parent_found = False
                for k in range(len(out) - 1, -1, -1):
                    if out[k].get("role") != "tool":
                        parent_found = out[k].get("role") == "assistant" and bool(out[k].get("tool_calls"))
                        break
                if not parent_found:
                    continue
                out.append({
                    "role": "tool",
                    "content": msg.content,
                    "tool_call_id": tool_call_id,
                    "name": tool_name,
                    "_message_id": msg.message_id,
                })
            elif msg.role == "assistant":
                entry: Dict = {"role": "assistant", "content": msg.content, "_message_id": msg.message_id}
                tool_calls = extra.get("tool_calls")
                if tool_calls:
                    entry["tool_calls"] = [
                        {
                            "id": tc.get("id", ""),
                            "type": "function",
                            "function": {
                                "name": tc.get("name", ""),
                                "arguments": json.dumps(tc.get("args", {})),
                            }
                        }
                        for tc in tool_calls
                    ]
                out.append(entry)
            else:
                out.append({"role": msg.role, "content": msg.content, "_message_id": msg.message_id})

        out = _drop_orphan_tool_calls(out)
        return out

    async def mark_messages_compacted(
        self,
        db: AsyncSession,
        message_ids: List[str],
        group_id: str,
    ) -> int:
        """批量标记消息为已压缩。"""
        if not message_ids:
            return 0
        result = await db.execute(
            update(Message)
            .where(Message.message_id.in_(message_ids))
            .values(compacted_at=datetime.utcnow(), compact_group_id=group_id)
        )
        await db.commit()
        return result.rowcount

    async def delete_after_timestamp(
        self,
        db: AsyncSession,
        session_id: str,
        timestamp: datetime,
        include_equal: bool = True
    ) -> int:
        """
        删除某时间点之后的所有消息

        Args:
            session_id: 会话ID
            timestamp: 时间戳
            include_equal: 是否包含时间戳相等的消息（默认包含）

        Returns:
            删除的消息数量
        """
        if include_equal:
            query = delete(Message).where(
                Message.session_id == session_id,
                Message.created_at >= timestamp
            )
        else:
            query = delete(Message).where(
                Message.session_id == session_id,
                Message.created_at > timestamp
            )

        result = await db.execute(query)
        await db.commit()
        return result.rowcount


# 创建全局实例
message_crud = MessageCRUD()
