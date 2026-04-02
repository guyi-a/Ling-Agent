# 🤖 Ling-Agent

> 一个功能完整、工程化的 AI Agent 生产力工具 - 支持流式对话、技能加载、工具审批、工作区管理

## ✨ 核心特性

### 🎯 对话系统
- **真流式输出** - 基于 SSE 的 token-level 流式响应
- **多模态支持** - qwen-vl-max 模型，支持图像+文本输入
- **会话管理** - 支持多会话并行，历史记录持久化
- **停止生成** - 实时取消执行，保存中断记录
- **JWT 认证** - 用户认证与会话隔离

### 🛠️ Skills 系统（5 个专业技能）
| Skill | 功能 |
|-------|------|
| `data-analysis` | 数据分析、可视化图表（折线图、柱状图、散点图等） |
| `data-cleaning` | 数据清洗与预处理 |
| `news-enhance` | 实时新闻搜索增强 |
| `report-generator` | 从数据生成分析报告（PDF/PPTX，带图表和洞察） |
| `md-pdf-convert` | Markdown 文件转 PDF |
| `doc-to-pptx` | Word/PDF 转 PPTX |

### 🔧 工具集成
- **文件操作** - read_file、write_file、list_dir（工作区隔离）
- **代码执行** - python_repl（脚本持久化）、run_command
- **网络搜索** - web_search、web_fetch
- **字体管理** - 自动下载 NotoSansSC 中文字体

### 🔐 Human-in-the-Loop
- 高危工具需人工审批（`run_command`、`python_repl`、`write_file`）
- LangGraph checkpointer 实现 interrupt/resume
- 前端审批卡片（60秒超时）

### 📁 工作区管理
```
workspace/{session_id}/
├── uploads/          # 用户上传文件（支持图片、CSV、PDF 等）
│   ├── paste_*.png   # 粘贴的图片
│   ├── data.csv      # 上传的数据
│   └── report.pdf    # 上传的文档
└── outputs/
    ├── scripts/      # Python 脚本历史
    ├── *.csv         # 生成的数据文件
    ├── *.png         # 生成的图表
    ├── *.pdf         # 生成的报告
    └── *.pptx        # 生成的演示文稿
```

**多模态能力：**
- 📸 **图片理解** - 直接"看到"图片内容（OCR、图表识别、场景理解）
- 📎 **文件引用** - 引用工作区文件，Agent 智能读取和处理
- 🔄 **历史记忆** - 对话中的图片和文件引用自动保存

## 🚀 快速开始

### 环境要求
- Python 3.12+
- Node.js (可选，用于前端开发)
- 通义千问 API Key（或兼容 OpenAI 的 LLM）

### 后端安装

```bash
cd agent-service

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 DASHSCOPE_API_KEY
```

### 启动服务

#### 方式一：一键启动（推荐）

```bash
./start-dev.sh
```

#### 方式二：分别启动

**后端服务：**
```bash
cd agent-service
source venv/bin/activate  
uvicorn main:app --host 0.0.0.0 --port 9000 --reload
```

**前端服务（新版）：**
```bash
cd web
npm install  # 首次运行需要安装依赖
npm run dev
```

访问：
- 🎨 **现代前端**: http://localhost:5173 （React + TypeScript + Tailwind CSS）
- 📄 **经典前端**: http://localhost:8080 （原生 HTML/CSS/JS - 启动方式：`cd frontend && python -m http.server 8080`）
- 🔧 **后端 API**: http://localhost:9000
- 📖 **API 文档**: http://localhost:9000/docs

## 📖 使用示例

### 1️⃣ 数据分析
```
上传 sales.csv，帮我分析销售趋势并生成可视化报告
```

### 2️⃣ 生成报告
```
将当前分析结果生成一份 PDF 报告，包含图表和统计摘要
```

### 3️⃣ 代码执行
```
用 Python 计算斐波那契数列前 20 项并保存到 outputs/fib.txt
```

### 4️⃣ 图像分析（多模态）
```
[粘贴一张图表截图]
帮我提取这个图表中的数据并转换为 CSV
```

### 5️⃣ 文件引用
```
对比 @sales_chart.png 和 @sales_data.csv，分析趋势是否一致
```

## 🏗️ 技术架构

### 后端
- **框架**: FastAPI + LangGraph
- **LLM**: 通义千问（兼容 OpenAI API）
- **数据库**: SQLite（可扩展至 PostgreSQL）
- **ORM**: SQLAlchemy（异步）
- **认证**: JWT

### 前端
- **技术栈**: 原生 JavaScript + Marked.js + highlight.js
- **流式输出**: EventSource (SSE)
- **样式**: CSS Variables（支持暗色模式）

### 核心依赖
```
langchain >= 0.3.24
langgraph >= 0.2.64
fastapi >= 0.115.6
sqlalchemy >= 2.0.36
httpx >= 0.28.1
pydantic >= 2.10.5
```

## 📂 项目结构

```
Ling-Agent/
├── agent-service/          # 后端服务
│   ├── app/
│   │   ├── agent/          # Agent 核心
│   │   │   ├── infra/      # LLM、Agent 工厂
│   │   │   ├── prompts/    # 系统提示词
│   │   │   ├── skills/     # Skills 模块（6个）
│   │   │   └── tools/      # 工具集成（8个）
│   │   ├── core/           # 配置、依赖注入、审批逻辑
│   │   ├── crud/           # 数据库操作
│   │   ├── models/         # SQLAlchemy 模型
│   │   ├── routers/        # API 路由
│   │   └── schemas/        # Pydantic 模型
│   ├── workspace/          # 工作区（运行时生成）
│   └── app.db              # SQLite 数据库
├── web/                    # 现代前端（React + TypeScript）✨
│   ├── src/
│   │   ├── api/           # API 客户端
│   │   ├── components/    # React 组件
│   │   ├── pages/         # 页面组件
│   │   ├── stores/        # Zustand 状态管理
│   │   └── types/         # TypeScript 类型
│   ├── vite.config.ts     # Vite 配置
│   └── package.json
├── frontend/               # 经典前端（原生 HTML/CSS/JS）
│   ├── index.html
│   ├── style.css
│   └── script.js
├── start-dev.sh           # 一键启动脚本
└── README.md
```

## ⚙️ 环境变量

```bash
# .env 示例
DATABASE_URL=sqlite:///./app.db
DASHSCOPE_API_KEY=sk-xxx          # 通义千问 API Key
LLM_MODEL=qwen3.5-plus             # 模型名称
WORKSPACE_ROOT=./workspace         # 工作区路径
JWT_SECRET_KEY=your-secret-key     # JWT 密钥
PORT=9000
DEBUG=true
LOG_LEVEL=INFO
```

## 🔒 安全特性

- ✅ **工作区沙箱** - 文件操作限制在 `workspace/{session_id}/` 内
- ✅ **工具审批** - 高危操作需用户确认
- ✅ **JWT 认证** - 会话隔离，防止越权
- ✅ **超时控制** - Python 代码执行默认 60 秒超时
- ✅ **路径验证** - 防止路径遍历攻击

## 🛣️ Roadmap

- [ ] 多模态输入（图像、语音）
- [ ] 更多 Skills（代码审查、单元测试生成）
- [ ] Redis 替代 InMemorySaver（分布式支持）
- [ ] Docker 容器化部署
- [ ] 单元测试与 CI/CD
- [ ] 多 Agent 协作

## 🤝 Contributing

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交修改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 📄 License

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- [LangChain](https://github.com/langchain-ai/langchain) - Agent 框架
- [LangGraph](https://github.com/langchain-ai/langgraph) - 状态管理与流程编排
- [FastAPI](https://fastapi.tiangolo.com/) - 现代化 Web 框架
- [通义千问](https://dashscope.aliyun.com/) - 大语言模型
