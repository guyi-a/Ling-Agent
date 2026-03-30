"""
Message 相关的 Pydantic 模型
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Dict, Any


class MessageCreate(BaseModel):
    """创建消息请求"""
    session_id: str = Field(..., description="会话ID")
    role: str = Field(..., description="角色: user, assistant, system")
    content: str = Field(..., description="消息内容")
    extra_data: Optional[Dict[str, Any]] = Field(None, description="额外元数据")


class MessageResponse(BaseModel):
    """消息响应"""
    id: int
    message_id: str
    session_id: str
    role: str
    content: str
    extra_data: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class MessageList(BaseModel):
    """消息列表响应"""
    total: int
    messages: List[MessageResponse]
