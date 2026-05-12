"""附件合法性校验。"""
from __future__ import annotations

from fastapi import HTTPException, status

from app.agent.pipeline.context import PipelineContext


class ValidateAttachmentsStage:
    """校验附件类型 + 阻止路径穿越。纯函数式校验，不改 ctx。"""

    name = "validate_attachments"

    async def apply(self, ctx: PipelineContext) -> None:
        attachments = ctx.attachments
        if not attachments:
            return

        for att in attachments:
            att_type = att.get("type")
            att_path = att.get("path", "")

            if att_type not in ("image", "file"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid attachment type: {att_type}",
                )
            if ".." in att_path or att_path.startswith("/"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid attachment path: path traversal detected",
                )
