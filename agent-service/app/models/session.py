"""
会话模型 - 存储用户的聊天会话
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import Base


class Session(Base):
    """会话表"""
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(100), unique=True, index=True, nullable=False)  # UUID
    user_id = Column(String(100), ForeignKey("users.user_id"), nullable=False, index=True)  # 外键关联用户
    title = Column(String(200))  # 会话标题
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    is_pinned = Column(Boolean, default=False)
    
    # 关系
    user = relationship("User", back_populates="sessions")
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Session(id={self.id}, session_id={self.session_id}, title={self.title})>"
