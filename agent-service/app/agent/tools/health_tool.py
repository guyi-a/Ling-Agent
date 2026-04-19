"""
心理健康工具 - 让 Agent 在对话中读写用户的健康日记和测评数据
"""
import json
import logging
from pathlib import Path
from typing import Optional, Type

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

SCALES_DIR = Path(__file__).parent.parent / "data" / "scales"

logger = logging.getLogger(__name__)


# ─── 工具输入 Schema ───

class _GetHealthRecordsInput(BaseModel):
    days: int = Field(default=30, description="获取最近 N 天的记录，默认30天")


class _GetAssessmentHistoryInput(BaseModel):
    limit: int = Field(default=5, description="获取最近 N 条测评记录，默认5条")


class _GetScaleQuestionsInput(BaseModel):
    scale_type: str = Field(default="", description="量表名称，如 GAD-7、PHQ-9 等。留空则返回所有可用量表的列表")


class _SubmitAssessmentInput(BaseModel):
    scale_type: str = Field(description="量表名称，需与 get_scale_questions 返回的 name 一致")
    answers: str = Field(description='答案 JSON 数组，如 [{"q":1,"score":2},{"q":2,"score":1}]，每个 q 对应题目 id，score 对应选项分数')


class _SaveHealthRecordInput(BaseModel):
    record_type: str = Field(description="记录类型: body（身体不适）或 emotion（情绪）")
    body_part: Optional[str] = Field(default=None, description="不适部位：头、胸、胃、背、全身、其他")
    discomfort_level: Optional[int] = Field(default=None, description="不适程度 1-10")
    symptoms: Optional[str] = Field(default=None, description="具体症状描述")
    emotion: Optional[str] = Field(default=None, description="主要情绪：焦虑、低落、烦躁、平静、开心等")
    emotion_level: Optional[int] = Field(default=None, description="情绪强度 1-10")
    trigger: Optional[str] = Field(default=None, description="触发事件")
    notes: Optional[str] = Field(default=None, description="备注")


# ─── 工具实现 ───

async def _get_db_session():
    """获取一个异步数据库 session"""
    from app.database.session import AsyncSessionLocal
    return AsyncSessionLocal()


class GetScaleQuestionsTool(BaseTool):
    """获取心理量表的题目内容，或列出所有可用量表"""
    name: str = "get_scale_questions"
    description: str = (
        "获取心理量表信息。"
        "不传 scale_type（或传空字符串）→ 返回所有可用量表的列表（名称、分类、题数）。"
        "传 scale_type → 返回该量表的完整题目和选项。"
        "在对话中引导用户做测评前，必须先调用此工具获取题目，不要凭记忆出题。"
    )
    args_schema: Type[BaseModel] = _GetScaleQuestionsInput

    def _run(self, scale_type: str = "") -> str:
        return self._load(scale_type)

    async def _arun(self, scale_type: str = "") -> str:
        return self._load(scale_type)

    def _load(self, scale_type: str = "") -> str:
        if not SCALES_DIR.exists():
            return "Error: scales 目录不存在"

        # 不传 scale_type → 返回可用量表列表
        if not scale_type:
            scales = []
            for f in sorted(SCALES_DIR.glob("*.json")):
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                    scales.append({
                        "name": data["name"],
                        "title": data["title"],
                        "category": data.get("category", ""),
                        "question_count": len(data.get("questions", [])),
                        "description": data.get("description", ""),
                    })
                except Exception:
                    continue
            return json.dumps(scales, ensure_ascii=False)

        # 传了 scale_type → 返回完整题目
        scale_file = SCALES_DIR / f"{scale_type}.json"
        if not scale_file.exists():
            available = [f.stem for f in sorted(SCALES_DIR.glob("*.json"))]
            return f"Error: 量表 {scale_type} 不存在，可用量表: {', '.join(available)}"
        try:
            data = json.loads(scale_file.read_text(encoding="utf-8"))
            result = {
                "name": data["name"],
                "title": data["title"],
                "category": data.get("category", ""),
                "instruction": data.get("instruction", ""),
                "questions": data["questions"],
            }
            return json.dumps(result, ensure_ascii=False)
        except Exception as e:
            logger.error(f"读取量表失败: {e}", exc_info=True)
            return f"Error: {e}"


class GetHealthRecordsTool(BaseTool):
    """获取用户健康日记记录"""
    name: str = "get_health_records"
    description: str = (
        "获取当前用户最近N天的健康日记记录（身体不适+情绪），"
        "用于分析趋势和生成报告。返回 JSON 格式的记录列表。"
    )
    args_schema: Type[BaseModel] = _GetHealthRecordsInput
    current_user_id: Optional[str] = None

    def _run(self, days: int = 30) -> str:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self._arun(days))

    async def _arun(self, days: int = 30) -> str:
        if not self.current_user_id:
            return "Error: 未获取到用户信息"
        try:
            from app.crud.health import health_record_crud
            db = await _get_db_session()
            try:
                records = await health_record_crud.get_by_user(
                    db, self.current_user_id, days=days, limit=100
                )
                if not records:
                    return f"最近 {days} 天没有健康日记记录。"
                result = []
                for r in records:
                    entry = {
                        "date": r.created_at.strftime("%Y-%m-%d %H:%M"),
                        "type": r.record_type,
                    }
                    if r.record_type == "body":
                        entry.update({"body_part": r.body_part, "level": r.discomfort_level, "symptoms": r.symptoms})
                    else:
                        entry.update({"emotion": r.emotion, "level": r.emotion_level, "trigger": r.trigger})
                    if r.notes:
                        entry["notes"] = r.notes
                    result.append(entry)
                return json.dumps(result, ensure_ascii=False, indent=2)
            finally:
                await db.close()
        except Exception as e:
            logger.error(f"获取健康记录失败: {e}", exc_info=True)
            return f"Error: {e}"


class GetAssessmentHistoryTool(BaseTool):
    """获取用户测评历史"""
    name: str = "get_assessment_history"
    description: str = (
        "获取当前用户最近的心理测评记录，"
        "包含量表类型、总分、严重程度、AI建议等。返回 JSON 格式。"
    )
    args_schema: Type[BaseModel] = _GetAssessmentHistoryInput
    current_user_id: Optional[str] = None

    def _run(self, limit: int = 5) -> str:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self._arun(limit))

    async def _arun(self, limit: int = 5) -> str:
        if not self.current_user_id:
            return "Error: 未获取到用户信息"
        try:
            from app.crud.health import assessment_crud
            db = await _get_db_session()
            try:
                records = await assessment_crud.get_by_user(
                    db, self.current_user_id, limit=limit
                )
                if not records:
                    return "暂无测评记录。"
                result = []
                for r in records:
                    entry = {
                        "date": r.created_at.strftime("%Y-%m-%d %H:%M"),
                        "scale": r.scale_type,
                        "score": r.total_score,
                        "severity": r.severity,
                        "result_type": r.result_type or "severity",
                        "suggestion": r.ai_suggestion,
                    }
                    if r.result_detail:
                        try:
                            entry["result_detail"] = json.loads(r.result_detail)
                        except (json.JSONDecodeError, TypeError):
                            pass
                    result.append(entry)
                return json.dumps(result, ensure_ascii=False, indent=2)
            finally:
                await db.close()
        except Exception as e:
            logger.error(f"获取测评记录失败: {e}", exc_info=True)
            return f"Error: {e}"


class SaveHealthRecordTool(BaseTool):
    """通过对话保存健康日记记录"""
    name: str = "save_health_record"
    description: str = (
        "通过对话保存一条健康日记记录。"
        "record_type 为 'body' 时填 body_part/discomfort_level/symptoms，"
        "为 'emotion' 时填 emotion/emotion_level/trigger。"
    )
    args_schema: Type[BaseModel] = _SaveHealthRecordInput
    current_user_id: Optional[str] = None

    def _run(self, **kwargs) -> str:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self._arun(**kwargs))

    async def _arun(
        self, record_type: str,
        body_part: Optional[str] = None, discomfort_level: Optional[int] = None,
        symptoms: Optional[str] = None, emotion: Optional[str] = None,
        emotion_level: Optional[int] = None, trigger: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> str:
        if not self.current_user_id:
            return "Error: 未获取到用户信息"
        if record_type not in ("body", "emotion"):
            return "Error: record_type 必须为 body 或 emotion"
        try:
            from app.crud.health import health_record_crud
            from app.schemas.health import HealthRecordCreate
            db = await _get_db_session()
            try:
                data = HealthRecordCreate(
                    record_type=record_type,
                    body_part=body_part, discomfort_level=discomfort_level,
                    symptoms=symptoms, emotion=emotion,
                    emotion_level=emotion_level, trigger=trigger, notes=notes,
                )
                record = await health_record_crud.create(db, data, self.current_user_id)
                return f"已保存{('身体不适' if record_type == 'body' else '情绪')}记录 (ID: {record.record_id[:8]}...)"
            finally:
                await db.close()
        except Exception as e:
            logger.error(f"保存健康记录失败: {e}", exc_info=True)
            return f"Error: {e}"


class SubmitAssessmentTool(BaseTool):
    """通过对话提交心理测评结果"""
    name: str = "submit_assessment"
    description: str = (
        "在对话中引导用户完成心理测评后，提交所有答案并获取结果。"
        "scale_type 为量表名称（如 GAD-7），answers 为 JSON 字符串，"
        '格式: [{"q":1,"score":2},{"q":2,"score":1},...] 每题的 q 是题目 id，score 是用户选择的选项分数。'
    )
    args_schema: Type[BaseModel] = _SubmitAssessmentInput
    current_user_id: Optional[str] = None

    def _run(self, **kwargs) -> str:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self._arun(**kwargs))

    async def _arun(self, scale_type: str, answers: str) -> str:
        if not self.current_user_id:
            return "Error: 未获取到用户信息"
        try:
            answer_list = json.loads(answers)
            if not isinstance(answer_list, list):
                return "Error: answers 必须是 JSON 数组"
        except json.JSONDecodeError:
            return "Error: answers 不是有效的 JSON 格式"

        try:
            from app.crud.health import assessment_crud
            from app.schemas.health import AssessmentSubmit
            db = await _get_db_session()
            try:
                data = AssessmentSubmit(scale_type=scale_type, answers=answer_list)
                record = await assessment_crud.create(db, data, self.current_user_id)
                resp = {
                    "scale": record.scale_type,
                    "total_score": record.total_score,
                    "severity": record.severity,
                    "result_type": record.result_type or "severity",
                    "assessment_id": record.assessment_id,
                }
                if record.result_detail:
                    resp["result_detail"] = json.loads(record.result_detail)
                return json.dumps(resp, ensure_ascii=False)
            finally:
                await db.close()
        except Exception as e:
            logger.error(f"提交测评失败: {e}", exc_info=True)
            return f"Error: {e}"
