"""
LLM 模型管理路由 — 查询可用模型列表
"""
from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.user import User
from app.agent.infra.provider_config import list_available_models

router = APIRouter(prefix="/api/llm", tags=["llm"])


@router.get("/models")
async def get_models(current_user: User = Depends(get_current_user)):
    """返回所有已配置 API key 的可用模型"""
    models = list_available_models()
    return {"models": models}
