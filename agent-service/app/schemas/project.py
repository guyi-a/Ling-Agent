"""
Project 相关的 Pydantic 模型
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List


class ProjectCreate(BaseModel):
    title: Optional[str] = Field(None, description="项目标题（为空则创建 adhoc）")


class ProjectUpdate(BaseModel):
    title: Optional[str] = Field(None, description="项目标题")
    description: Optional[str] = Field(None, description="项目描述")
    icon: Optional[str] = Field(None, description="项目图标 emoji")


class SessionBrief(BaseModel):
    session_id: str
    title: Optional[str]
    updated_at: datetime
    is_pinned: bool = False

    class Config:
        from_attributes = True


class ProjectResponse(BaseModel):
    id: int
    slug: Optional[str]
    title: Optional[str]
    description: Optional[str]
    icon: Optional[str]
    user_id: str
    created_at: datetime
    updated_at: Optional[datetime]
    session_count: int = 0
    last_active_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProjectDetail(ProjectResponse):
    sessions: List[SessionBrief] = []


class AdhocSessionResponse(BaseModel):
    session_id: str
    project_id: int
    title: Optional[str]
    updated_at: datetime

    class Config:
        from_attributes = True
