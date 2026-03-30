"""
Session 相关的 Pydantic 模型
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

if TYPE_CHECKING:
    from .message import MessageResponse


class SessionCreate(BaseModel):
    """创建会话请求"""
    user_id: Optional[str] = Field(None, description="用户ID")
    title: Optional[str] = Field(None, description="会话标题")


class SessionUpdate(BaseModel):
    """更新会话请求"""
    title: Optional[str] = Field(None, description="会话标题")
    is_active: Optional[bool] = Field(None, description="是否激活")


class SessionResponse(BaseModel):
    """会话响应"""
    id: int
    session_id: str
    user_id: Optional[str]
    title: Optional[str]
    created_at: datetime
    updated_at: datetime
    is_active: bool
    message_count: Optional[int] = Field(None, description="消息数量")

    class Config:
        from_attributes = True


class SessionList(BaseModel):
    """会话列表响应"""
    total: int
    sessions: List[SessionResponse]


class SessionWithMessages(SessionResponse):
    """包含消息的会话响应"""
    messages: List['MessageResponse'] = []

    class Config:
        from_attributes = True
