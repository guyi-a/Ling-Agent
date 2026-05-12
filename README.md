# Ling-Agent

> 基于多 Agent 协作架构的 AI 生产力工具，支持多 LLM Provider、流式对话、智能路由、Human-in-the-Loop 审批、工作区沙箱隔离与心理健康支持

## 核心特性

### 多 Agent 架构

Ling-Agent 采用 `langgraph_supervisor` 构建的多 Agent 协作系统，由一个路由 Agent 和五个专业子 Agent 组成：

| Agent | 职责 |
|-------|------|
| **supervisor** | 分析用户意图，路由到对应子 Agent |
| **general** | 文件操作、网络搜索、通用问答、记忆管理、MCP 工具 |
| **developer** | Web 应用开发、浏览器自动化、Dev 服务器管理 |
| **psych** | 心理健康支持、情绪疏导、健康日记、心理测评、RAG 知识库 |
| **data** | CSV/Excel 数据分析、统计图表、数据报告 |
| **document** | Markdown→PDF、Word/PDF→PPTX、文档处理 |

每个 Agent 可独立配置模型（通过环境变量 `LLM_MODEL_*`），支持跨 Provider 混合使用。前端实时显示当前由哪个子 Agent 处理请求。

### 对话系统
- **真流式输出** — 基于 SSE 的 token-level 流式响应
- **多模态支持** — 图像 + 文本输入（通过 OCR 识别图片内容）
- **多会话管理** — 会话列表、切换、置顶、历史持久化
- **停止生成** — 实时取消，保存中断记录
- **消息操作** — 复制、删除、重新生成、内联编辑
- **文件附加** — 消息中直接引用工作区文件
- **全局搜索** — 跨会话搜索历史消息

### Skills 系统（13 个专业技能）

| Skill | 功能 |
|-------|------|
| `data-analysis` | 数据分析、可视化图表 |
| `data-cleaning` | 数据清洗与预处理 |
| `news-enhance` | 实时新闻搜索增强 |
| `report-generator` | 数据生成分析报告（PDF / PPTX） |
| `md-pdf-convert` | Markdown 转 PDF |
| `doc-to-pptx` | Word / PDF 转 PPTX |
| `browser-use` | 浏览器自动化（Chrome 控制） |
| `file-organizer` | 智能文件整理（按类型 / 日期 / 项目分类） |
| `pdf-enhance` | PDF 生成质量标准（中文字体、布局规范） |
| `web-dev` | Web 应用开发（FastAPI + Tailwind + DaisyUI） |
| `frontend-design` | 前端 UI 设计（Tailwind/DaisyUI/Alpine.js） |
| `psych-counseling` | 心理健康支持与评估引导 |
| `psych-interactive` | 心理互动式对话与引导 |

### 工具集成
- **文件操作** — `read_file`（支持 .docx/.pdf/.pptx）、`write_file`、`edit_file`、`list_dir`、`chunked_write`（大文件分块写入）
- **代码执行** — `python_repl`（脚本持久化、编辑模式）、`run_command`（Shell 命令）
- **网络能力** — `web_search`（DuckDuckGo）、`web_fetch`（SSRF 防护）
- **浏览器控制** — `browser_use`、`install_browser_use`
- **健康工具** — `save_health_record`、`get_health_records`、`get_assessment_history`、`get_scale_questions`、`submit_assessment`、`generate_health_chart`
- **开发工具** — `dev_run`、`dev_logs`、`dev_stop`、`dev_restart`、`materialize_project`
- **记忆工具** — `save_memory`、`delete_memory`（跨会话持久化用户信息）
- **RAG 知识库** — `search_knowledge`（基于向量检索的心理学知识库）
- **MCP 工具** — 通过 MCP 协议动态加载外部工具
- **系统工具** — `install_noto_sans_sc`、`Skill`（技能加载器）

### 心理健康模块
- **心理日记** — 记录身体不适和情绪状态，支持趋势统计
- **心理测评** — 12 个量表（GAD-7、PHQ-9、SDS、SAS、PSS-10、MBTI、SBTI、CES-D、CSTI、DASS-21、GSES、UCLA），三种计分类型（severity / dimensions / multi_dimension）
- **草稿保存** — 测评中途退出自动保存进度，下次可继续
- **身心关联** — 对话中识别身体症状与心理状态的关联，主动引导记录
- **危机干预** — 检测到严重心理危机时提供热线和资源

### Human-in-the-Loop 审批
- 高危工具需人工审批：`run_command`、`python_repl`、`write_file`、`edit_file`、`dev_run`
- LangGraph `interrupt` / `resume` 机制
- 前端审批卡片（无超时，等待用户操作）
- 支持用户自定义审批策略（auto / default / custom 模式）
- MCP 工具可动态注册为高风险工具

### Web 应用开发
- 在对话中构建完整 Web 应用（静态页面到全栈应用）
- 前端：Tailwind CSS + DaisyUI + Alpine.js（CDN，无构建步骤）
- 后端：FastAPI + SQLite
- 后台进程管理（`dev_run` / `dev_logs` / `dev_stop`）
- 工作区内 iframe 预览

### 安全机制
- **工作区沙箱** — 文件操作限制在 `workspace/{session_id}/`
- **SSRF 防护** — `web_fetch` 阻止访问内网地址
- **路径验证** — 防止路径遍历攻击
- **JWT 认证** — 会话隔离，防止越权访问
- **超时控制** — Python 执行 60 秒超时

## 快速开始

### 环境要求
- Python 3.12+
- Node.js 18+
- 至少配置一个 LLM Provider 的 API Key：
  - [DeepSeek](https://platform.deepseek.com/)
  - [通义千问](https://dashscope.aliyuncs.com/)
  - [智谱 GLM](https://open.bigmodel.cn/)

### 安装

```bash
git clone https://github.com/guyi-a/Ling-Agent.git
cd Ling-Agent

# 配置环境变量
cp agent-service/.env_example agent-service/.env
# 编辑 .env，填入 LLM_API_KEY

# 安装后端依赖
cd agent-service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..

# 安装前端依赖
cd web && npm install && cd ..
```

<details>
<summary><b>Windows 安装步骤</b></summary>

```powershell
git clone https://github.com/guyi-a/Ling-Agent.git
cd Ling-Agent

# 配置环境变量
copy agent-service\.env_example agent-service\.env
# 编辑 agent-service\.env，填入 LLM_API_KEY

# 安装后端依赖
cd agent-service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cd ..

# 安装前端依赖
cd web
npm install
cd ..
```

</details>

### 启动

```bash
# 一键启动
./start-dev.sh
```

或分别启动：

```bash
# 后端
cd agent-service && source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 9000 --reload

# 前端（另开终端）
cd web && npm run dev
```

<details>
<summary><b>Windows 启动步骤</b></summary>

```powershell
# 一键启动（会打开两个窗口分别运行前后端）
.\start-dev.bat
```

或分别在两个终端中执行：

```powershell
# 终端 1：后端
cd agent-service
venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 9000 --reload

# 终端 2：前端
cd web
npm run dev
```

</details>

访问地址：
- **前端**: http://localhost:5174
- **后端 API**: http://localhost:9000
- **API 文档**: http://localhost:9000/docs

## 环境变量

`agent-service/.env`：

```bash
# LLM Provider API Keys（配置哪个就启用哪个，至少填一个）
# 可用模型列表见 config/providers.json
ZHIPU_API_KEY=your_zhipu_api_key_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here
QWEN_API_KEY=your_qwen_api_key_here

# 各 Agent 模型（可按需调整，支持跨 Provider 混合配置）
LLM_MODEL=deepseek-chat              # 默认模型
LLM_MODEL_ROUTER=deepseek-chat       # Supervisor 路由 Agent
LLM_MODEL_DEVELOPER=deepseek-chat    # Developer Agent
LLM_MODEL_GENERAL=deepseek-chat      # General Agent
LLM_MODEL_PSYCH=deepseek-chat        # Psych Agent
LLM_MODEL_DATA=deepseek-chat         # Data Agent
LLM_MODEL_DOCUMENT=deepseek-chat     # Document Agent

# 数据库
DATABASE_URL=sqlite:///./app.db

# 工作区
WORKSPACE_ROOT=./workspace

# JWT
JWT_SECRET_KEY=your-secret-key-change-in-production
JWT_ALGORITHM=HS256

# 服务
PORT=9000
DEBUG=true
LOG_LEVEL=INFO

# RAG 知识库（可选，使用 DashScope Embedding）
RAG_ENABLED=true
RAG_EMBEDDING_MODEL=text-embedding-v3

# Context Compaction（长对话自动压缩）
COMPACT_ENABLED=true
COMPACT_TOKEN_THRESHOLD=30000
COMPACT_KEEP_TURNS=2

# Langfuse 可观测性（可选）
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com
```

### 可用模型

| Provider | 模型 |
|----------|------|
| **DeepSeek** | `deepseek-chat`、`deepseek-reasoner`、`deepseek-v4-flash`、`deepseek-v4-pro` |
| **通义千问** | `qwen-plus`、`qwen-max`、`qwen3-235b-a22b`、`qwen-turbo` |
| **智谱** | `glm-4-flash`、`glm-4-air`、`glm-4.7`、`glm-5.1`、`glm-4-plus` |

模型列表在 `config/providers.json` 中管理，前端通过 `/api/llm/models` 接口动态获取已配置 API Key 的可用模型。

## 技术架构

### 后端
- **框架**: FastAPI + LangGraph + LangChain
- **请求处理**: Pipeline 架构，5 个独立 Stage 处理 parse / load / build / start / persist
- **上下文追踪**: 中间件注入 `ContextVar`，工具层与日志自动带 session_id / user_id
- **工具健壮性**: SafeToolset 包装所有工具，异常转 ToolException 回传 LLM 而非中断请求
- **流式重连**: StreamBuffer 多订阅 + 历史 replay，支持网页刷新后断线续传
- **多 Agent**: `langgraph_supervisor` — Supervisor + 5 专业子 Agent
- **LLM**: 多 Provider 支持（DeepSeek / 通义千问 / 智谱），通过 `config/providers.json` 管理
- **数据库**: SQLite + SQLAlchemy（异步）+ Alembic 迁移；启动时自动 `upgrade head`
- **JSON 字段**: 自定义 `JSONText` TypeDecorator，ORM 读写自动 JSON 编解码，兼容老字符串数据
- **认证**: JWT（Access Token + Refresh Token）
- **流式**: SSE (Server-Sent Events)
- **状态管理**: LangGraph Checkpointer (AsyncSqliteSaver，持久化到 `data/checkpoints.db`)
- **Context Compaction**: 长对话自动压缩（超过 token 阈值时保留最近轮次 + 摘要）
- **RAG**: 向量检索知识库（DashScope Embedding）
- **MCP**: 通过 MCP 协议动态接入外部工具
- **可观测性**: Langfuse（可选，追踪每次 Agent 调用链路）

### 前端
- **框架**: React 19 + TypeScript + Vite + Tailwind CSS
- **状态管理**: Zustand
- **数据查询**: TanStack Query
- **流式处理**: EventSource (SSE)
- **Markdown 渲染**: react-markdown + remark-gfm

## 项目结构

```
Ling-Agent/
├── agent-service/              # FastAPI 后端服务
│   ├── app/
│   │   ├── agent/
│   │   │   ├── agents/         # 子 Agent 注册表（supervisor + 5 专业 Agent）
│   │   │   ├── compaction/     # 长对话压缩
│   │   │   ├── data/scales/    # 心理量表数据（GAD-7, PHQ-9, MBTI 等）
│   │   │   ├── infra/          # LLM 工厂、Agent 工厂、Provider 路由、OCR
│   │   │   ├── mcp/            # MCP 协议客户端（动态加载外部工具）
│   │   │   ├── pipeline/       # 请求处理 Pipeline（parse / load / build / start / persist）
│   │   │   ├── prompts/        # 各 Agent 系统提示词
│   │   │   ├── rag/            # RAG 向量检索知识库
│   │   │   ├── skills/         # 13 个专业技能
│   │   │   ├── service/        # 核心流式服务、StreamBuffer
│   │   │   └── tools/          # 工具集 + SafeToolset 异常包装
│   │   ├── core/               # 配置、依赖注入、审批、TraceContext 中间件
│   │   ├── crud/               # 数据库 CRUD
│   │   ├── database/           # 数据库连接、启动时 Alembic upgrade
│   │   ├── models/             # SQLAlchemy 模型、JSONText TypeDecorator
│   │   ├── routers/            # API 路由
│   │   └── schemas/            # Pydantic 模型
│   ├── config/                 # providers.json（多 LLM Provider 配置）
│   ├── alembic/                # 数据库迁移
│   ├── test/                   # pipeline / models / trace / safe_toolset 单测
│   ├── workspace/              # 运行时工作区（每个 session 一个目录）
│   └── main.py
├── web/                        # React 前端
│   └── src/
│       ├── api/                # API 客户端
│       ├── components/         # React 组件
│       ├── hooks/              # useSSEChat 等
│       ├── pages/              # 页面
│       │   ├── chat/           # 对话主页
│       │   ├── sessions/       # 会话管理
│       │   ├── assessment/     # 心理测评
│       │   ├── diary/          # 心理日记
│       │   ├── apps/           # 应用管理
│       │   ├── profile/        # 用户资料
│       │   └── settings/       # 设置
│       ├── stores/             # Zustand（auth, theme）
│       └── types/              # TypeScript 类型
├── docs/                       # 技术方案文档
├── start-dev.sh
└── README.md
```

## 核心 API

| 方法 | 端点 | 说明 |
|------|------|------|
| `POST` | `/api/auth/register` | 用户注册 |
| `POST` | `/api/auth/login` | 登录，返回 JWT |
| `POST` | `/api/auth/refresh` | 刷新 Token |
| `POST` | `/api/chat/stream` | SSE 流式聊天 |
| `POST` | `/api/chat/approve` | 工具审批 |
| `POST` | `/api/chat/{session_id}/stop` | 停止生成 |
| `GET` | `/api/messages/session/{session_id}/history` | 获取历史消息 |
| `DELETE` | `/api/messages/{message_id}` | 删除消息 |
| `GET` | `/api/sessions/` | 会话列表 |
| `PATCH` | `/api/sessions/{session_id}` | 更新会话（标题、置顶） |
| `POST` | `/api/workspace/{session_id}/upload` | 上传文件 |
| `GET` | `/api/workspace/{session_id}/files` | 列出文件 |
| `GET` | `/api/llm/models` | 获取可用模型列表 |
| `GET` | `/api/user/me` | 获取当前用户信息 |
| `GET` | `/api/health/scales` | 获取量表列表 |
| `GET` | `/api/health/scales/{name}` | 获取量表题目 |
| `POST` | `/api/health/assessments` | 提交测评 |
| `GET` | `/api/health/assessments` | 测评历史 |
| `POST` | `/api/health/records` | 保存健康日记 |
| `GET` | `/api/health/records` | 获取健康日记 |
| `GET` | `/api/projects/` | 项目列表 |
| `GET` | `/api/dev/{session_id}/preview` | 预览开发中的应用 |

## License

MIT License - 详见 [LICENSE](LICENSE)
