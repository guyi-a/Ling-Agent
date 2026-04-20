"""
消息模型 - 存储聊天记录
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import Base


class Message(Base):
    """消息表"""
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(String(100), unique=True, index=True, nullable=False)  # UUID
    session_id = Column(String(100), ForeignKey("sessions.session_id"), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # user, assistant, system
    content = Column(Text, nullable=False)
    extra_data = Column(Text)  # JSON string for additional metadata (renamed from metadata)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    compacted_at = Column(DateTime, nullable=True, default=None)
    compact_group_id = Column(String(50), nullable=True)

    # 关系
    session = relationship("Session", back_populates="messages")

    # 复合索引：按会话和时间查询
    __table_args__ = (
        Index('idx_session_created', 'session_id', 'created_at'),
    )
    
    def __repr__(self):
        return f"<Message(id={self.id}, role={self.role}, session_id={self.session_id})>"
