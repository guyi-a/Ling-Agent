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

from app.agent.tools.file_tool import ReadFileTool, WriteFileTool, EditFileTool, ListDirTool
from app.agent.tools.web_tool import WebFetchTool, WebSearchTool
from app.agent.tools.skill_tool import create_skill_tool
from app.agent.tools.shell_tool import ShellTool
from app.agent.tools.python_repl_tool import PythonReplTool
from app.agent.tools.font_tool import InstallNotoSansSCTool
from app.agent.tools.browser_tool import InstallBrowserUseTool, BrowserUseTool
from app.agent.tools.dev_tool import DevRunTool, DevStopTool, DevRestartTool, DevLogsTool
from app.agent.tools.health_tool import GetScaleQuestionsTool, GetHealthRecordsTool, GetAssessmentHistoryTool, SaveHealthRecordTool, SubmitAssessmentTool
from app.agent.tools.chart_tool import GenerateHealthChartTool
from app.agent.tools.memory_tool import SaveMemoryTool, DeleteMemoryTool
from app.agent.tools.rag_tool import SearchKnowledgeTool

logger = logging.getLogger(__name__)

# 文件工具单例（需要注入 session_id）
_read_file_tool = ReadFileTool()
_write_file_tool = WriteFileTool()
_edit_file_tool = EditFileTool()
_list_dir_tool = ListDirTool()
_shell_tool = ShellTool()
_python_repl_tool = PythonReplTool()
_install_browser_use_tool = InstallBrowserUseTool()
_browser_use_tool = BrowserUseTool()
_dev_run_tool = DevRunTool()
_dev_stop_tool = DevStopTool()
_dev_restart_tool = DevRestartTool()
_dev_logs_tool = DevLogsTool()
_get_scale_questions_tool = GetScaleQuestionsTool()
_get_health_records_tool = GetHealthRecordsTool()
_get_assessment_history_tool = GetAssessmentHistoryTool()
_save_health_record_tool = SaveHealthRecordTool()
_submit_assessment_tool = SubmitAssessmentTool()
_generate_health_chart_tool = GenerateHealthChartTool()
_save_memory_tool = SaveMemoryTool()
_delete_memory_tool = DeleteMemoryTool()
_search_knowledge_tool = SearchKnowledgeTool()


def set_session_id(session_id: str) -> None:
    """在每次对话前注入 session_id 到文件工具"""
    _read_file_tool.current_session_id = session_id
    _write_file_tool.current_session_id = session_id
    _edit_file_tool.current_session_id = session_id
    _list_dir_tool.current_session_id = session_id
    _shell_tool.current_session_id = session_id
    _python_repl_tool.current_session_id = session_id
    _generate_health_chart_tool.current_session_id = session_id
    _browser_use_tool.current_session_id = session_id
    _dev_run_tool.current_session_id = session_id
    _dev_stop_tool.current_session_id = session_id
    _dev_restart_tool.current_session_id = session_id
    _dev_logs_tool.current_session_id = session_id


def set_user_id(user_id: str) -> None:
    """在每次对话前注入 user_id 到健康工具和记忆工具"""
    _get_health_records_tool.current_user_id = user_id
    _get_assessment_history_tool.current_user_id = user_id
    _save_health_record_tool.current_user_id = user_id
    _submit_assessment_tool.current_user_id = user_id
    _generate_health_chart_tool.current_user_id = user_id
    _save_memory_tool.current_user_id = user_id
    _delete_memory_tool.current_user_id = user_id


def get_all_tools() -> List[BaseTool]:
    """
    返回所有可用工具列表。

    工具分组：
      - 文件工具：read_file, write_file, list_dir
      - Shell 工具：run_command
      - Python 工具：python_repl
      - 浏览器工具：install_browser_use, browser_use
      - Web 工具：web_fetch, web_search
      - Skills 工具：Skill（按需加载 SKILL.md 指令）
    """
    tools: List[BaseTool] = [
        _read_file_tool,
        _write_file_tool,
        _edit_file_tool,
        _list_dir_tool,
        _shell_tool,
        _python_repl_tool,
        _install_browser_use_tool,
        _browser_use_tool,
        InstallNotoSansSCTool(),
        WebFetchTool(),
        WebSearchTool(),
        _dev_run_tool,
        _dev_stop_tool,
        _dev_restart_tool,
        _dev_logs_tool,
        _get_scale_questions_tool,
        _get_health_records_tool,
        _get_assessment_history_tool,
        _save_health_record_tool,
        _submit_assessment_tool,
        _generate_health_chart_tool,
        _save_memory_tool,
        _delete_memory_tool,
    ]

    # RAG 知识库搜索（仅当索引已加载时注册）
    from app.agent.rag.store import is_ready as rag_is_ready
    if rag_is_ready():
        tools.append(_search_knowledge_tool)

    skill_tool = create_skill_tool()
    if skill_tool:
        tools.append(skill_tool)

    logger.info(f"🔧 Tools registered: {[t.name for t in tools]}")
    return tools
