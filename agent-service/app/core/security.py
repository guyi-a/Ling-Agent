"""
JWT 工具类 - 生成和验证 Token
"""
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

logger = logging.getLogger(__name__)

# 密码哈希上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """对密码进行哈希"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    生成 access token
    
    Args:
        data: 需要编码的数据（至少包含 'sub' 字段）
        expires_delta: 过期时间，默认 settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES 分钟
    
    Returns:
        JWT token 字符串
    """
    to_encode = data.copy()
    
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    to_encode.update({
        "exp": expire,
        "type": "access"
    })
    
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: Dict[str, Any]) -> str:
    """
    生成 refresh token（有效期更长）
    
    Args:
        data: 需要编码的数据
    
    Returns:
        JWT token 字符串
    """
    to_encode = data.copy()
    
    expire = datetime.utcnow() + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    
    to_encode.update({
        "exp": expire,
        "type": "refresh"
    })
    
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """
    解码并验证 token
    
    Args:
        token: JWT token 字符串
    
    Returns:
        解码后的 payload，验证失败返回 None
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except JWTError as e:
        logger.warning(f"Token 验证失败: {e}")
        return None


def get_user_id_from_token(token: str) -> Optional[str]:
    """
    从 token 中提取 user_id
    
    Args:
        token: JWT token 字符串
    
    Returns:
        user_id 字符串，验证失败返回 None
    """
    payload = decode_token(token)
    if not payload:
        return None
    return payload.get("sub")
