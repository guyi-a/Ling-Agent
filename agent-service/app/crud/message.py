"""
Message CRUD 操作
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from typing import Optional, List, Dict
from datetime import datetime
import uuid
import json

from app.models.message import Message
from app.schemas.message import MessageCreate


def _drop_orphan_tool_calls(messages: List[dict]) -> List[dict]:
    """
    移除没有对应 tool 消息的孤儿 assistant[tool_calls] 消息（及其后的孤立 tool 消息）。
    场景：审批拒绝 / 中断时，assistant 带 tool_calls 已存库，但 tool 消息没有存，
    下次构建 history 时模型会报 "tool_calls must be followed by tool messages" 错误。
    扫描全部消息，不只截末尾。
    """
    result = []
    i = 0
    while i < len(messages):
        msg = messages[i]
        if msg.get("role") == "assistant" and msg.get("tool_calls"):
            # 检查紧跟的是否有 tool 消息
            j = i + 1
            has_tool = j < len(messages) and messages[j].get("role") == "tool"
            if not has_tool:
                # 孤儿：跳过这条，同时跳过其后所有连续 tool 消息（理论上没有，但保险）
                i += 1
                while i < len(messages) and messages[i].get("role") == "tool":
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
        count: int = 10
    ) -> List[Message]:
        """获取会话最新的 N 条消息"""
        result = await db.execute(
            select(Message)
            .where(Message.session_id == session_id)
            .order_by(Message.created_at.desc())
            .limit(count)
        )
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
        messages = await self.get_latest_messages(db, session_id, limit)

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
                # 保底校验：前一条必须是带 tool_calls 的 assistant 消息
                if not result or result[-1].get("role") != "assistant" or not result[-1].get("tool_calls"):
                    continue
                result.append({
                    "role": "tool",
                    "content": msg.content,
                    "tool_call_id": tool_call_id,
                    "name": tool_name,
                })
            elif msg.role == "assistant":
                entry: Dict = {"role": "assistant", "content": msg.content}
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
                result.append({"role": msg.role, "content": msg.content})

        # 移除孤儿 assistant[tool_calls]（审批被拒绝时没有对应 tool 消息）
        result = _drop_orphan_tool_calls(result)
        return result

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


# 创建全局实例
message_crud = MessageCRUD()
