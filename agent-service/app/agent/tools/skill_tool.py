"""
SkillTool - 兼容 agentskills.io 开放标准的 Skills 机制

运作机制：
  1. Discovery: 扫描 skills 目录，读取每个 SKILL.md 的 frontmatter（~100 tokens/个）
  2. Routing:   LLM 基于用户消息语义决定是否调用此工具
  3. Execution: 工具执行时返回完整 SKILL.md body，注入到 LLM 上下文中
"""
import logging
from pathlib import Path
from typing import Optional, List, Dict, Type

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# 默认 skills 根目录
_DEFAULT_SKILLS_ROOT = Path(__file__).parent.parent / "skills"


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """解析 SKILL.md 的 YAML frontmatter，返回 (meta_dict, body)"""
    meta: dict = {}
    body = text

    if text.startswith("---"):
        end = text.find("---", 3)
        if end != -1:
            fm_block = text[3:end].strip()
            body = text[end + 3:].strip()
            for line in fm_block.splitlines():
                if ":" in line:
                    k, _, v = line.partition(":")
                    meta[k.strip()] = v.strip().strip('"').strip("'")

    return meta, body


class SkillInfo(BaseModel):
    name: str
    description: str
    skill_dir: str
    disable_model_invocation: bool = False
    user_invocable: bool = True


def discover_skills(search_paths: List[Path] = None) -> List[SkillInfo]:
    """扫描 skills 目录，构建 skill catalog（只读 frontmatter）"""
    if search_paths is None:
        search_paths = [_DEFAULT_SKILLS_ROOT]

    skills: Dict[str, SkillInfo] = {}

    for base_path in search_paths:
        if not base_path.exists():
            continue

        for skill_md in sorted(base_path.glob("*/SKILL.md")):
            skill_dir = skill_md.parent
            dir_name = skill_dir.name

            try:
                content = skill_md.read_text(encoding="utf-8")
                meta, body = _parse_frontmatter(content)

                name = meta.get("name", dir_name).lower()
                description = meta.get("description", "")

                if not description:
                    first_para = next(
                        (line.strip() for line in body.splitlines()
                         if line.strip() and not line.startswith("#")),
                        ""
                    )
                    description = first_para[:250]

                disable_model = meta.get("disable-model-invocation", "false").lower() == "true"
                user_invocable = meta.get("user-invocable", "true").lower() != "false"

                if name not in skills:
                    skills[name] = SkillInfo(
                        name=name,
                        description=description,
                        skill_dir=str(skill_dir),
                        disable_model_invocation=disable_model,
                        user_invocable=user_invocable,
                    )
                    logger.debug(f"✓ Discovered skill: {name}")

            except Exception as e:
                logger.warning(f"解析 skill 失败 [{skill_md}]: {e}")

    result = list(skills.values())
    if result:
        logger.info(f"📚 Skills discovered: {[s.name for s in result]}")
    return result


def _load_skill_body(skill_info: SkillInfo, arguments: str = "") -> str:
    """加载完整 SKILL.md body，处理 $ARGUMENTS 替换"""
    skill_md = Path(skill_info.skill_dir) / "SKILL.md"
    content = skill_md.read_text(encoding="utf-8")
    _, body = _parse_frontmatter(content)

    if arguments:
        body = body.replace("$ARGUMENTS", arguments)
        parts = arguments.split()
        for i, part in enumerate(parts):
            body = body.replace(f"$ARGUMENTS[{i}]", part)
            body = body.replace(f"${i}", part)

    return f"Base Path: {skill_info.skill_dir}\n\n{body}"


class _SkillInput(BaseModel):
    command: str = Field(description="The skill name to invoke. E.g. 'pdf' or 'data-analysis'")
    arguments: str = Field(default="", description="Optional arguments to pass to the skill")


class SkillTool(BaseTool):
    """
    Skills 工具 —— 复刻 Claude Code 的 Skill 工具机制

    description 中内嵌 <available_skills> catalog，LLM 通过语义匹配
    决定是否调用此工具；调用时返回对应 SKILL.md body 注入上下文。
    """
    name: str = "Skill"
    description: str = ""
    args_schema: Type[BaseModel] = _SkillInput
    _skill_catalog: Dict[str, SkillInfo] = {}

    def __init__(self, skills: List[SkillInfo], **kwargs):
        catalog = {s.name: s for s in skills}

        available = [s for s in skills if not s.disable_model_invocation]
        available_xml = "\n".join(
            f"  <skill>\n    <name>{s.name}</name>\n    <description>{s.description[:250]}</description>\n  </skill>"
            for s in available
        )

        description = (
            "Execute a skill within the main conversation. "
            "When users ask you to perform tasks, check if any available skills can help.\n\n"
            "<skills_instructions>\n"
            "- Invoke skills using this tool with the skill name as `command`\n"
            "- The skill's instructions will expand into the context\n"
            "- Only use skills listed in <available_skills> below\n"
            "</skills_instructions>\n\n"
            f"<available_skills>\n{available_xml}\n</available_skills>"
        )

        super().__init__(description=description, **kwargs)
        object.__setattr__(self, '_skill_catalog', catalog)

    def _run(self, command: str, arguments: str = "") -> str:
        skill = self._skill_catalog.get(command.lower())
        if not skill:
            return f"Skill '{command}' not found. Available: {list(self._skill_catalog.keys())}"

        try:
            body = _load_skill_body(skill, arguments)
            logger.info(f"🎯 Skill invoked: {command}")
            return body
        except Exception as e:
            logger.error(f"加载 skill [{command}] 失败: {e}")
            return f"Failed to load skill '{command}': {e}"

    async def _arun(self, command: str, arguments: str = "") -> str:
        return self._run(command, arguments)


def create_skill_tool(extra_paths: List[str] = None) -> Optional[SkillTool]:
    """创建 SkillTool 实例，若未发现任何 skill 则返回 None"""
    search_paths = [_DEFAULT_SKILLS_ROOT]
    if extra_paths:
        search_paths.extend(Path(p) for p in extra_paths)

    skills = discover_skills(search_paths)
    if not skills:
        logger.info("ℹ️  未发现任何 Skills，跳过 SkillTool 创建")
        return None

    return SkillTool(skills=skills)
