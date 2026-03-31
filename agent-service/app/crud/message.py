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


class MessageCRUD:
    """消息数据库操作"""

    async def create(
        self, 
        db: AsyncSession, 
        message_in: MessageCreate
    ) -> Message:
        """创建消息"""
        message_id = str(uuid.uuid4())
        
        # 处理 extra_data JSON
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
        
        # 更新会话的 updated_at
        from app.crud.session import session_crud
        await session_crud.touch(db, message_in.session_id)
        
        return db_message

    async def get_by_id(self, db: AsyncSession, message_id: str) -> Optional[Message]:
        """根据 message_id 获取消息"""
        result = await db.execute(
            select(Message).where(Message.message_id == message_id)
        )
        return result.scalars().first()

    async def get_by_session(
        self, 
        db: AsyncSession, 
        session_id: str,
        skip: int = 0,
        limit: int = 100,
        role: Optional[str] = None
    ) -> List[Message]:
        """获取会话的所有消息"""
        query = select(Message).where(Message.session_id == session_id)
        
        if role:
            query = query.where(Message.role == role)
        
        query = query.offset(skip).limit(limit).order_by(Message.created_at.asc())
        
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
        # 反转顺序，保持时间正序
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
