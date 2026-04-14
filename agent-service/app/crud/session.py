"""
Session CRUD 操作
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func
from sqlalchemy.orm import selectinload
from typing import Optional, List
from datetime import datetime
import uuid

from app.models.session import Session
from app.schemas.session import SessionCreate, SessionUpdate


class SessionCRUD:
    """会话数据库操作"""

    async def create(
        self, 
        db: AsyncSession, 
        session_in: SessionCreate,
        user_id: str
    ) -> Session:
        """创建会话"""
        session_id = str(uuid.uuid4())
        
        db_session = Session(
            session_id=session_id,
            user_id=user_id,
            title=session_in.title,
        )
        
        db.add(db_session)
        await db.commit()
        await db.refresh(db_session)
        return db_session

    async def get_by_id(self, db: AsyncSession, session_id: str) -> Optional[Session]:
        """根据 session_id 获取会话"""
        result = await db.execute(
            select(Session).where(Session.session_id == session_id)
        )
        return result.scalars().first()

    async def get_with_messages(
        self, 
        db: AsyncSession, 
        session_id: str
    ) -> Optional[Session]:
        """获取会话及其所有消息"""
        result = await db.execute(
            select(Session)
            .options(selectinload(Session.messages))
            .where(Session.session_id == session_id)
        )
        return result.scalars().first()

    async def get_by_user(
        self, 
        db: AsyncSession, 
        user_id: str,
        skip: int = 0,
        limit: int = 50,
        is_active: Optional[bool] = None
    ) -> List[Session]:
        """获取用户的所有会话"""
        query = select(Session).where(Session.user_id == user_id)
        
        if is_active is not None:
            query = query.where(Session.is_active == is_active)
        
        query = query.offset(skip).limit(limit).order_by(Session.is_pinned.desc(), Session.updated_at.desc())

        result = await db.execute(query)
        sessions = list(result.scalars().all())

        # 批量查消息数
        if sessions:
            from app.models.message import Message
            counts = await db.execute(
                select(Message.session_id, func.count(Message.id))
                .where(Message.session_id.in_([s.session_id for s in sessions]))
                .group_by(Message.session_id)
            )
            count_map = dict(counts.all())
            for s in sessions:
                s.message_count = count_map.get(s.session_id, 0)

        return sessions

    async def get_latest_by_user(
        self, 
        db: AsyncSession, 
        user_id: str
    ) -> Optional[Session]:
        """获取用户最新的会话"""
        result = await db.execute(
            select(Session)
            .where(Session.user_id == user_id, Session.is_active == True)
            .order_by(Session.updated_at.desc())
            .limit(1)
        )
        return result.scalars().first()

    async def update(
        self, 
        db: AsyncSession, 
        session_id: str, 
        session_update: SessionUpdate
    ) -> Optional[Session]:
        """更新会话"""
        update_data = session_update.model_dump(exclude_unset=True)
        update_data["updated_at"] = datetime.utcnow()
        
        await db.execute(
            update(Session)
            .where(Session.session_id == session_id)
            .values(**update_data)
        )
        await db.commit()
        
        return await self.get_by_id(db, session_id)

    async def touch(self, db: AsyncSession, session_id: str) -> None:
        """更新会话的 updated_at 时间（有新消息时调用）"""
        await db.execute(
            update(Session)
            .where(Session.session_id == session_id)
            .values(updated_at=datetime.utcnow())
        )
        await db.commit()

    async def delete(self, db: AsyncSession, session_id: str) -> bool:
        """删除会话（软删除）"""
        result = await db.execute(
            update(Session)
            .where(Session.session_id == session_id)
            .values(is_active=False, updated_at=datetime.utcnow())
        )
        await db.commit()
        return result.rowcount > 0

    async def hard_delete(self, db: AsyncSession, session_id: str) -> bool:
        """硬删除会话（ORM cascade 级联删除所有消息，同时删除工作区目录）"""
        session = await self.get_by_id(db, session_id)
        if not session:
            return False
        await db.delete(session)
        await db.commit()

        # 删除工作区目录
        import shutil
        from pathlib import Path
        from app.core.config import settings
        workspace = Path(settings.WORKSPACE_ROOT) / session_id
        if workspace.exists():
            shutil.rmtree(workspace, ignore_errors=True)

        return True

    async def count_by_user(
        self, 
        db: AsyncSession, 
        user_id: str,
        is_active: Optional[bool] = None
    ) -> int:
        """统计用户的会话数量"""
        query = select(func.count(Session.id)).where(Session.user_id == user_id)
        
        if is_active is not None:
            query = query.where(Session.is_active == is_active)
        
        result = await db.execute(query)
        return result.scalar() or 0


# 创建全局实例
session_crud = SessionCRUD()
