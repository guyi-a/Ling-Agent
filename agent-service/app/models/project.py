"""
项目模型 - 存储用户的项目（应用）
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import Base


class Project(Base):
    """项目表 - 项目是顶层实体，会话归属于项目"""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), unique=True, nullable=True, index=True)
    title = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    icon = Column(String(50), nullable=True)
    user_id = Column(String(100), ForeignKey("users.user_id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="projects")
    sessions = relationship("Session", back_populates="project", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Project(id={self.id}, slug={self.slug}, title={self.title})>"

    @property
    def is_materialized(self) -> bool:
        return self.slug is not None and self.title is not None
