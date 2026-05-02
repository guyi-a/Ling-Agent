# Ling-Agent

> 基于多 Agent 协作架构的 AI 生产力工具，支持流式对话、智能路由、Human-in-the-Loop 审批、工作区沙箱隔离与心理健康支持

## 核心特性

### 多 Agent 架构

Ling-Agent 采用 `langgraph_supervisor` 构建的多 Agent 协作系统，由一个路由 Agent 和五个专业子 Agent 组成：

| Agent | 模型 | 职责 |
|-------|------|------|
| **supervisor** | glm-4.7 | 分析用户意图，路由到对应子 Agent |
| **general** | glm-4.7 | 文件操作、网络搜索、通用问答、记忆管理 |
| **developer** | glm-4.7 | Web 应用开发、浏览器自动化、Dev 服务器管理 |
| **psych** | glm-4.7 | 心理健康支持、情绪疏导、健康日记、心理测评 |
| **data** | glm-4.7 | CSV/Excel 数据分析、统计图表、数据报告 |
| **document** | glm-4.7 | Markdown→PDF、Word/PDF→PPTX、文档处理 |

每次对话前端会展示 **切换徽章**，实时显示当前由哪个子 Agent 处理请求。

### 对话系统
- **真流式输出** — 基于 SSE 的 token-level 流式响应
- **多模态支持** — 图像 + 文本输入（通过 OCR 识别图片内容）
- **多会话管理** — 会话列表、切换、置顶、历史持久化
- **停止生成** — 实时取消，保存中断记录
- **消息操作** — 复制、删除、重新生成、内联编辑
- **文件附加** — 消息中直接引用工作区文件
- **全局搜索** — 跨会话搜索历史消息

### Skills 系统（12 个专业技能）

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

### 工具集成
- **文件操作** — `read_file`（支持 .docx/.pdf/.pptx）、`write_file`、`edit_file`、`list_dir`
- **代码执行** — `python_repl`（脚本持久化、编辑模式）、`run_command`
- **网络能力** — `web_search`（DuckDuckGo）、`web_fetch`（SSRF 防护）
- **浏览器控制** — `browser_use`、`install_browser_use`
- **健康工具** — `save_health_record`、`get_health_records`、`get_assessment_history`、`get_scale_questions`、`submit_assessment`、`search_psych_knowledge`
- **开发工具** — `dev_run`、`dev_logs`、`dev_stop`、`dev_restart`
- **记忆工具** — `save_memory`、`delete_memory`（跨会话持久化用户信息）
- **系统工具** — `install_noto_sans_sc`、`Skill`（技能加载器）

### 心理健康模块
- **心理日记** — 记录身体不适和情绪状态，支持趋势统计
- **心理测评** — 12 个量表（GAD-7、PHQ-9、SDS、SAS、PSS-10、MBTI、SBTI、CES-D、CSTI、DASS-21、GSES、UCLA），三种计分类型（severity / dimensions / multi_dimension）
- **草稿保存** — 测评中途退出自动保存进度，下次可继续
- **身心关联** — 对话中识别身体症状与心理状态的关联，主动引导记录
- **危机干预** — 检测到严重心理危机时提供热线和资源

### Human-in-the-Loop 审批
- 高危工具需人工审批：`run_command`、`python_repl`、`write_file`
- LangGraph `interrupt` / `resume` 机制
- 前端审批卡片（60 秒超时）

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
- 智谱 GLM API Key（[申请地址](https://open.bigmodel.cn/)）

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
# LLM（必填，智谱 GLM）
LLM_API_KEY=your_zhipu_api_key
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4

# 各 Agent 模型（可按需调整）
LLM_MODEL=glm-4.7                  # 默认模型
LLM_MODEL_ROUTER=glm-4.7           # Supervisor 路由 Agent
LLM_MODEL_DEVELOPER=glm-4.7        # Developer Agent
LLM_MODEL_GENERAL=glm-4.7          # General Agent
LLM_MODEL_PSYCH=glm-4.7             # Psych Agent
LLM_MODEL_DATA=glm-4.7              # Data Agent
LLM_MODEL_DOCUMENT=glm-4.7          # Document Agent

# 数据库
DATABASE_URL=sqlite:///./app.db

# 工作区
WORKSPACE_ROOT=./workspace

# JWT
JWT_SECRET_KEY=your-secret-key-change-in-production
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# 服务
PORT=9000
DEBUG=true
LOG_LEVEL=INFO

# RAG 知识库（可选，使用 DashScope Embedding）
RAG_ENABLED=true
RAG_API_KEY=your_dashscope_api_key
RAG_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
RAG_EMBEDDING_MODEL=text-embedding-v3

# Langfuse 可观测性（可选）
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com
```

## 技术架构

### 后端
- **框架**: FastAPI + LangGraph + LangChain
- **多 Agent**: `langgraph_supervisor` — Supervisor + 5 专业子 Agent
- **LLM**: 智谱 GLM-4.7
- **数据库**: SQLite + SQLAlchemy（异步）+ Alembic 迁移
- **认证**: JWT
- **流式**: SSE (Server-Sent Events)
- **状态管理**: LangGraph Checkpointer (AsyncSqliteSaver，持久化到 `data/checkpoints.db`)
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
│   │   │   ├── data/scales/    # 心理量表数据（GAD-7, PHQ-9, MBTI 等）
│   │   │   ├── infra/          # LLM 工厂、Agent 工厂、Prompt Cache 中间件
│   │   │   ├── prompts/        # 各 Agent 系统提示词（supervisor/general/developer/psych/data/document）
│   │   │   ├── skills/         # 12 个专业技能
│   │   │   ├── service/        # agent_service.py 核心流式服务
│   │   │   └── tools/          # 工具集（文件、代码、网络、健康、开发、记忆）
│   │   ├── core/               # 配置、依赖注入、审批逻辑
│   │   ├── crud/               # 数据库 CRUD
│   │   ├── models/             # SQLAlchemy 模型
│   │   ├── routers/            # API 路由
│   │   └── schemas/            # Pydantic 模型
│   ├── alembic/                # 数据库迁移
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
├── start-dev.sh
└── README.md
```

## 核心 API

| 方法 | 端点 | 说明 |
|------|------|------|
| `POST` | `/api/auth/register` | 用户注册 |
| `POST` | `/api/auth/login` | 登录，返回 JWT |
| `POST` | `/api/chat/stream` | SSE 流式聊天 |
| `POST` | `/api/chat/approve` | 工具审批 |
| `POST` | `/api/chat/{session_id}/stop` | 停止生成 |
| `GET` | `/api/messages/session/{session_id}/history` | 获取历史消息 |
| `DELETE` | `/api/messages/{message_id}` | 删除消息 |
| `GET` | `/api/sessions/` | 会话列表 |
| `PATCH` | `/api/sessions/{session_id}` | 更新会话（标题、置顶） |
| `POST` | `/api/workspace/{session_id}/upload` | 上传文件 |
| `GET` | `/api/workspace/{session_id}/files` | 列出文件 |
| `GET` | `/api/health/scales` | 获取量表列表 |
| `GET` | `/api/health/scales/{name}` | 获取量表题目 |
| `POST` | `/api/health/assessments` | 提交测评 |
| `GET` | `/api/health/assessments` | 测评历史 |
| `POST` | `/api/health/records` | 保存健康日记 |
| `GET` | `/api/health/records` | 获取健康日记 |

## License

MIT License - 详见 [LICENSE](LICENSE)
