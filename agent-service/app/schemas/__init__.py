"""
Pydantic 数据模型
"""
from .user import UserCreate, UserUpdate, UserResponse, UserWithSessions
from .message import MessageCreate, MessageResponse, MessageList
from .session import SessionCreate, SessionUpdate, SessionResponse, SessionList, SessionWithMessages

# 解决前向引用问题
UserWithSessions.model_rebuild()
SessionWithMessages.model_rebuild()

__all__ = [
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "UserWithSessions",
    "MessageCreate",
    "MessageResponse",
    "MessageList",
    "SessionCreate",
    "SessionUpdate",
    "SessionResponse",
    "SessionList",
    "SessionWithMessages",
]
