"""
项目物化工具 — Agent 在需要创建文件/运行进程时调用

调用后：
  1. 在数据库中将当前 project 标记为已物化（设置 slug + title）
  2. 创建 WORKSPACE_ROOT/{slug}/ 工作目录
  3. 后续文件操作和 dev 进程将使用此目录
"""
import re
import logging
from pathlib import Path
from typing import Type, Optional

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from app.core.config import settings
from app.agent.tools._ctx import get_session_id

logger = logging.getLogger(__name__)

_SLUG_PATTERN = re.compile(r'^[a-z0-9][a-z0-9\-]*[a-z0-9]$|^[a-z0-9]$')


class _MaterializeInput(BaseModel):
    title: str = Field(description="项目名称，如「天气应用」「个人记账」")
    slug: str = Field(
        description="项目目录名（英文小写+数字+连字符），如 weather-app、personal-ledger"
    )
    description: Optional[str] = Field(default=None, description="项目简要描述")
    icon: Optional[str] = Field(default=None, description="项目图标 emoji，如 🌤️")


class MaterializeProjectTool(BaseTool):
    """物化项目：创建工作区目录，此后文件操作在此目录中进行"""

    name: str = "materialize_project"
    description: str = (
        "在写入文件或启动 dev 进程之前，必须先调用此工具创建项目工作区。"
        "传入项目名称和 slug（目录名）。"
        "如果项目已经物化则无需再次调用。"
    )
    args_schema: Type[BaseModel] = _MaterializeInput
    current_session_id: Optional[str] = None

    def _run(self, **kwargs) -> str:
        try:
            return self._execute(**kwargs)
        except Exception as e:
            return f"Error: {e}"

    async def _arun(self, **kwargs) -> str:
        return self._run(**kwargs)

    def _execute(
        self,
        title: str,
        slug: str,
        description: Optional[str] = None,
        icon: Optional[str] = None,
    ) -> str:
        if not get_session_id():
            return "Error: session_id not set"

        if not slug or not _SLUG_PATTERN.match(slug):
            return (
                "Error: invalid slug. 请使用小写字母、数字和连字符，"
                "如 'my-app'、'todo-list'。"
            )

        # project_dir 在获取 project_id 后确定，此处先做基本检查

        # 物化数据库记录（同步调用 - 在 agent 运行循环中）
        from app.database.session import sync_session_factory
        from app.models.session import Session
        from app.models.project import Project
        from sqlalchemy import select, update
        from datetime import datetime

        with sync_session_factory() as db:
            result = db.execute(
                select(Session).where(Session.session_id == get_session_id())
            )
            session = result.scalars().first()
            if not session or not session.project_id:
                return "Error: 当前会话未关联项目"

            # 检查是否已物化
            proj_result = db.execute(
                select(Project).where(Project.id == session.project_id)
            )
            project = proj_result.scalars().first()
            if not project:
                return "Error: 项目记录不存在"

            if project.slug is not None:
                dir_name = f"{project.id}_{project.slug}"
                return f"项目已物化，工作区: {Path(settings.WORKSPACE_ROOT) / dir_name}"

            # 更新项目
            db.execute(
                update(Project)
                .where(Project.id == project.id)
                .values(
                    title=title,
                    slug=slug,
                    description=description,
                    icon=icon,
                    updated_at=datetime.utcnow(),
                )
            )
            db.commit()

            dir_name = f"{project.id}_{slug}"

        # 创建工作目录
        project_dir = Path(settings.WORKSPACE_ROOT) / dir_name
        project_dir.mkdir(parents=True)
        (project_dir / "uploads").mkdir(exist_ok=True)

        logger.info(f"Project materialized: '{title}' at {project_dir}")
        return f"项目「{title}」已创建，工作区: {project_dir}"
