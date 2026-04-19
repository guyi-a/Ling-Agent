"""
心理健康日记路由（需要 JWT 认证）
"""
import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List

from app.database.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.crud.health import health_record_crud, assessment_crud
from app.schemas.health import (
    HealthRecordCreate, HealthRecordResponse, HealthStatsResponse,
    AssessmentSubmit, AssessmentResponse, ScaleSummary,
)

router = APIRouter(prefix="/api/health", tags=["health"])

SCALES_DIR = Path(__file__).parent.parent / "agent" / "data" / "scales"


# ─── 健康日记 ───

@router.post("/records", response_model=HealthRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_record(
    data: HealthRecordCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建健康日记记录"""
    if data.record_type not in ("body", "emotion"):
        raise HTTPException(status_code=400, detail="record_type 必须为 body 或 emotion")
    return await health_record_crud.create(db, data, current_user.user_id)


@router.get("/records", response_model=List[HealthRecordResponse])
async def get_records(
    record_type: Optional[str] = Query(None, description="筛选类型: body | emotion"),
    days: Optional[int] = Query(None, ge=1, le=365, description="最近 N 天"),
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """查询健康日记记录列表"""
    return await health_record_crud.get_by_user(
        db, current_user.user_id,
        record_type=record_type, days=days, skip=skip, limit=limit,
    )


@router.get("/records/{record_id}", response_model=HealthRecordResponse)
async def get_record(
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """查询单条记录"""
    record = await health_record_crud.get_by_id(db, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    if record.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="无权访问")
    return record


@router.delete("/records/{record_id}")
async def delete_record(
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除记录"""
    success = await health_record_crud.delete(db, record_id, current_user.user_id)
    if not success:
        raise HTTPException(status_code=404, detail="记录不存在或无权删除")
    return {"status": "success", "message": "记录已删除"}


@router.get("/stats", response_model=HealthStatsResponse)
async def get_stats(
    days: int = Query(30, ge=1, le=365, description="统计最近 N 天"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取统计数据"""
    return await health_record_crud.get_stats(db, current_user.user_id, days)


# ─── 心理测评 ───

@router.post("/assessment/submit", response_model=AssessmentResponse, status_code=status.HTTP_201_CREATED)
async def submit_assessment(
    data: AssessmentSubmit,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """提交测评（自动计分）"""
    return await assessment_crud.create(db, data, current_user.user_id)


@router.get("/assessment/scales", response_model=List[ScaleSummary])
async def get_scales():
    """获取可用量表列表"""
    scales = []
    if not SCALES_DIR.exists():
        return scales
    for f in sorted(SCALES_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            scoring_type = data.get("scoring", {}).get("type") or data.get("scoring_type", "severity")
            scales.append(ScaleSummary(
                name=data["name"],
                category=data.get("category", ""),
                title=data["title"],
                description=data["description"],
                question_count=len(data.get("questions", [])),
                estimated_minutes=max(1, len(data.get("questions", [])) // 3),
                scoring_type=scoring_type,
            ))
        except Exception:
            continue
    return scales


@router.get("/assessment/scales/{scale_type}")
async def get_scale_questions(scale_type: str):
    """获取量表题目"""
    scale_file = SCALES_DIR / f"{scale_type}.json"
    if not scale_file.exists():
        raise HTTPException(status_code=404, detail=f"量表 {scale_type} 不存在")
    return json.loads(scale_file.read_text(encoding="utf-8"))


@router.get("/assessment/history", response_model=List[AssessmentResponse])
async def get_assessment_history(
    scale_type: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """测评历史"""
    return await assessment_crud.get_by_user(
        db, current_user.user_id,
        scale_type=scale_type, skip=skip, limit=limit,
    )
