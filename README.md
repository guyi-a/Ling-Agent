# 🤖 Ling-Agent

> 功能完整、工程化的 AI Agent 生产力工具，支持流式对话、技能加载、Human-in-the-Loop 审批与工作区沙箱隔离

## ✨ 核心特性

### 对话系统
- **真流式输出** - 基于 SSE 的 token-level 流式响应
- **多模态支持** - qwen-vl-max 模型，图像 + 文本输入
- **多会话管理** - 会话列表、切换、历史持久化
- **停止生成** - 实时取消，保存中断记录
- **消息操作** - 复制、删除、重新生成、内联编辑
- **文件附加** - 消息中直接引用工作区文件

### Skills 系统（9 个专业技能）

| Skill | 功能 |
|-------|------|
| `data-analysis` | 数据分析、可视化图表（matplotlib） |
| `data-cleaning` | 数据清洗与预处理 |
| `news-enhance` | 实时新闻搜索增强 |
| `report-generator` | 数据生成分析报告（PDF / PPTX） |
| `md-pdf-convert` | Markdown 转 PDF |
| `doc-to-pptx` | Word / PDF 转 PPTX |
| `browser-use` | 浏览器自动化（Chrome 控制） |
| `file-organizer` | 智能文件整理（按类型 / 日期 / 项目分类） |
| `pdf-enhance` | PDF 生成质量标准（中文字体、布局规范） |

### 工具集成（10 个工具）
- **文件操作** - `read_file`（支持 .docx/.pdf/.pptx）、`write_file`、`list_dir`
- **代码执行** - `python_repl`（脚本持久化）、`run_command`
- **网络能力** - `web_search`（DuckDuckGo）、`web_fetch`（SSRF 防护）
- **浏览器控制** - `browser_use`、`install_browser_use`
- **系统工具** - `install_noto_sans_sc`、`Skill`（技能加载器）

### Human-in-the-Loop 审批
- 高危工具需人工审批：`run_command`、`python_repl`、`write_file`
- LangGraph `interrupt` / `resume` 机制
- 前端审批卡片（60 秒超时）
- 审批拒绝后自动清理 checkpointer 状态

### 安全机制
- **工作区沙箱** - 文件操作限制在 `workspace/{session_id}/`
- **SSRF 防护** - `web_fetch` 阻止访问内网地址
- **路径验证** - 防止路径遍历攻击
- **JWT 认证** - 会话隔离，防止越权访问
- **超时控制** - Python 执行 60 秒超时

## 🚀 快速开始

### 环境要求
- Python 3.12+
- Node.js 18+
- 通义千问 API Key（[申请地址](https://dashscope.aliyun.com/)）

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-username/Ling-Agent.git
cd Ling-Agent

# 配置环境变量
cp agent-service/.env.example agent-service/.env
# 编辑 .env，填入 DASHSCOPE_API_KEY

# 安装后端依赖
cd agent-service
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..

# 安装前端依赖
cd web && npm install && cd ..
```

### 启动

```bash
# 一键启动（推荐）
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

访问地址：
- **前端**: http://localhost:5174
- **后端 API**: http://localhost:9000
- **API 文档**: http://localhost:9000/docs

## ⚙️ 环境变量

`agent-service/.env`：

```bash
# LLM（必填）
DASHSCOPE_API_KEY=sk-xxx
LLM_MODEL=qwen-vl-max
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

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
```

## 📖 使用示例

**数据分析**
```
上传 sales.csv，帮我分析销售趋势并生成可视化报告
```

**文档转换**
```
将这份 Word 报告转换为 PPTX 演示文稿
```

**代码执行**
```
用 Python 计算斐波那契数列前 20 项并保存到 outputs/fib.txt
```

**图像理解**
```
[粘贴图表截图] 帮我提取这个图表中的数据并转为 CSV
```

**浏览器自动化**
```
打开 GitHub，搜索 LangGraph 并截图首页
```

## 🏗️ 技术架构

### 后端
- **框架**: FastAPI + LangGraph + LangChain
- **LLM**: 通义千问 qwen-vl-max（兼容 OpenAI API）
- **数据库**: SQLite + SQLAlchemy（异步）
- **认证**: JWT
- **流式**: SSE (Server-Sent Events)
- **状态管理**: LangGraph Checkpointer (InMemorySaver)

### 前端
- **框架**: React 19 + TypeScript + Vite + Tailwind CSS
- **状态管理**: Zustand
- **流式处理**: EventSource (SSE)
- **Markdown 渲染**: react-markdown + remark-gfm

## 📂 项目结构

```
Ling-Agent/
├── agent-service/          # FastAPI 后端服务
│   ├── app/
│   │   ├── agent/
│   │   │   ├── infra/      # LLM 工厂、Agent 工厂
│   │   │   ├── prompts/    # core_prompt.md 系统提示词
│   │   │   ├── skills/     # 9 个专业技能
│   │   │   ├── service/    # agent_service.py 核心服务
│   │   │   └── tools/      # 10 个工具
│   │   ├── core/           # 配置、依赖注入、审批逻辑
│   │   ├── crud/           # 数据库 CRUD
│   │   ├── models/         # SQLAlchemy 模型
│   │   ├── routers/        # API 路由
│   │   └── schemas/        # Pydantic 模型
│   ├── workspace/          # 运行时工作区（每个 session 一个目录）
│   ├── main.py
│   └── requirements.txt
├── web/                    # React 前端
│   └── src/
│       ├── api/            # API 客户端
│       ├── components/     # React 组件
│       ├── hooks/          # useSSEChat.ts
│       ├── pages/          # LoginPage / ChatPage / SessionsPage
│       ├── stores/         # Zustand（authStore）
│       └── types/          # TypeScript 类型定义
├── start-dev.sh
└── README.md
```

工作区结构（运行时生成）：
```
workspace/{session_id}/
├── uploads/        # 用户上传文件
└── outputs/
    ├── scripts/    # Python 脚本历史
    ├── *.png       # 生成的图表
    ├── *.pdf       # 生成的报告
    └── *.pptx      # 生成的演示文稿
```

## 📡 核心 API

| 方法 | 端点 | 说明 |
|------|------|------|
| `POST` | `/api/auth/register` | 用户注册 |
| `POST` | `/api/auth/login` | 登录，返回 JWT |
| `POST` | `/api/chat/stream` | SSE 流式聊天 |
| `POST` | `/api/chat/approve` | 工具审批 |
| `POST` | `/api/chat/{session_id}/stop` | 停止生成 |
| `GET` | `/api/messages/session/{session_id}/history` | 获取历史 |
| `DELETE` | `/api/messages/{message_id}` | 删除消息 |
| `GET` | `/api/sessions/` | 会话列表 |
| `POST` | `/api/workspace/{session_id}/upload` | 上传文件 |
| `GET` | `/api/workspace/{session_id}/files` | 列出文件 |

## 🛣️ Roadmap

- [ ] Redis 替代 InMemorySaver（支持多进程 / 分布式）
- [ ] Docker 容器化部署
- [ ] 单元测试与 CI/CD
- [ ] 多 Agent 协作
- [ ] 更多 Skills（代码审查、单元测试生成）
- [ ] 移动端响应式优化

## 🤝 Contributing

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交修改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 📄 License

MIT License - 详见 [LICENSE](LICENSE)

## 🙏 致谢

- [LangChain](https://github.com/langchain-ai/langchain)
- [LangGraph](https://github.com/langchain-ai/langgraph)
- [FastAPI](https://fastapi.tiangolo.com/)
- [通义千问](https://dashscope.aliyun.com/)
