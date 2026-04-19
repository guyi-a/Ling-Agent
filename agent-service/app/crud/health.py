"""
健康日记 + 测评 CRUD 操作
"""
import json
import logging
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func

from app.models.health_record import HealthRecord
from app.models.assessment import Assessment
from app.schemas.health import HealthRecordCreate, AssessmentSubmit

logger = logging.getLogger(__name__)

SCALES_DIR = Path(__file__).parent.parent / "agent" / "data" / "scales"


class HealthRecordCRUD:
    """健康日记 CRUD"""

    async def create(self, db: AsyncSession, data: HealthRecordCreate, user_id: str) -> HealthRecord:
        record = HealthRecord(
            record_id=str(uuid.uuid4()),
            user_id=user_id,
            record_type=data.record_type,
            body_part=data.body_part,
            discomfort_level=data.discomfort_level,
            symptoms=data.symptoms,
            emotion=data.emotion,
            emotion_level=data.emotion_level,
            trigger=data.trigger,
            notes=data.notes,
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)
        return record

    async def get_by_id(self, db: AsyncSession, record_id: str) -> Optional[HealthRecord]:
        result = await db.execute(
            select(HealthRecord).where(HealthRecord.record_id == record_id)
        )
        return result.scalars().first()

    async def get_by_user(
        self, db: AsyncSession, user_id: str,
        record_type: Optional[str] = None,
        days: Optional[int] = None,
        skip: int = 0, limit: int = 50,
    ) -> List[HealthRecord]:
        query = select(HealthRecord).where(HealthRecord.user_id == user_id)
        if record_type:
            query = query.where(HealthRecord.record_type == record_type)
        if days:
            since = datetime.utcnow() - timedelta(days=days)
            query = query.where(HealthRecord.created_at >= since)
        query = query.order_by(HealthRecord.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())

    async def delete(self, db: AsyncSession, record_id: str, user_id: str) -> bool:
        record = await self.get_by_id(db, record_id)
        if not record or record.user_id != user_id:
            return False
        await db.execute(
            delete(HealthRecord).where(HealthRecord.record_id == record_id)
        )
        await db.commit()
        return True

    async def get_stats(self, db: AsyncSession, user_id: str, days: int = 30) -> dict:
        since = datetime.utcnow() - timedelta(days=days)
        base = select(HealthRecord).where(
            HealthRecord.user_id == user_id,
            HealthRecord.created_at >= since,
        )

        # 总数
        total_result = await db.execute(
            select(func.count()).select_from(base.subquery())
        )
        total = total_result.scalar() or 0

        # 按类型统计
        body_result = await db.execute(
            select(func.count()).select_from(
                base.where(HealthRecord.record_type == "body").subquery()
            )
        )
        body_count = body_result.scalar() or 0

        # 情绪趋势（按天聚合）
        emotion_records = await db.execute(
            base.where(HealthRecord.record_type == "emotion")
            .order_by(HealthRecord.created_at.asc())
        )
        emotion_trend = []
        for r in emotion_records.scalars().all():
            emotion_trend.append({
                "date": r.created_at.strftime("%Y-%m-%d"),
                "emotion": r.emotion,
                "level": r.emotion_level,
            })

        # 身体不适部位统计
        body_records = await db.execute(
            base.where(HealthRecord.record_type == "body")
        )
        part_counts: dict = {}
        for r in body_records.scalars().all():
            if r.body_part:
                part_counts[r.body_part] = part_counts.get(r.body_part, 0) + 1
        body_part_stats = [{"part": k, "count": v} for k, v in part_counts.items()]

        return {
            "total_records": total,
            "body_records": body_count,
            "emotion_records": total - body_count,
            "emotion_trend": emotion_trend,
            "body_part_stats": body_part_stats,
        }


def _load_scale_data(scale_type: str) -> Optional[dict]:
    """从 scales/ 目录加载量表 JSON"""
    for d in (SCALES_DIR,):
        f = d / f"{scale_type}.json"
        if f.exists():
            try:
                return json.loads(f.read_text(encoding="utf-8"))
            except Exception as e:
                logger.error(f"读取量表 {scale_type} 失败: {e}")
    return None


def _get_scoring_type(scale_data: dict) -> str:
    """获取量表的计分类型"""
    # 优先用 scoring.type（更准确），回退到顶层 scoring_type
    st = scale_data.get("scoring", {}).get("type")
    if not st:
        st = scale_data.get("scoring_type", "severity")
    return st


def _score_dimensions(scale_data: dict, answers: list) -> dict:
    """MBTI 维度计分：每维度多数票决定字母"""
    scoring = scale_data["scoring"]
    dimensions = scoring["dimensions"]
    answer_map = {a["q"]: a["score"] for a in answers}

    type_code = ""
    dim_detail = {}
    for dim in dimensions:
        code = dim["code"]
        poles = dim["poles"]
        counts = [0, 0]
        for qid in dim["questions"]:
            score = answer_map.get(qid, 0)
            if score in (0, 1):
                counts[score] += 1
        winner = 0 if counts[0] >= counts[1] else 1
        type_code += poles[winner]
        dim_detail[code] = {poles[0]: counts[0], poles[1]: counts[1]}

    type_info = scoring.get("types", {}).get(type_code, {})
    return {
        "result_type": "personality",
        "severity": type_code,
        "total_score": 0,
        "result_detail": json.dumps({
            "type": type_code,
            "dimensions": dim_detail,
            "title": type_info.get("title", ""),
            "emoji": type_info.get("emoji", ""),
            "description": type_info.get("description", ""),
        }, ensure_ascii=False),
    }


def _score_multi_dimension(scale_data: dict, answers: list) -> dict:
    """SBTI 多维度计分：15维度→L/M/H pattern→曼哈顿距离匹配"""
    scoring = scale_data["scoring"]
    answer_map = {a["q"]: a["score"] for a in answers}

    # ── 特殊规则：q4 选"饮酒"→ DRUN-K ──
    gate_qid = scoring.get("step1_per_question", {}).get("gate_question", {}).get("id")
    if gate_qid and answer_map.get(gate_qid) == 2:
        return {
            "result_type": "label",
            "severity": "DRUN-K",
            "total_score": 100,
            "result_detail": json.dumps({
                "label": "DRUN-K", "title": "酒鬼",
                "similarity": 100, "pattern": None,
                "special_rule": "DRUNK",
            }, ensure_ascii=False),
        }

    # ── Step 1: 每题 value（1/2/3），反向题 3/2/1 ──
    reverse_qs = set(scoring.get("step1_per_question", {}).get("reverse_questions", []))

    def get_value(qid: int, score: int) -> int:
        if qid in reverse_qs:
            return 3 - score        # reverse: 0→3, 1→2, 2→1
        return score + 1            # normal:  0→1, 1→2, 2→3

    # ── Step 2: 维度 raw score → L/M/H ──
    dim_map = scoring.get("dimension_question_map", {})
    dim_order = scoring.get("step3_pattern", {}).get("order", [])

    dim_scores = {}
    dim_lmh = {}
    for dim_key in dim_order:
        full_key = next((k for k in dim_map if k.startswith(dim_key)), None)
        if not full_key:
            dim_lmh[dim_key] = "M"
            dim_scores[dim_key] = 0
            continue
        q_ids = dim_map[full_key]
        raw = sum(get_value(qid, answer_map.get(qid, 1)) for qid in q_ids)
        dim_scores[dim_key] = raw
        if raw <= 3:
            dim_lmh[dim_key] = "L"
        elif raw == 4:
            dim_lmh[dim_key] = "M"
        else:
            dim_lmh[dim_key] = "H"

    # ── Step 3: 拼 15 位 pattern ──
    pattern_chars = [dim_lmh.get(d, "M") for d in dim_order]
    pattern_str = "".join(pattern_chars)
    formatted = "-".join(pattern_str[i:i+3] for i in range(0, len(pattern_str), 3))

    # ── Step 4: 曼哈顿距离匹配 ──
    encoding = {"L": 1, "M": 2, "H": 3}
    personalities = scoring.get("personalities", {})
    if isinstance(personalities, dict):
        patterns_data = personalities.get("patterns", {})
    else:
        patterns_data = {}

    best_label = None
    best_dist = float("inf")
    best_sim = 0
    best_info = {}

    for label, info in patterns_data.items():
        ref = (info.get("pattern") or "").replace("-", "")
        if len(ref) != len(pattern_str):
            continue
        dist = sum(abs(encoding.get(a, 2) - encoding.get(b, 2))
                   for a, b in zip(pattern_chars, ref))
        sim = max(0, round((1 - dist / 30) * 100))
        if dist < best_dist:
            best_dist = dist
            best_sim = sim
            best_label = label
            best_info = info

    dim_detail = {d: {"raw": dim_scores.get(d, 0), "level": dim_lmh.get(d, "M")}
                  for d in dim_order}

    # HHHH 兜底
    if best_sim < 60 or not best_label:
        hhhh = patterns_data.get("HHHH", {})
        return {
            "result_type": "label",
            "severity": "HHHH",
            "total_score": best_sim,
            "result_detail": json.dumps({
                "label": "HHHH", "title": hhhh.get("title", "未分类人格"),
                "similarity": best_sim, "pattern": formatted,
                "dimensions": dim_detail,
            }, ensure_ascii=False),
        }

    return {
        "result_type": "label",
        "severity": best_label,
        "total_score": best_sim,
        "result_detail": json.dumps({
            "label": best_label, "title": best_info.get("title", ""),
            "similarity": best_sim, "pattern": formatted,
            "dimensions": dim_detail,
        }, ensure_ascii=False),
    }


class AssessmentCRUD:
    """测评 CRUD"""

    async def create(self, db: AsyncSession, data: AssessmentSubmit, user_id: str) -> Assessment:
        scale_data = _load_scale_data(data.scale_type)
        scoring_type = _get_scoring_type(scale_data) if scale_data else "severity"

        if scoring_type == "dimensions":
            result = _score_dimensions(scale_data, data.answers)
        elif scoring_type == "multi_dimension":
            result = _score_multi_dimension(scale_data, data.answers)
        else:
            total_score = sum(a.get("score", 0) for a in data.answers)
            result = {
                "result_type": "severity",
                "severity": self._calculate_severity(data.scale_type, total_score),
                "total_score": total_score,
                "result_detail": None,
            }

        record = Assessment(
            assessment_id=str(uuid.uuid4()),
            user_id=user_id,
            scale_type=data.scale_type,
            answers=json.dumps(data.answers, ensure_ascii=False),
            total_score=result["total_score"],
            severity=result["severity"],
            result_type=result["result_type"],
            result_detail=result.get("result_detail"),
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)
        return record

    async def get_by_user(
        self, db: AsyncSession, user_id: str,
        scale_type: Optional[str] = None,
        skip: int = 0, limit: int = 20,
    ) -> List[Assessment]:
        query = select(Assessment).where(Assessment.user_id == user_id)
        if scale_type:
            query = query.where(Assessment.scale_type == scale_type)
        query = query.order_by(Assessment.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())

    def _calculate_severity(self, scale_type: str, total_score: int) -> str:
        """根据量表类型和总分计算严重程度"""
        ranges = SEVERITY_RANGES.get(scale_type)
        if not ranges:
            return "未知"
        for r in ranges:
            if r["min"] <= total_score <= r["max"]:
                return r["severity"]
        return "未知"


# 各量表分数区间
SEVERITY_RANGES = {
    "PHQ-9": [
        {"min": 0, "max": 4, "severity": "正常"},
        {"min": 5, "max": 9, "severity": "轻度抑郁"},
        {"min": 10, "max": 14, "severity": "中度抑郁"},
        {"min": 15, "max": 27, "severity": "重度抑郁"},
    ],
    "GAD-7": [
        {"min": 0, "max": 4, "severity": "正常"},
        {"min": 5, "max": 9, "severity": "轻度焦虑"},
        {"min": 10, "max": 14, "severity": "中度焦虑"},
        {"min": 15, "max": 21, "severity": "重度焦虑"},
    ],
    "SDS": [
        {"min": 25, "max": 49, "severity": "正常"},
        {"min": 50, "max": 59, "severity": "轻度抑郁"},
        {"min": 60, "max": 69, "severity": "中度抑郁"},
        {"min": 70, "max": 100, "severity": "重度抑郁"},
    ],
    "SAS": [
        {"min": 25, "max": 49, "severity": "正常"},
        {"min": 50, "max": 59, "severity": "轻度焦虑"},
        {"min": 60, "max": 69, "severity": "中度焦虑"},
        {"min": 70, "max": 100, "severity": "重度焦虑"},
    ],
    "PSS-10": [
        {"min": 0, "max": 13, "severity": "压力较低"},
        {"min": 14, "max": 26, "severity": "中等压力"},
        {"min": 27, "max": 40, "severity": "压力较高"},
    ],
}


health_record_crud = HealthRecordCRUD()
assessment_crud = AssessmentCRUD()
