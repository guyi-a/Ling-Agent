"""
工具注册表 - 实例化并管理所有 LangChain 工具

约定：
  每个工具文件（*_tool.py）暴露 BaseTool 子类。
  registry 统一实例化，供 AgentService 使用。

session_id 注入：
  文件工具持有 current_session_id 属性，
  AgentService.process_message 调用前通过 set_session_id() 注入。

工具分组：
  get_all_tools()       — 全量（兼容单 Agent 模式）
  get_general_tools()   — 通用助手：文件 + shell + python + web + font + mcp + skill
  get_developer_tools() — 开发者：文件 + shell + python + browser + dev + web_fetch
  get_psych_tools()     — 心理健康：health + memory + rag + web_search
  get_data_tools()      — 数据分析：文件 + python + font
  get_document_tools()  — 文档处理：文件 + shell + python + font
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
from app.agent.mcp.client import get_mcp_tools

logger = logging.getLogger(__name__)

# ── 工具单例 ──────────────────────────────────────────────

# 文件工具（需要注入 session_id）
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
_install_font_tool = InstallNotoSansSCTool()
_web_fetch_tool = WebFetchTool()
_web_search_tool = WebSearchTool()


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


# ── 工具组合（共享单例引用） ──────────────────────────────

def _file_tools() -> List[BaseTool]:
    return [_read_file_tool, _write_file_tool, _edit_file_tool, _list_dir_tool]


def _health_tools() -> List[BaseTool]:
    return [
        _get_scale_questions_tool, _get_health_records_tool,
        _get_assessment_history_tool, _save_health_record_tool,
        _submit_assessment_tool, _generate_health_chart_tool,
    ]


def _memory_tools() -> List[BaseTool]:
    return [_save_memory_tool, _delete_memory_tool]


def _dev_tools() -> List[BaseTool]:
    return [_dev_run_tool, _dev_stop_tool, _dev_restart_tool, _dev_logs_tool]


def _browser_tools() -> List[BaseTool]:
    return [_install_browser_use_tool, _browser_use_tool]


def _rag_tools() -> List[BaseTool]:
    from app.agent.rag.store import is_ready as rag_is_ready
    if rag_is_ready():
        return [_search_knowledge_tool]
    return []


# ── 按子 Agent 分组的工具获取函数 ──────────────────────────

def get_general_tools() -> List[BaseTool]:
    """通用助手：文件 + shell + python + web + font + memory + mcp + skill"""
    tools: List[BaseTool] = [
        *_file_tools(),
        _shell_tool, _python_repl_tool,
        _web_fetch_tool, _web_search_tool,
        _install_font_tool,
        *_memory_tools(),
    ]
    tools.extend(get_mcp_tools())
    skill_tool = create_skill_tool()
    if skill_tool:
        tools.append(skill_tool)
    return tools


def get_developer_tools() -> List[BaseTool]:
    """开发者：文件 + shell + python + browser + dev + web_fetch + skill"""
    tools: List[BaseTool] = [
        *_file_tools(),
        _shell_tool, _python_repl_tool,
        *_browser_tools(),
        *_dev_tools(),
        _web_fetch_tool,
    ]
    skill_tool = create_skill_tool()
    if skill_tool:
        tools.append(skill_tool)
    return tools


def get_psych_tools() -> List[BaseTool]:
    """心理健康：health + memory + rag + web_search"""
    tools: List[BaseTool] = [
        *_health_tools(),
        *_memory_tools(),
        _web_search_tool,
    ]
    tools.extend(_rag_tools())
    return tools


def get_data_tools() -> List[BaseTool]:
    """数据分析：文件 + python + font + skill"""
    tools: List[BaseTool] = [
        *_file_tools(),
        _python_repl_tool,
        _install_font_tool,
    ]
    skill_tool = create_skill_tool()
    if skill_tool:
        tools.append(skill_tool)
    return tools


def get_document_tools() -> List[BaseTool]:
    """文档处理：文件 + shell + python + font + skill"""
    tools: List[BaseTool] = [
        *_file_tools(),
        _shell_tool, _python_repl_tool,
        _install_font_tool,
    ]
    skill_tool = create_skill_tool()
    if skill_tool:
        tools.append(skill_tool)
    return tools


# ── 全量工具（兼容单 Agent 模式） ──────────────────────────

def get_all_tools() -> List[BaseTool]:
    """
    返回所有可用工具列表（单 Agent 模式使用）。
    """
    tools: List[BaseTool] = [
        *_file_tools(),
        _shell_tool, _python_repl_tool,
        *_browser_tools(),
        _install_font_tool,
        _web_fetch_tool, _web_search_tool,
        *_dev_tools(),
        *_health_tools(),
        *_memory_tools(),
    ]

    tools.extend(_rag_tools())

    skill_tool = create_skill_tool()
    if skill_tool:
        tools.append(skill_tool)

    tools.extend(get_mcp_tools())

    logger.info(f"Tools registered: {[t.name for t in tools]}")
    return tools
