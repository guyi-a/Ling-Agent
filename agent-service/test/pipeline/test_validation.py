"""ValidateAttachmentsStage 单测 —— 纯校验逻辑，不依赖 DB。"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.agent.pipeline.context import PipelineContext
from app.agent.pipeline.stages import ValidateAttachmentsStage


def _make_ctx(attachments) -> PipelineContext:
    return PipelineContext(
        db=None,  # type: ignore[arg-type]
        user=None,  # type: ignore[arg-type]
        message="hi",
        attachments=attachments,
    )


@pytest.mark.asyncio
async def test_none_attachments_is_ok():
    stage = ValidateAttachmentsStage()
    await stage.apply(_make_ctx(None))  # 不抛 = 通过


@pytest.mark.asyncio
async def test_empty_list_is_ok():
    stage = ValidateAttachmentsStage()
    await stage.apply(_make_ctx([]))


@pytest.mark.asyncio
async def test_valid_image_passes():
    stage = ValidateAttachmentsStage()
    await stage.apply(_make_ctx([
        {"type": "image", "path": "uploads/a.png"},
    ]))


@pytest.mark.asyncio
async def test_invalid_type_rejected():
    stage = ValidateAttachmentsStage()
    with pytest.raises(HTTPException) as exc:
        await stage.apply(_make_ctx([
            {"type": "video", "path": "uploads/a.mp4"},
        ]))
    assert exc.value.status_code == 400
    assert "Invalid attachment type" in exc.value.detail


@pytest.mark.asyncio
async def test_path_traversal_rejected():
    stage = ValidateAttachmentsStage()
    with pytest.raises(HTTPException) as exc:
        await stage.apply(_make_ctx([
            {"type": "image", "path": "../../etc/passwd"},
        ]))
    assert exc.value.status_code == 400
    assert "traversal" in exc.value.detail


@pytest.mark.asyncio
async def test_absolute_path_rejected():
    stage = ValidateAttachmentsStage()
    with pytest.raises(HTTPException) as exc:
        await stage.apply(_make_ctx([
            {"type": "image", "path": "/tmp/secret"},
        ]))
    assert exc.value.status_code == 400
