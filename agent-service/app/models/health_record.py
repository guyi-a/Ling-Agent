"""
心理健康日记记录模型
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from datetime import datetime
from .base import Base


class HealthRecord(Base):
    """心理健康日记记录"""
    __tablename__ = "health_records"

    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(String(100), unique=True, index=True, nullable=False)
    user_id = Column(String(100), ForeignKey("users.user_id"), index=True, nullable=False)
    record_type = Column(String(20), nullable=False)  # "body" | "emotion"

    # 身体不适记录
    body_part = Column(String(50))        # 不适部位：头、胸、胃、背、全身、其他
    discomfort_level = Column(Integer)    # 不适程度 1-10
    symptoms = Column(Text)              # 具体症状描述

    # 情绪记录
    emotion = Column(String(30))          # 主要情绪：焦虑、低落、烦躁、平静、开心等
    emotion_level = Column(Integer)       # 情绪强度 1-10
    trigger = Column(Text)               # 触发事件

    # 通用
    notes = Column(Text)                  # 自由文本备注
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self):
        return f"<HealthRecord(id={self.id}, record_id={self.record_id}, type={self.record_type})>"
