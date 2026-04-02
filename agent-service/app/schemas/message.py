"""
Message 相关的 Pydantic 模型
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Dict, Any, Literal


class MessageAttachment(BaseModel):
    """消息附件（图片、文件等）"""
    type: Literal["image", "file"] = Field(..., description="附件类型")
    path: str = Field(..., description="相对于工作区的路径，如 uploads/paste_20260401_103045.png")
    mime_type: Optional[str] = Field(None, description="MIME 类型，如 image/png")
    size: Optional[int] = Field(None, description="文件大小（字节）")
    timestamp: Optional[str] = Field(None, description="上传时间戳")


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
