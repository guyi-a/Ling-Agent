"""
心理健康图表生成工具 - 使用 Plotly 生成交互式 HTML 图表
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

BG_COLOR = "#fefcf3"
TEXT_COLOR = "#5a4a3a"
GRID_COLOR = "#e8dcc8"
WARM_COLORS = ["#c9a87c", "#b8886e", "#8b7355", "#d4a574", "#a67c5b", "#c4956a", "#e8c49c"]
EMOTION_COLORS = {
    "焦虑": "#e07c5a",
    "低落": "#7a8bb5",
    "烦躁": "#d45d5d",
    "平静": "#7cb88a",
    "开心": "#e8b44a",
    "疲惫": "#9a8c9e",
}

PLOTLY_LAYOUT = dict(
    paper_bgcolor=BG_COLOR,
    plot_bgcolor=BG_COLOR,
    font=dict(family="PingFang SC, Microsoft YaHei, sans-serif", color=TEXT_COLOR),
    xaxis=dict(gridcolor=GRID_COLOR, linecolor=GRID_COLOR, tickfont=dict(color=TEXT_COLOR)),
    yaxis=dict(gridcolor=GRID_COLOR, linecolor=GRID_COLOR, tickfont=dict(color=TEXT_COLOR)),
    legend=dict(bgcolor=BG_COLOR, bordercolor=GRID_COLOR, borderwidth=1),
    margin=dict(l=60, r=40, t=60, b=60),
)
# 不含 xaxis/yaxis 的基础布局，用于 update_layout 时避免重复关键字
_BASE_LAYOUT = {k: v for k, v in PLOTLY_LAYOUT.items() if k not in ("xaxis", "yaxis")}


async def _get_db():
    from app.database.session import AsyncSessionLocal
    return AsyncSessionLocal()


class _ChartInput(BaseModel):
    chart_type: str = Field(
        description=(
            "图表类型: "
            "emotion_trend（情绪变化折线图）| "
            "assessment_trend（测评分数趋势图）| "
            "body_trend（身体不适程度趋势折线图）"
        )
    )
    days: int = Field(default=30, description="时间范围，默认30天")


class GenerateHealthChartTool(BaseTool):
    """生成心理健康数据的交互式可视化图表（HTML）"""

    name: str = "generate_health_chart"
    description: str = (
        "生成心理健康数据的交互式可视化图表，保存为 HTML 文件，可在浏览器中打开查看。"
        "支持三种类型: "
        "emotion_trend（情绪变化折线图，展示情绪强度随日期变化）、"
        "assessment_trend（测评分数趋势图，展示 PHQ-9/GAD-7 等量表分数随时间变化）、"
        "body_trend（身体不适程度趋势折线图，展示各部位不适程度随日期变化）。"
        "返回 HTML 文件的相对路径，用户可从工作区下载或在浏览器中打开。"
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
            "body_trend": self._body_trend,
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

    def _save_html(self, fig, name: str) -> str:
        charts_dir = self._get_output_dir()
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{name}_{ts}.html"
        filepath = charts_dir / filename
        fig.write_html(
            str(filepath),
            include_plotlyjs="cdn",
            full_html=True,
            config={"displaylogo": False, "modeBarButtonsToRemove": ["lasso2d", "select2d"]},
        )
        return f"outputs/charts/{filename}"

    # ── 情绪趋势折线图 ──

    async def _emotion_trend(self, days: int) -> str:
        import plotly.graph_objects as go

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

        emotions_data: dict[str, dict] = {}
        for r in sorted(records, key=lambda x: x.created_at):
            emo = r.emotion or "未知"
            if emo not in emotions_data:
                emotions_data[emo] = {"dates": [], "levels": [], "notes": []}
            emotions_data[emo]["dates"].append(r.created_at)
            emotions_data[emo]["levels"].append(r.emotion_level or 5)
            emotions_data[emo]["notes"].append(r.notes or "")

        fig = go.Figure()
        for i, (emo, data) in enumerate(emotions_data.items()):
            color = EMOTION_COLORS.get(emo, WARM_COLORS[i % len(WARM_COLORS)])
            hover = [
                f"<b>{emo}</b><br>日期: {d.strftime('%Y-%m-%d %H:%M')}<br>强度: {lv}/10"
                + (f"<br>备注: {n}" if n else "")
                for d, lv, n in zip(data["dates"], data["levels"], data["notes"])
            ]
            fig.add_trace(go.Scatter(
                x=data["dates"], y=data["levels"],
                mode="lines+markers", name=emo,
                line=dict(color=color, width=2.5),
                marker=dict(size=8, color=color, symbol="circle"),
                hovertemplate="%{customdata}<extra></extra>",
                customdata=hover,
            ))

        fig.update_layout(
            **_BASE_LAYOUT,
            title=dict(text=f"最近 {days} 天情绪变化趋势", font=dict(size=16, color=TEXT_COLOR)),
            xaxis=dict(**PLOTLY_LAYOUT["xaxis"], title="日期", tickformat="%m/%d"),
            yaxis=dict(**PLOTLY_LAYOUT["yaxis"], title="情绪强度", range=[0, 11],
                       tickvals=list(range(0, 12))),
            hovermode="closest",
        )

        rel_path = self._save_html(fig, "emotion_trend")
        return f"情绪趋势图已生成: {rel_path}"

    # ── 测评分数趋势图 ──

    async def _assessment_trend(self, days: int) -> str:
        import plotly.graph_objects as go

        from app.crud.health import assessment_crud
        db = await _get_db()
        try:
            records = await assessment_crud.get_by_user(db, self.current_user_id, limit=100)
        finally:
            await db.close()

        since = datetime.utcnow() - timedelta(days=days)
        records = [r for r in records
                   if r.created_at >= since
                   and (r.result_type or "severity") == "severity"]

        if not records:
            return f"最近 {days} 天没有分数型测评记录（PHQ-9、GAD-7 等），无法生成趋势图。"

        scales_data: dict[str, dict] = {}
        for r in sorted(records, key=lambda x: x.created_at):
            st = r.scale_type
            if st not in scales_data:
                scales_data[st] = {"dates": [], "scores": [], "severities": []}
            scales_data[st]["dates"].append(r.created_at)
            scales_data[st]["scores"].append(r.total_score)
            scales_data[st]["severities"].append(r.severity)

        fig = go.Figure()
        for i, (scale, data) in enumerate(scales_data.items()):
            color = WARM_COLORS[i % len(WARM_COLORS)]
            hover = [
                f"<b>{scale}</b><br>日期: {d.strftime('%Y-%m-%d')}<br>分数: {s}<br>程度: {sev}"
                for d, s, sev in zip(data["dates"], data["scores"], data["severities"])
            ]
            fig.add_trace(go.Scatter(
                x=data["dates"], y=data["scores"],
                mode="lines+markers+text", name=scale,
                line=dict(color=color, width=2.5),
                marker=dict(size=9, color=color, symbol="square"),
                text=data["severities"],
                textposition="top center",
                textfont=dict(size=10, color=color),
                hovertemplate="%{customdata}<extra></extra>",
                customdata=hover,
            ))

        fig.update_layout(
            **_BASE_LAYOUT,
            title=dict(text=f"最近 {days} 天测评分数趋势", font=dict(size=16, color=TEXT_COLOR)),
            xaxis=dict(**PLOTLY_LAYOUT["xaxis"], title="日期", tickformat="%m/%d"),
            yaxis=dict(**PLOTLY_LAYOUT["yaxis"], title="分数"),
            hovermode="x unified",
        )

        rel_path = self._save_html(fig, "assessment_trend")
        return f"测评分数趋势图已生成: {rel_path}"

    # ── 身体不适程度趋势折线图 ──

    async def _body_trend(self, days: int) -> str:
        import plotly.graph_objects as go

        from app.crud.health import health_record_crud
        db = await _get_db()
        try:
            records = await health_record_crud.get_by_user(
                db, self.current_user_id, record_type="body", days=days, limit=500
            )
        finally:
            await db.close()

        if not records:
            return f"最近 {days} 天没有身体不适记录，无法生成趋势图。请先记录一些身体不适数据。"

        parts_data: dict[str, dict] = {}
        for r in sorted(records, key=lambda x: x.created_at):
            part = r.body_part or "未指定"
            if part not in parts_data:
                parts_data[part] = {"dates": [], "levels": [], "notes": []}
            parts_data[part]["dates"].append(r.created_at)
            parts_data[part]["levels"].append(r.discomfort_level or 5)
            parts_data[part]["notes"].append(r.notes or "")

        fig = go.Figure()
        for i, (part, data) in enumerate(parts_data.items()):
            color = WARM_COLORS[i % len(WARM_COLORS)]
            hover = [
                f"<b>{part}</b><br>日期: {d.strftime('%Y-%m-%d %H:%M')}<br>不适程度: {lv}/10"
                + (f"<br>备注: {n}" if n else "")
                for d, lv, n in zip(data["dates"], data["levels"], data["notes"])
            ]
            fig.add_trace(go.Scatter(
                x=data["dates"], y=data["levels"],
                mode="lines+markers", name=part,
                line=dict(color=color, width=2.5),
                marker=dict(size=8, color=color, symbol="diamond"),
                hovertemplate="%{customdata}<extra></extra>",
                customdata=hover,
            ))

        fig.update_layout(
            **_BASE_LAYOUT,
            title=dict(text=f"最近 {days} 天身体不适程度趋势", font=dict(size=16, color=TEXT_COLOR)),
            xaxis=dict(**PLOTLY_LAYOUT["xaxis"], title="日期", tickformat="%m/%d"),
            yaxis=dict(**PLOTLY_LAYOUT["yaxis"], title="不适程度", range=[0, 11],
                       tickvals=list(range(0, 12))),
            hovermode="closest",
        )

        rel_path = self._save_html(fig, "body_trend")
        return f"身体不适趋势图已生成: {rel_path}"
