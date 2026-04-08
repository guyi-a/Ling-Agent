"""
Account CRUD 操作
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
import uuid

from app.models.account import Account
from app.models.user import User
from app.core.security import hash_password, verify_password
from app.schemas.auth import RegisterRequest


class AccountCRUD:

    async def register(self, db: AsyncSession, req: RegisterRequest) -> tuple[User, Account]:
        """注册：同时创建 User 和 Account"""
        user_id = str(uuid.uuid4())

        user = User(
            user_id=user_id,
            username=req.username,
            device_id=req.device_id,
            device_model=req.device_model,
        )
        db.add(user)
        await db.flush()  # 先写入 user 拿到 user_id

        account = Account(
            user_id=user_id,
            username=req.username,
            hashed_password=hash_password(req.password),
        )
        db.add(account)
        await db.commit()
        await db.refresh(user)
        await db.refresh(account)
        return user, account

    async def get_by_username(self, db: AsyncSession, username: str) -> Optional[Account]:
        """根据用户名查找账号"""
        result = await db.execute(
            select(Account).where(Account.username == username)
        )
        return result.scalars().first()

    async def authenticate(self, db: AsyncSession, username: str, password: str) -> Optional[Account]:
        """验证用户名和密码"""
        account = await self.get_by_username(db, username)
        if not account:
            return None
        if not verify_password(password, account.hashed_password):
            return None
        return account

    async def change_password(
        self, db: AsyncSession, user_id: str, old_password: str, new_password: str
    ) -> bool:
        """修改密码，返回是否成功"""
        result = await db.execute(
            select(Account).where(Account.user_id == user_id)
        )
        account = result.scalars().first()
        if not account:
            return False
        if not verify_password(old_password, account.hashed_password):
            return False
        account.hashed_password = hash_password(new_password)
        await db.commit()
        return True

    async def username_exists(self, db: AsyncSession, username: str) -> bool:
        """检查用户名是否已存在"""
        result = await db.execute(
            select(Account).where(Account.username == username)
        )
        return result.scalars().first() is not None


account_crud = AccountCRUD()
