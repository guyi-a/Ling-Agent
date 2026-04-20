import logging
from typing import List, Optional
from langchain_openai import ChatOpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)

SUMMARY_PROMPT = """请将以下对话压缩为一份结构化摘要，供 AI 助手在后续对话中参考。

要求输出以下 4 个章节：

## 用户意图
列出用户的所有请求，最新一条原文引用。

## 已完成工作
- 操作过的文件（路径 + 做了什么）
- 执行过的命令和结果
- 遇到的错误和修复方式

## 待办事项
标记哪些已完成、哪些还没做。

## 关键信息
文件路径、函数名、端口号、API 地址等后续可能用到的细节。

规则：
- 不超过 1500 tokens
- 不要编造对话中没有的内容
- 省略大段工具输出，只保留结论
- 用中文输出"""

PRIOR_SUMMARY_INSTRUCTION = """
以下是之前对话的摘要，请将其与本次新对话内容合并，生成一份完整的新摘要：

<prior-summary>
{prior_summary}
</prior-summary>

请合并上述摘要和下方对话中的新信息，输出一份完整的结构化摘要。"""


def _get_compact_llm() -> ChatOpenAI:
    return ChatOpenAI(
        temperature=0,
        max_tokens=settings.COMPACT_SUMMARY_MAX_TOKENS,
        timeout=30,
        max_retries=1,
        base_url=settings.LLM_BASE_URL,
        api_key=settings.DASHSCOPE_API_KEY,
        model=settings.COMPACT_MODEL,
    )


def _format_messages_for_summary(messages: List[dict]) -> str:
    """将消息列表格式化为纯文本，供摘要 LLM 阅读。"""
    lines = []
    for msg in messages:
        role = msg.get("role", "unknown")
        content = msg.get("content", "")

        if role == "assistant" and msg.get("tool_calls"):
            tool_names = [tc.get("function", {}).get("name", tc.get("name", "unknown"))
                          for tc in msg["tool_calls"]]
            lines.append(f"[Assistant] 调用工具: {', '.join(tool_names)}")
            if content:
                lines.append(f"[Assistant] {content}")
        elif role == "tool":
            tool_name = msg.get("name", "unknown")
            # 工具输出截断到 500 字符
            truncated = content[:500] + "..." if len(content) > 500 else content
            lines.append(f"[Tool:{tool_name}] {truncated}")
        elif role == "system":
            if "<compacted-summary" in content:
                continue
            lines.append(f"[System] {content}")
        else:
            lines.append(f"[{role.capitalize()}] {content}")

    return "\n".join(lines)


async def generate_summary(
    messages: List[dict],
    prior_summary: Optional[str] = None,
) -> str:
    llm = _get_compact_llm()

    conversation_text = _format_messages_for_summary(messages)

    system_content = SUMMARY_PROMPT
    if prior_summary:
        system_content += PRIOR_SUMMARY_INSTRUCTION.format(prior_summary=prior_summary)

    llm_messages = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": f"以下是需要压缩的对话内容：\n\n{conversation_text}"},
    ]

    response = await llm.ainvoke(llm_messages)
    summary = response.content

    logger.info(f"📝 摘要生成完成 ({len(summary)} 字符)")
    return summary
