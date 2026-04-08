"""
User 相关的 Pydantic 模型
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Dict, Any, List, TYPE_CHECKING

if TYPE_CHECKING:
    from .session import SessionResponse


class UserCreate(BaseModel):
    """创建用户请求"""
    user_id: Optional[str] = Field(None, description="用户ID（不提供则自动生成）")
    username: Optional[str] = Field(None, description="用户名")
    device_id: str = Field(..., description="设备ID")
    device_model: Optional[str] = Field(None, description="设备型号")
    preferences: Optional[Dict[str, Any]] = Field(None, description="用户偏好设置")


class UserUpdate(BaseModel):
    """更新用户请求"""
    username: Optional[str] = Field(None, description="用户名")
    device_model: Optional[str] = Field(None, description="设备型号")
    preferences: Optional[Dict[str, Any]] = Field(None, description="用户偏好设置")
    is_active: Optional[bool] = Field(None, description="是否激活")


class UserResponse(BaseModel):
    """用户响应"""
    id: int
    user_id: str
    username: Optional[str]
    device_id: str
    device_model: Optional[str]
    preferences: Optional[str]
    avatar: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_active_at: datetime
    is_active: bool

    class Config:
        from_attributes = True


class UserWithSessions(UserResponse):
    """包含会话的用户响应"""
    sessions: List['SessionResponse'] = []

    class Config:
        from_attributes = True
