# Agent Service

Ling-Agent 的后端服务，基于 FastAPI + LangGraph + LangChain，负责认证、会话与消息持久化、SSE 流式聊天、工具调用、人工审批、工作区文件管理、开发进程管理、RAG 检索，以及心理健康相关接口。

## 当前能力

- JWT 认证与用户信息接口
- 会话、消息历史与消息删除
- SSE 流式聊天与断线恢复
- Agent 工具调用与 Human-in-the-Loop 审批
- 工作区文件上传、读取与隔离访问
- 会话级开发进程启动、日志查看、停止、重启
- 预览与代理相关接口
- RAG 知识库加载与检索
- 心理日记、心理测评与量表读取
- Langfuse 可观测性（可选）

## 技术栈

- **FastAPI** - Web 框架
- **LangGraph / LangChain** - Agent 编排与工具调用
- **Pipeline 架构** - 请求处理拆分为独立 Stage（parse / load / build / start / persist）
- **ContextVar 透传** - 中间件自动注入 session_id / user_id，日志自动带会话标识
- **SafeToolset** - 工具异常自动转 ToolException 回传 LLM，不再中断整条请求
- **多 Provider LLM** - DeepSeek / 通义千问 / 智谱（OpenAI 兼容接口，通过 `config/providers.json` 管理）
- **SQLite + SQLAlchemy + Alembic** - 数据存储与迁移；启动时自动 `upgrade head`
- **JSONText TypeDecorator** - `extra_data` 字段 Python 侧自动 JSON 编解码，兼容历史字符串数据
- **StreamBuffer** - 多订阅者 SSE 缓冲 + 断线重连（`/api/chat/{session_id}/resume`）
- **SSE** - 流式输出
- **JWT** - 认证鉴权
- **FAISS** - RAG 向量检索
- **Langfuse** - 可观测性

## 目录结构

```text
agent-service/
├── app/
│   ├── agent/
│   │   ├── agents/          # 子 Agent 注册表
│   │   ├── compaction/      # 长对话压缩
│   │   ├── infra/           # LLM 工厂、Provider 路由、OCR
│   │   ├── mcp/             # MCP 协议客户端
│   │   ├── pipeline/        # 请求处理 Pipeline（5 个 Stage）
│   │   ├── prompts/         # 各 Agent 系统提示词
│   │   ├── rag/             # RAG 向量检索
│   │   ├── skills/          # 13 个专业技能
│   │   ├── service/         # 核心流式服务、StreamBuffer
│   │   └── tools/           # 工具注册表、SafeToolset 包装
│   ├── core/                # 配置、依赖注入、审批、TraceContext 中间件
│   ├── crud/                # 数据库 CRUD
│   ├── database/            # 数据库连接、启动时 Alembic upgrade
│   ├── models/              # SQLAlchemy 模型、JSONText TypeDecorator
│   ├── routers/             # API 路由
│   └── schemas/             # Pydantic 模型
├── config/                  # providers.json（多 Provider 配置）
├── alembic/                 # 数据库迁移
├── data/                    # checkpoint、向量库、memory 等运行数据
├── scripts/
├── test/                    # pipeline / models / trace / safe_toolset 单测
├── workspace/               # 会话隔离工作区
├── main.py                  # 服务入口
├── requirements.txt
└── README.md
```

## 快速开始

### 1. 环境设置

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. 配置环境变量

```bash
cp .env_example .env
```

至少需要配置一个 LLM Provider 的 API Key：

- `DEEPSEEK_API_KEY` — DeepSeek
- `QWEN_API_KEY` — 通义千问
- `ZHIPU_API_KEY` — 智谱

常用配置项：

- `PORT` - 服务端口，默认 `9000`
- `DEBUG` - 是否开启热重载
- `LLM_MODEL` - 默认模型（默认 `deepseek-chat`），详见 `app/core/config.py`
- `LLM_MODEL_ROUTER` / `LLM_MODEL_GENERAL` / ... - 各 Agent 独立模型配置
- `WORKSPACE_ROOT` - 工作区根目录
- `RAG_ENABLED` - 是否启用知识库
- `COMPACT_ENABLED` - 是否启用长对话压缩
- `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` - 可选观测配置

### 3. 启动服务

```bash
uvicorn main:app --host 0.0.0.0 --port 9000 --reload
```

也可以使用：

```bash
python main.py
```

服务默认运行在 `http://localhost:9000`。

## 主要路由

### 基础

- `GET /` - 服务信息
- `GET /health` - 健康检查
- `GET /docs` - OpenAPI 文档

### 认证与用户

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/user/me`

### LLM

- `GET /api/llm/models` - 获取已配置的可用模型列表

### 聊天

- `POST /api/chat/stream` - SSE 流式聊天
- `GET /api/chat/{session_id}/resume` - 恢复流（支持 `subscribe_only=true` 只订阅新事件）
- `POST /api/chat/approve` - 审批工具调用
- `GET /api/chat/{session_id}/history` - 会话历史
- `POST /api/chat/{session_id}/stop` - 停止生成

### 会话与消息

- `GET /api/sessions/...`
- `GET /api/messages/...`
- `DELETE /api/messages/{message_id}`

### 工作区 / Dev / Preview

- `GET|POST /api/workspace/...`
- `GET|POST /api/dev/...`
- `GET /api/preview/...`

### 心理健康

- `POST /api/health/records`
- `GET /api/health/records`
- `GET /api/health/stats`
- `GET /api/health/assessment/scales`
- `GET /api/health/assessment/scales/{scale_type}`
- `POST /api/health/assessment/submit`
- `GET /api/health/assessment/history`

## 数据库迁移

服务启动时会自动执行 `alembic upgrade head`，一般不需要手动操作。

如需生成新迁移：

```bash
alembic revision --autogenerate -m "your migration message"
```

手动 upgrade（仅在启动失败回退时使用）：

```bash
alembic upgrade head
```
