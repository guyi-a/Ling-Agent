"""
Project CRUD 操作
"""
import shutil
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from sqlalchemy.orm import selectinload
from typing import Optional, List
from datetime import datetime

from app.models.project import Project
from app.models.session import Session
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.core.config import settings


class ProjectCRUD:

    async def create(
        self,
        db: AsyncSession,
        project_in: ProjectCreate,
        user_id: str
    ) -> Project:
        project = Project(
            user_id=user_id,
            title=project_in.title,
        )
        db.add(project)
        await db.commit()
        await db.refresh(project)
        return project

    async def get_by_id(self, db: AsyncSession, project_id: int) -> Optional[Project]:
        result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        return result.scalars().first()

    async def get_detail(self, db: AsyncSession, project_id: int) -> Optional[Project]:
        result = await db.execute(
            select(Project)
            .options(selectinload(Project.sessions))
            .where(Project.id == project_id)
        )
        return result.scalars().first()

    async def get_materialized_by_user(
        self,
        db: AsyncSession,
        user_id: str,
    ) -> List[dict]:
        """获取用户所有已物化的项目（有 title 的）"""
        result = await db.execute(
            select(
                Project,
                func.count(Session.id).label("session_count"),
                func.max(Session.updated_at).label("last_active_at"),
            )
            .outerjoin(Session, Session.project_id == Project.id)
            .where(Project.user_id == user_id)
            .where(Project.title.is_not(None))
            .group_by(Project.id)
            .order_by(func.max(Session.updated_at).desc())
        )
        rows = result.all()
        return [
            {
                "project": project,
                "session_count": session_count,
                "last_active_at": last_active_at,
            }
            for project, session_count, last_active_at in rows
        ]

    async def get_adhoc_sessions_by_user(
        self,
        db: AsyncSession,
        user_id: str,
    ) -> List[dict]:
        """获取用户所有未物化项目下的会话（临时对话）"""
        result = await db.execute(
            select(Session, Project.id.label("project_id"))
            .join(Project, Session.project_id == Project.id)
            .where(Project.user_id == user_id)
            .where(Project.title.is_(None))
            .where(Session.is_active == True)
            .order_by(Session.updated_at.desc())
        )
        rows = result.all()
        return [
            {
                "session": session,
                "project_id": project_id,
            }
            for session, project_id in rows
        ]

    async def update(
        self,
        db: AsyncSession,
        project_id: int,
        project_update: ProjectUpdate,
    ) -> Optional[Project]:
        update_data = project_update.model_dump(exclude_unset=True)
        update_data["updated_at"] = datetime.utcnow()

        await db.execute(
            update(Project)
            .where(Project.id == project_id)
            .values(**update_data)
        )
        await db.commit()
        return await self.get_by_id(db, project_id)

    async def materialize(
        self,
        db: AsyncSession,
        project_id: int,
        title: str,
        slug: str,
        description: Optional[str] = None,
        icon: Optional[str] = None,
    ) -> Project:
        """物化项目：设置标题/slug，创建工作目录"""
        await db.execute(
            update(Project)
            .where(Project.id == project_id)
            .values(
                title=title,
                slug=slug,
                description=description,
                icon=icon,
                updated_at=datetime.utcnow(),
            )
        )
        await db.commit()

        workspace = Path(settings.WORKSPACE_ROOT) / f"{project_id}_{slug}"
        workspace.mkdir(parents=True, exist_ok=True)
        (workspace / "uploads").mkdir(exist_ok=True)
        (workspace / "outputs").mkdir(exist_ok=True)

        return await self.get_by_id(db, project_id)

    async def delete(self, db: AsyncSession, project_id: int) -> bool:
        """删除项目（级联删除会话 + 工作目录）"""
        project = await self.get_by_id(db, project_id)
        if not project:
            return False

        await db.delete(project)
        await db.commit()

        if project.slug:
            workspace = Path(settings.WORKSPACE_ROOT) / f"{project.id}_{project.slug}"
            if workspace.exists():
                shutil.rmtree(workspace, ignore_errors=True)

        return True


project_crud = ProjectCRUD()
