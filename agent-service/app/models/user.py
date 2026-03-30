"""
用户模型 - 存储用户信息
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import Base


class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(100), unique=True, index=True, nullable=False)
    username = Column(String(100), index=True)
    device_id = Column(String(100), index=True)
    device_model = Column(String(100))
    preferences = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_active_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)

    # 关系
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    account = relationship("Account", back_populates="user", uselist=False)

    def __repr__(self):
        return f"<User(id={self.id}, user_id={self.user_id}, username={self.username})>"
