"""
心理健康图表生成工具 - 生成情绪趋势、测评分数趋势、身体不适统计等可视化图表
"""
import asyncio
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Type

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from app.agent.tools.file_tool import get_session_workspace

logger = logging.getLogger(__name__)

FONT_PATH = Path.home() / ".ling-agent" / "fonts" / "NotoSansSC.ttf"

WARM_COLORS = ["#c9a87c", "#b8886e", "#8b7355", "#d4a574", "#a67c5b", "#c4956a"]
EMOTION_COLORS = {
    "焦虑": "#e07c5a",
    "低落": "#7a8bb5",
    "烦躁": "#d45d5d",
    "平静": "#7cb88a",
    "开心": "#e8b44a",
    "疲惫": "#9a8c9e",
}
BG_COLOR = "#fefcf3"
TEXT_COLOR = "#5a4a3a"
GRID_COLOR = "#e8dcc8"


def _setup_matplotlib():
    """配置 matplotlib 中文字体和全局样式"""
    import matplotlib.font_manager as fm
    if FONT_PATH.exists():
        fm.fontManager.addfont(str(FONT_PATH))

    import matplotlib.pyplot as plt

    if FONT_PATH.exists():
        font_name = fm.FontProperties(fname=str(FONT_PATH)).get_name()
        plt.rcParams["font.family"] = font_name
    plt.rcParams["axes.unicode_minus"] = False
    plt.rcParams["figure.facecolor"] = BG_COLOR
    plt.rcParams["axes.facecolor"] = BG_COLOR
    plt.rcParams["axes.edgecolor"] = GRID_COLOR
    plt.rcParams["axes.labelcolor"] = TEXT_COLOR
    plt.rcParams["xtick.color"] = TEXT_COLOR
    plt.rcParams["ytick.color"] = TEXT_COLOR
    plt.rcParams["text.color"] = TEXT_COLOR
    plt.rcParams["grid.color"] = GRID_COLOR
    plt.rcParams["grid.alpha"] = 0.6
    return plt


async def _get_db():
    from app.database.session import AsyncSessionLocal
    return AsyncSessionLocal()


class _ChartInput(BaseModel):
    chart_type: str = Field(
        description=(
            "图表类型: "
            "emotion_trend（情绪变化折线图）| "
            "assessment_trend（测评分数趋势图）| "
            "body_stats（身体不适部位统计柱状图）"
        )
    )
    days: int = Field(default=30, description="时间范围，默认30天")


class GenerateHealthChartTool(BaseTool):
    """生成心理健康数据的可视化图表"""

    name: str = "generate_health_chart"
    description: str = (
        "生成心理健康数据的可视化图表并保存为图片。"
        "支持三种类型: "
        "emotion_trend（情绪变化折线图，展示情绪强度随日期变化）、"
        "assessment_trend（测评分数趋势图，展示 PHQ-9/GAD-7 等量表分数随时间变化）、"
        "body_stats（身体不适部位统计柱状图）。"
        "返回图片文件的相对路径，可直接在对话中展示给用户。"
        "需要先有健康日记或测评数据才能生成图表。"
    )
    args_schema: Type[BaseModel] = _ChartInput
    current_user_id: Optional[str] = None
    current_session_id: Optional[str] = None

    def _run(self, chart_type: str, days: int = 30) -> str:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(asyncio.run, self._arun(chart_type, days))
                    return future.result()
            return loop.run_until_complete(self._arun(chart_type, days))
        except Exception as e:
            return f"Error: {e}"

    async def _arun(self, chart_type: str, days: int = 30) -> str:
        if not self.current_user_id:
            return "Error: 未获取到用户信息"

        handlers = {
            "emotion_trend": self._emotion_trend,
            "assessment_trend": self._assessment_trend,
            "body_stats": self._body_stats,
        }
        handler = handlers.get(chart_type)
        if not handler:
            return f"Error: 不支持的图表类型 '{chart_type}'，可选: {', '.join(handlers)}"

        try:
            return await handler(days)
        except Exception as e:
            logger.error(f"生成图表失败: {e}", exc_info=True)
            return f"Error: 生成图表失败 - {e}"

    def _get_output_dir(self) -> Path:
        if self.current_session_id:
            workspace = get_session_workspace(self.current_session_id)
        else:
            from app.core.config import settings
            workspace = Path(settings.WORKSPACE_ROOT).resolve()
            workspace.mkdir(parents=True, exist_ok=True)
        charts_dir = workspace / "outputs" / "charts"
        charts_dir.mkdir(parents=True, exist_ok=True)
        return charts_dir

    def _save_fig(self, plt, name: str) -> str:
        charts_dir = self._get_output_dir()
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{name}_{ts}.png"
        filepath = charts_dir / filename
        plt.savefig(str(filepath), dpi=150, bbox_inches="tight", facecolor=BG_COLOR)
        plt.close()
        return f"outputs/charts/{filename}"

    # ── 情绪趋势折线图 ──

    async def _emotion_trend(self, days: int) -> str:
        from app.crud.health import health_record_crud
        db = await _get_db()
        try:
            records = await health_record_crud.get_by_user(
                db, self.current_user_id, record_type="emotion", days=days, limit=500
            )
        finally:
            await db.close()

        if not records:
            return f"最近 {days} 天没有情绪记录，无法生成图表。请先在心理日记中记录一些情绪数据。"

        plt = _setup_matplotlib()
        fig, ax = plt.subplots(figsize=(10, 5))

        emotions_data: dict[str, list] = {}
        for r in records:
            emo = r.emotion or "未知"
            if emo not in emotions_data:
                emotions_data[emo] = {"dates": [], "levels": []}
            emotions_data[emo]["dates"].append(r.created_at)
            emotions_data[emo]["levels"].append(r.emotion_level or 5)

        for i, (emo, data) in enumerate(emotions_data.items()):
            color = EMOTION_COLORS.get(emo, WARM_COLORS[i % len(WARM_COLORS)])
            ax.plot(data["dates"], data["levels"], "o-", color=color, label=emo,
                    linewidth=2, markersize=6, alpha=0.85)

        ax.set_xlabel("日期")
        ax.set_ylabel("情绪强度")
        ax.set_title(f"最近 {days} 天情绪变化趋势", fontsize=14, fontweight="bold")
        ax.set_ylim(0, 11)
        ax.legend(loc="upper left", framealpha=0.8)
        ax.grid(True, linestyle="--", alpha=0.5)
        fig.autofmt_xdate()

        rel_path = self._save_fig(plt, "emotion_trend")
        return f"情绪趋势图已生成: {rel_path}"

    # ── 测评分数趋势图 ──

    async def _assessment_trend(self, days: int) -> str:
        from app.crud.health import assessment_crud
        db = await _get_db()
        try:
            records = await assessment_crud.get_by_user(
                db, self.current_user_id, limit=100
            )
        finally:
            await db.close()

        since = datetime.utcnow() - timedelta(days=days)
        records = [r for r in records
                   if r.created_at >= since
                   and (r.result_type or "severity") == "severity"]

        if not records:
            return f"最近 {days} 天没有分数型测评记录（PHQ-9、GAD-7 等），无法生成趋势图。"

        plt = _setup_matplotlib()
        fig, ax = plt.subplots(figsize=(10, 5))

        scales_data: dict[str, list] = {}
        for r in records:
            st = r.scale_type
            if st not in scales_data:
                scales_data[st] = {"dates": [], "scores": [], "severities": []}
            scales_data[st]["dates"].append(r.created_at)
            scales_data[st]["scores"].append(r.total_score)
            scales_data[st]["severities"].append(r.severity)

        for i, (scale, data) in enumerate(scales_data.items()):
            color = WARM_COLORS[i % len(WARM_COLORS)]
            ax.plot(data["dates"], data["scores"], "s-", color=color, label=scale,
                    linewidth=2, markersize=7, alpha=0.85)
            for x, y, sev in zip(data["dates"], data["scores"], data["severities"]):
                ax.annotate(sev, (x, y), textcoords="offset points",
                            xytext=(0, 8), fontsize=7, ha="center", color=color, alpha=0.8)

        ax.set_xlabel("日期")
        ax.set_ylabel("分数")
        ax.set_title(f"最近 {days} 天测评分数趋势", fontsize=14, fontweight="bold")
        ax.legend(loc="upper left", framealpha=0.8)
        ax.grid(True, linestyle="--", alpha=0.5)
        fig.autofmt_xdate()

        rel_path = self._save_fig(plt, "assessment_trend")
        return f"测评分数趋势图已生成: {rel_path}"

    # ── 身体不适部位统计 ──

    async def _body_stats(self, days: int) -> str:
        from app.crud.health import health_record_crud
        db = await _get_db()
        try:
            stats = await health_record_crud.get_stats(db, self.current_user_id, days)
        finally:
            await db.close()

        body_part_stats = stats.get("body_part_stats", [])
        if not body_part_stats:
            return f"最近 {days} 天没有身体不适记录，无法生成统计图。请先在心理日记中记录一些身体不适数据。"

        plt = _setup_matplotlib()
        fig, ax = plt.subplots(figsize=(8, max(4, len(body_part_stats) * 0.8)))

        parts = [s["part"] for s in body_part_stats]
        counts = [s["count"] for s in body_part_stats]
        sorted_pairs = sorted(zip(parts, counts), key=lambda x: x[1])
        parts, counts = zip(*sorted_pairs)

        colors = [WARM_COLORS[i % len(WARM_COLORS)] for i in range(len(parts))]
        bars = ax.barh(parts, counts, color=colors, height=0.6, alpha=0.85)

        for bar, count in zip(bars, counts):
            ax.text(bar.get_width() + 0.1, bar.get_y() + bar.get_height() / 2,
                    str(count), va="center", fontsize=11, color=TEXT_COLOR)

        ax.set_xlabel("记录次数")
        ax.set_title(f"最近 {days} 天身体不适部位统计", fontsize=14, fontweight="bold")
        ax.grid(True, axis="x", linestyle="--", alpha=0.5)

        rel_path = self._save_fig(plt, "body_stats")
        return f"身体不适统计图已生成: {rel_path}"
