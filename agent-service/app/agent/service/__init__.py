"""
Agent Service 模块

注意：不在顶层导入 agent_service，避免与 tools.registry 产生循环导入。
使用方应直接 from app.agent.service.agent_service import ...
"""

__all__ = ["AgentService", "get_agent_service"]


def __getattr__(name):
    if name in ("AgentService", "get_agent_service"):
        from .agent_service import AgentService, get_agent_service
        return {"AgentService": AgentService, "get_agent_service": get_agent_service}[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")