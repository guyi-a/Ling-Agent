"""
账号模型 - 存储认证信息（与 User 表分离）
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import Base


class Account(Base):
    """账号表 - 专门存储认证相关信息"""
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(100), ForeignKey("users.user_id"), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)  # 登录用的用户名
    hashed_password = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = Column(Boolean, default=True)

    # 关系
    user = relationship("User", back_populates="account")

    def __repr__(self):
        return f"<Account(id={self.id}, username={self.username}, user_id={self.user_id})>"
