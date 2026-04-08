"""
Auth 相关的 Pydantic 模型
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class RegisterRequest(BaseModel):
    """注册请求"""
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    password: str = Field(..., min_length=6, description="密码")
    device_id: str = Field(..., description="设备ID")
    device_model: Optional[str] = Field(None, description="设备型号")


class LoginRequest(BaseModel):
    """登录请求"""
    username: str = Field(..., description="用户名")
    password: str = Field(..., description="密码")


class TokenResponse(BaseModel):
    """Token 响应"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    username: str


class ChangePasswordRequest(BaseModel):
    """修改密码请求"""
    old_password: str = Field(..., description="旧密码")
    new_password: str = Field(..., min_length=6, description="新密码")


class RefreshRequest(BaseModel):
    """刷新 Token 请求"""
    refresh_token: str


class AccountResponse(BaseModel):
    """账号信息响应"""
    id: int
    user_id: str
    username: str
    created_at: datetime
    is_active: bool

    class Config:
        from_attributes = True
