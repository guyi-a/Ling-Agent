---
name: news-enhance
label: 新闻增强
description: "REQUIRED for news/current events searches. Triggers when query combines NEWS context + time indicators: 新闻、资讯、动态、消息、发生了什么、有什么进展 + (今天、昨天、最新、近24小时、过去X天、本周); news、updates、breaking、what's happening、current events + (today、yesterday、latest、recent、past 24 hours、this week). Does NOT trigger for: tech queries (最新版本、latest version、recent release), documentation (最新文档、latest docs), code/repo queries (recent commits、latest update). Takes precedence over deep-research when news context is clear. Automatically translates to English and adds precise dates. NOT for historical analysis or events older than 1 month (use deep-research instead)."
---

# News Search Guidelines

## Query Construction

**CRITICAL Rules:**
1. Always use **English keywords** in search queries (translate if user asks in Chinese)
2. Always include the **exact date** in format: `Month Day Year` (e.g., March 24 2026) when users mention specific days
3. Keep queries **focused** - use 1-2 core keywords + date (don't overload)

### Translation Examples:

- User: "今天的AI新闻" → Query: `"AI news March 24 2026"` ✅ (simple, focused)
- User: "本周科技动态" → Query: `"tech news March 2026"` ✅ (concise)
- User: "最近OpenAI的消息" → Query: `"OpenAI 2026"` ✅ (specific entity + date)
- User: "SpaceX发射" → Query: `"SpaceX launch 2026"` ✅ (entity + event)
- User: "昨天发生了什么" → Query: `"news March 23 2026"` ✅ (minimal)
- ❌ WRONG: `"GPT-5 Claude 4 AI breakthrough announcement March 24 2026"` (too many keywords)
- ❌ WRONG: `"AI新闻 March 24 2026"` (Chinese keywords)
- ❌ WRONG: `"AI news 2026-03-24"` (use "March 24 2026" format instead)

## Search Parameters

For fresh, accurate news results:

- **backend**:
  - `"bing,yahoo"` (combine both for balanced speed and coverage)
- **timelimit**:
  - `"d"` for today/yesterday (RECOMMENDED for latest news)
  - `"w"` for this week/recent
  - `"m"` for this month
- **search_type**: `"news"`

## AFTER Search: Content Filtering

**Select the freshest content based on BOTH criteria:**

1. **Publication Date** (from `date` field) - when the article was published
2. **Content Recency** - what the article discusses

**Filtering Rules:**
- Check article title and body for **date mentions** - reject if discussing old events
- Prioritize articles with `date` field showing **today or yesterday**
- Reject "recap", "review", "年度总结", "回顾" in titles (indicates old content)
- For duplicate topics, keep only the **most recent publication**

**Example:**
```python
# Good: Recent publication + Recent content
{
  "title": "OpenAI launches GPT-5 today",
  "date": "2026-03-24T08:00:00",
  "body": "OpenAI announced GPT-5 this morning..."
}

# Bad: Recent publication but OLD content
{
  "title": "Looking back at GPT-4's 2024 launch",  # ❌ "Looking back"
  "date": "2026-03-24T08:00:00",
  "body": "Two years ago, GPT-4 revolutionized..."  # ❌ Discusses 2024
}
```

## Output Format

**CRITICAL: Always include source links in your output.**

When presenting news/information to users:

### For Lists:
```
1. **Title of News Article**
   Summary: One-sentence description...
   Source: [Publisher Name](actual_url_here)
   Date: March 24 2026

2. **Another Article**
   Summary: ...
   Source: [Source Name](url)
   Date: March 23 2026
```

### For Reports/Articles:
- Include clickable links in markdown format: `[text](url)`
- Use `url` field from search results (for news) or `href` field (for text)
- Place source links at the end of each paragraph or section
- Never present information without attribution

**Example:**
> OpenAI released GPT-5 today with breakthrough capabilities. The model shows significant improvements in reasoning and coding tasks. [Source: TechCrunch](https://techcrunch.com/...)

## Key Principle

**Date precision matters.** When users mention "today", "yesterday", or specific dates, include the exact date in format `Month Day Year` (e.g., March 24 2026) in your query to filter out old content republished with new dates.
