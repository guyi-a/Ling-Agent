"""
工具注册表 - 实例化并管理所有 LangChain 工具

约定：
  每个工具文件（*_tool.py）暴露 BaseTool 子类。
  registry 统一实例化，供 AgentService 使用。

session_id 注入：
  文件工具持有 current_session_id 属性，
  AgentService.process_message 调用前通过 set_session_id() 注入。
"""
import logging
from typing import List

from langchain.tools import BaseTool

from app.agent.tools.file_tool import ReadFileTool, WriteFileTool, ListDirTool
from app.agent.tools.web_tool import WebFetchTool, WebSearchTool
from app.agent.tools.skill_tool import create_skill_tool

logger = logging.getLogger(__name__)

# 文件工具单例（需要注入 session_id）
_read_file_tool = ReadFileTool()
_write_file_tool = WriteFileTool()
_list_dir_tool = ListDirTool()


def set_session_id(session_id: str) -> None:
    """在每次对话前注入 session_id 到文件工具"""
    _read_file_tool.current_session_id = session_id
    _write_file_tool.current_session_id = session_id
    _list_dir_tool.current_session_id = session_id


def get_all_tools() -> List[BaseTool]:
    """
    返回所有可用工具列表。

    工具分组：
      - 文件工具：read_file, write_file, list_dir
      - Web 工具：web_fetch, web_search
      - Skills 工具：Skill（按需加载 SKILL.md 指令）
    """
    tools: List[BaseTool] = [
        _read_file_tool,
        _write_file_tool,
        _list_dir_tool,
        WebFetchTool(),
        WebSearchTool(),
    ]

    skill_tool = create_skill_tool()
    if skill_tool:
        tools.append(skill_tool)

    logger.info(f"🔧 Tools registered: {[t.name for t in tools]}")
    return tools
