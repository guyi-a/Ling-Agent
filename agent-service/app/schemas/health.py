"""
心理健康日记 + 测评相关 Pydantic 模型
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List


# ─── 健康日记 ───

class HealthRecordCreate(BaseModel):
    """创建健康日记记录"""
    record_type: str = Field(..., description="记录类型: body | emotion")
    body_part: Optional[str] = Field(None, description="不适部位")
    discomfort_level: Optional[int] = Field(None, ge=1, le=10, description="不适程度 1-10")
    symptoms: Optional[str] = Field(None, description="具体症状描述")
    emotion: Optional[str] = Field(None, description="主要情绪")
    emotion_level: Optional[int] = Field(None, ge=1, le=10, description="情绪强度 1-10")
    trigger: Optional[str] = Field(None, description="触发事件")
    notes: Optional[str] = Field(None, description="自由备注")


class HealthRecordResponse(BaseModel):
    """健康日记记录响应"""
    id: int
    record_id: str
    user_id: str
    record_type: str
    body_part: Optional[str] = None
    discomfort_level: Optional[int] = None
    symptoms: Optional[str] = None
    emotion: Optional[str] = None
    emotion_level: Optional[int] = None
    trigger: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class HealthStatsResponse(BaseModel):
    """统计数据响应"""
    total_records: int
    body_records: int
    emotion_records: int
    emotion_trend: List[dict] = Field(default_factory=list, description="情绪趋势数据")
    body_part_stats: List[dict] = Field(default_factory=list, description="身体不适部位统计")


# ─── 心理测评 ───

class AssessmentSubmit(BaseModel):
    """提交测评"""
    scale_type: str = Field(..., description="量表类型，如 PHQ-9、GAD-7、MBTI、SBTI 等")
    answers: List[dict] = Field(..., description="答案列表: [{q: 1, score: 2}, ...]")


class AssessmentResponse(BaseModel):
    """测评结果响应"""
    id: int
    assessment_id: str
    user_id: str
    scale_type: str
    answers: Optional[str] = None
    total_score: int
    severity: str
    result_type: Optional[str] = "severity"
    result_detail: Optional[str] = None
    ai_suggestion: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ScaleSummary(BaseModel):
    """量表摘要（列表用）"""
    name: str
    category: str = ""
    title: str
    description: str
    question_count: int
    estimated_minutes: int
    scoring_type: str = "severity"
