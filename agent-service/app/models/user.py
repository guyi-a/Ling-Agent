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
    user_id = Column(String(100), unique=True, index=True, nullable=False)  # UUID 或设备ID
    username = Column(String(100), index=True)  # 用户名（可选）
    device_id = Column(String(100), index=True)  # Android 设备ID
    device_model = Column(String(100))  # 设备型号
    preferences = Column(Text)  # JSON 字符串存储用户偏好设置
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_active_at = Column(DateTime, default=datetime.utcnow)  # 最后活跃时间
    is_active = Column(Boolean, default=True)
    
    # 关系
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<User(id={self.id}, user_id={self.user_id}, username={self.username})>"
