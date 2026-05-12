"""流式 chat 请求的 Stage 顺序。

顺序约定：
1. ValidateAttachments — 纯校验，早挂早知道
2. ResolveSession     — 查/建会话，填 ctx.session
3. PersistUserMessage — 写用户消息，填 ctx.user_message
4. LoadHistory        — 读历史，填 ctx.history
5. StartAgent         — 拉起 SSE buffer + 后台 task，填 ctx.buffer
"""
from app.agent.pipeline.stages.agent import StartAgentStage
from app.agent.pipeline.stages.history import LoadHistoryStage
from app.agent.pipeline.stages.persistence import PersistUserMessageStage
from app.agent.pipeline.stages.session import ResolveSessionStage
from app.agent.pipeline.stages.validation import ValidateAttachmentsStage

STREAM_PIPELINE = [
    ValidateAttachmentsStage(),
    ResolveSessionStage(),
    PersistUserMessageStage(),
    LoadHistoryStage(),
    StartAgentStage(),
]

# 非流式 chat 不需要 StartAgentStage，共用前 4 个 Stage
PREPARE_PIPELINE = STREAM_PIPELINE[:-1]

__all__ = [
    "STREAM_PIPELINE",
    "PREPARE_PIPELINE",
    "ValidateAttachmentsStage",
    "ResolveSessionStage",
    "PersistUserMessageStage",
    "LoadHistoryStage",
    "StartAgentStage",
]
