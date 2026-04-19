"""
心理测评记录模型
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from datetime import datetime
from .base import Base


class Assessment(Base):
    """心理测评记录"""
    __tablename__ = "assessments"

    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(String(100), unique=True, index=True, nullable=False)
    user_id = Column(String(100), ForeignKey("users.user_id"), index=True, nullable=False)
    scale_type = Column(String(50), nullable=False)  # "PHQ-9" | "GAD-7" | "MBTI" | "SBTI" | ...
    answers = Column(Text)                # JSON: [{"q": 1, "score": 2}, ...]
    total_score = Column(Integer)
    severity = Column(String(30))         # 临床量表: "正常"|"轻度"|... MBTI: "INFJ" SBTI: "CTRL"
    result_type = Column(String(20), default="severity")  # "severity" | "personality" | "label"
    result_detail = Column(Text)          # JSON: 维度明细等扩展数据（临床量表为 null）
    ai_suggestion = Column(Text)          # Agent 生成的建议
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self):
        return f"<Assessment(id={self.id}, assessment_id={self.assessment_id}, scale={self.scale_type})>"
