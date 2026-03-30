"""
认证路由 - 注册/登录/刷新Token
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.crud.account import account_crud
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, RefreshRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    注册新用户
    
    - 创建 User 记录（设备信息）
    - 创建 Account 记录（登录凭据）
    - 返回 access_token + refresh_token
    """
    if await account_crud.username_exists(db, req.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"用户名 '{req.username}' 已被占用"
        )

    user, account = await account_crud.register(db, req)
    logger.info(f"✓ 新用户注册: {req.username} (user_id: {user.user_id})")

    token_data = {"sub": user.user_id, "username": account.username}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user_id=user.user_id,
        username=account.username,
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """登录，返回 access_token + refresh_token"""
    account = await account_crud.authenticate(db, req.username, req.password)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )
    if not account.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账号已被禁用"
        )

    logger.info(f"✓ 用户登录: {req.username}")
    token_data = {"sub": account.user_id, "username": account.username}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user_id=account.user_id,
        username=account.username,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """用 refresh_token 换取新的 access_token"""
    payload = decode_token(req.refresh_token)

    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="refresh_token 无效或已过期"
        )

    user_id = payload.get("sub")
    username = payload.get("username")

    token_data = {"sub": user_id, "username": username}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user_id=user_id,
        username=username,
    )
