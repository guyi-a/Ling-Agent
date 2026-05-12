"""显式 Pipeline 架构：把 chat 请求处理拆成一串 Stage。

参考 krow-agent/app/internal/chat_pipeline 的设计理念：
- 路由只负责构造 PipelineContext 和跑 pipeline，业务逻辑全在 Stage 里；
- 所有 Stage 通过 PipelineContext 共享状态，不返回值；
- STREAM_PIPELINE 列表就是请求生命周期的完整视图，改顺序/加步骤只改这里。
"""

from app.agent.pipeline.base import Stage
from app.agent.pipeline.context import PipelineContext

__all__ = ["Stage", "PipelineContext"]
