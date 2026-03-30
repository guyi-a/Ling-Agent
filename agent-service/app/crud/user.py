"""
User CRUD 操作
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload
from typing import Optional, List
from datetime import datetime
import uuid
import json

from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate


class UserCRUD:
    """用户数据库操作"""

    async def create(self, db: AsyncSession, user_in: UserCreate) -> User:
        """创建用户"""
        # 生成 user_id（如果未提供）
        user_id = user_in.user_id or str(uuid.uuid4())
        
        # 处理 preferences JSON
        preferences_json = None
        if user_in.preferences:
            preferences_json = json.dumps(user_in.preferences)
        
        db_user = User(
            user_id=user_id,
            username=user_in.username,
            device_id=user_in.device_id,
            device_model=user_in.device_model,
            preferences=preferences_json,
        )
        
        db.add(db_user)
        await db.commit()
        await db.refresh(db_user)
        return db_user

    async def get_by_id(self, db: AsyncSession, user_id: str) -> Optional[User]:
        """根据 user_id 获取用户"""
        result = await db.execute(
            select(User).where(User.user_id == user_id)
        )
        return result.scalars().first()

    async def get_by_device_id(self, db: AsyncSession, device_id: str) -> Optional[User]:
        """根据设备ID获取用户"""
        result = await db.execute(
            select(User).where(User.device_id == device_id)
        )
        return result.scalars().first()

    async def get_with_sessions(self, db: AsyncSession, user_id: str) -> Optional[User]:
        """获取用户及其所有会话"""
        result = await db.execute(
            select(User)
            .options(selectinload(User.sessions))
            .where(User.user_id == user_id)
        )
        return result.scalars().first()

    async def get_all(
        self, 
        db: AsyncSession, 
        skip: int = 0, 
        limit: int = 100,
        is_active: Optional[bool] = None
    ) -> List[User]:
        """获取用户列表"""
        query = select(User)
        
        if is_active is not None:
            query = query.where(User.is_active == is_active)
        
        query = query.offset(skip).limit(limit).order_by(User.created_at.desc())
        
        result = await db.execute(query)
        return result.scalars().all()

    async def update(
        self, 
        db: AsyncSession, 
        user_id: str, 
        user_update: UserUpdate
    ) -> Optional[User]:
        """更新用户信息"""
        # 构建更新数据
        update_data = user_update.model_dump(exclude_unset=True)
        
        # 处理 preferences JSON
        if "preferences" in update_data and update_data["preferences"]:
            update_data["preferences"] = json.dumps(update_data["preferences"])
        
        update_data["updated_at"] = datetime.utcnow()
        
        # 执行更新
        await db.execute(
            update(User)
            .where(User.user_id == user_id)
            .values(**update_data)
        )
        await db.commit()
        
        # 返回更新后的用户
        return await self.get_by_id(db, user_id)

    async def update_last_active(self, db: AsyncSession, user_id: str) -> None:
        """更新用户最后活跃时间"""
        await db.execute(
            update(User)
            .where(User.user_id == user_id)
            .values(last_active_at=datetime.utcnow())
        )
        await db.commit()

    async def delete(self, db: AsyncSession, user_id: str) -> bool:
        """删除用户（软删除）"""
        result = await db.execute(
            update(User)
            .where(User.user_id == user_id)
            .values(is_active=False, updated_at=datetime.utcnow())
        )
        await db.commit()
        return result.rowcount > 0

    async def hard_delete(self, db: AsyncSession, user_id: str) -> bool:
        """硬删除用户（真实删除）"""
        result = await db.execute(
            delete(User).where(User.user_id == user_id)
        )
        await db.commit()
        return result.rowcount > 0

    async def count(self, db: AsyncSession, is_active: Optional[bool] = None) -> int:
        """统计用户数量"""
        query = select(User)
        if is_active is not None:
            query = query.where(User.is_active == is_active)
        
        result = await db.execute(query)
        return len(result.scalars().all())


# 创建全局实例
user_crud = UserCRUD()
