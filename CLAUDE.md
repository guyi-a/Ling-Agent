# Ling-Agent 项目开发指南

> 为 Claude Code 提供的项目上下文文档 - 最后更新：2026-04-02

## 📋 项目概述

**Ling-Agent** 是一个功能完整、工程化的 AI Agent 生产力工具，支持流式对话、技能加载、工具审批、工作区管理。

**核心价值：**
- 真流式输出（SSE token-level streaming）
- 多模态支持（qwen-vl-max 模型，支持图像+文本）
- Human-in-the-Loop 审批机制
- 工作区沙箱隔离
- 7个专业技能（数据分析、报告生成、浏览器自动化等）

---

## 🏗️ 技术架构

### 后端
- **框架**: FastAPI + LangGraph + LangChain
- **LLM**: 通义千问 qwen-vl-max（兼容 OpenAI API）
- **数据库**: SQLite + SQLAlchemy（异步）
- **认证**: JWT
- **流式**: SSE (Server-Sent Events)
- **状态管理**: LangGraph Checkpointer (InMemorySaver)

### 前端
- **主前端**: React 19 + TypeScript + Vite + Tailwind CSS (`web/` 目录)
- **备用前端**: 原生 HTML/CSS/JS (`frontend/` 目录，已不再维护)
- **状态管理**: Zustand
- **流式处理**: EventSource (SSE)
- **Markdown 渲染**: react-markdown + remark-gfm

### 项目结构
```
Ling-Agent/
├── agent-service/          # FastAPI 后端服务
│   ├── app/
│   │   ├── agent/          # Agent 核心
│   │   │   ├── infra/      # LLM 工厂、Agent 工厂
│   │   │   ├── prompts/    # core_prompt.md 系统提示词
│   │   │   ├── skills/     # 7个专业技能（每个技能有 SKILL.md）
│   │   │   │   ├── data-analysis/
│   │   │   │   ├── data-cleaning/
│   │   │   │   ├── news-enhance/
│   │   │   │   ├── report-generator/
│   │   │   │   ├── md-pdf-convert/
│   │   │   │   ├── doc-to-pptx/
│   │   │   │   └── browser-use/    # 浏览器自动化（最新）
│   │   │   ├── service/    # agent_service.py 核心服务
│   │   │   └── tools/      # 11个工具（文件、Python、Shell、网络、浏览器等）
│   │   ├── core/           # 配置、依赖注入、审批逻辑
│   │   ├── crud/           # 数据库 CRUD 操作
│   │   ├── models/         # SQLAlchemy 模型
│   │   ├── routers/        # API 路由（auth, chat, message, session, workspace）
│   │   ├── schemas/        # Pydantic 模型
│   │   ├── database/       # 数据库配置
│   │   └── utils/          # 工具函数
│   ├── workspace/          # 工作区（运行时生成，每个 session 一个目录）
│   ├── main.py            # FastAPI 入口
│   ├── requirements.txt
│   └── .env.example
├── web/                    # 现代前端（主要使用）✨
│   ├── src/
│   │   ├── api/           # API 客户端（chat, messages, sessions, workspace）
│   │   ├── components/    # React 组件
│   │   │   ├── SessionSidebar.tsx
│   │   │   ├── WorkspacePanel.tsx
│   │   │   ├── ApprovalCard.tsx
│   │   │   ├── FileSelector.tsx      # 文件选择器（新）
│   │   │   ├── AttachmentChip.tsx    # 附件卡片（新）
│   │   │   └── MessageActions.tsx    # 消息操作菜单（新）
│   │   ├── hooks/         # useSSEChat.ts
│   │   ├── pages/         # 页面组件（LoginPage, ChatPage, SessionsPage）
│   │   ├── stores/        # Zustand 状态管理（authStore）
│   │   └── types/         # TypeScript 类型定义
│   ├── vite.config.ts
│   └── package.json
├── frontend/               # 原生前端（已不维护）
├── start-dev.sh           # 一键启动脚本
├── FEATURE_ROADMAP.md     # 功能规划文档
└── README.md

工作区目录结构（运行时）:
workspace/{session_id}/
├── uploads/          # 用户上传文件
└── outputs/          # AI 生成的文件
    └── scripts/      # Python 脚本历史
```

---

## ✨ 已实现的核心功能

### 对话系统
- ✅ 真流式输出（SSE token-level streaming）
- ✅ 多会话管理（会话列表、切换）
- ✅ 停止生成（实时取消）
- ✅ JWT 认证与会话隔离
- ✅ 会话历史持久化

### 多模态能力
- ✅ 图像理解（qwen-vl-max 模型）
- ✅ 文件上传（图片、CSV、PDF、代码文件等）
- ✅ **文件附加到消息**（📎 按钮，选择工作区文件）✨ 最新
- ✅ 图片自动转 base64 传给多模态模型

### 消息操作（✨ 最新实现）
- ✅ **复制消息**（点击复制按钮）
- ✅ **删除消息**（单条删除）
- ✅ **重新生成 AI 回复**（仅最后一条 AI 消息）
- ✅ **编辑用户消息**（内联编辑，删除后续对话）

### Skills 系统（7个专业技能）
1. `data-analysis` - 数据分析、可视化图表（matplotlib）
2. `data-cleaning` - 数据清洗与预处理
3. `news-enhance` - 实时新闻搜索增强
4. `report-generator` - 从数据生成分析报告（PDF/PPTX）
5. `md-pdf-convert` - Markdown 转 PDF
6. `doc-to-pptx` - Word/PDF 转 PPTX
7. `browser-use` - 浏览器自动化（Chrome 控制）

### 工具集成（11个工具）
- `read_file` / `write_file` / `list_dir` - 文件操作（工作区隔离）
- `python_repl` - Python 代码执行（脚本持久化到 outputs/scripts/）
- `run_command` - Shell 命令执行
- `web_search` / `web_fetch` - 网络搜索与抓取
- `browser_use` / `install_browser_use` - 浏览器控制
- `install_noto_sans_sc` - 中文字体管理
- `Skill` - 技能加载器

### 审批机制
- ✅ 高危工具需人工审批（`run_command`, `python_repl`, `write_file`）
- ✅ LangGraph interrupt/resume 机制
- ✅ 前端审批卡片（60秒超时）
- ✅ 审批拒绝后保存 tool 消息（避免孤儿消息）

---

## 🚀 快速启动

### 一键启动（推荐）
```bash
./start-dev.sh
```

### 分别启动

**后端：**
```bash
cd agent-service
source venv/bin/activate  # 或 venv\Scripts\activate (Windows)
uvicorn main:app --host 0.0.0.0 --port 9000 --reload
```

**前端：**
```bash
cd web
npm install  # 首次运行
npm run dev
```

**访问地址：**
- 前端: http://localhost:5173
- 后端 API: http://localhost:9000
- API 文档: http://localhost:9000/docs

---

## 🔑 环境变量配置

**文件：** `agent-service/.env`

```bash
# 数据库
DATABASE_URL=sqlite:///./app.db

# LLM 配置
DASHSCOPE_API_KEY=sk-xxx          # 通义千问 API Key（必填）
LLM_MODEL=qwen-vl-max              # 支持多模态
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# 工作区
WORKSPACE_ROOT=./workspace

# JWT 认证
JWT_SECRET_KEY=your-secret-key-change-in-production
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# 服务配置
PORT=9000
DEBUG=true
LOG_LEVEL=INFO
```

---

## 📡 核心 API 端点

### 认证
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录（返回 JWT）
- `GET /api/users/me` - 获取当前用户信息

### 聊天
- `POST /api/chat/stream` - SSE 流式聊天（主要使用）
  - Body: `{message, session_id?, attachments?}`
  - SSE Events: `session`, `token`, `tool_start`, `tool_end`, `approval_required`, `done`
- `POST /api/chat/` - 非流式聊天（兼容接口）
- `POST /api/chat/approve` - 工具审批
- `POST /api/chat/{session_id}/stop` - 停止生成
- `GET /api/chat/status` - Agent 状态

### 消息管理
- `GET /api/messages/session/{session_id}/history` - 获取对话历史
- `DELETE /api/messages/{message_id}` - 删除单条消息
- `DELETE /api/messages/session/{session_id}/after/{message_id}` - 删除该消息及之后所有消息（用于编辑）

### 会话管理
- `GET /api/sessions/` - 获取用户的所有会话
- `POST /api/sessions/` - 创建新会话
- `DELETE /api/sessions/{session_id}` - 删除会话

### 工作区
- `POST /api/workspace/{session_id}/upload` - 上传文件
- `GET /api/workspace/{session_id}/files` - 列出文件
- `GET /api/workspace/{session_id}/files/{folder}/{filename}` - 下载文件
- `DELETE /api/workspace/{session_id}/files/{folder}/{filename}` - 删除文件

---

## 🎯 最近开发进展（2026-04-02）

### ✅ 已完成功能

#### 1. 文件附加到消息（2-3小时）
- 创建 `FileSelector.tsx` - 文件选择器模态框
- 创建 `AttachmentChip.tsx` - 附件卡片组件
- 修改 `ChatPage.tsx` - 添加 📎 按钮和附件展示
- **效果**: 用户可以从工作区选择文件附加到消息，Agent 自动读取

#### 2. 消息操作菜单（2-3小时）
- 后端添加批量删除 API：`DELETE /api/messages/session/{session_id}/after/{message_id}`
- 后端 SSE 流返回 `assistant_message_id`（用于前端操作）
- 创建 `messages.ts` API 客户端
- 创建 `MessageActions.tsx` - 悬停显示操作按钮
- 修改 `ChatPage.tsx` - 实现复制、删除、编辑、重新生成功能
- **效果**: 悬停消息显示操作菜单，支持复制/编辑/删除/重新生成

### 技术细节

#### 文件附加实现原理
1. 用户点击 📎 按钮打开 FileSelector
2. 从工作区选择文件（uploads/ 或 outputs/）
3. 文件显示为 AttachmentChip 卡片
4. 发送消息时，attachments 数组传给后端
5. 后端 `agent_service.py` 的 `_convert_to_multimodal_message()` 处理附件：
   - 图片：转 base64 加载到多模态消息
   - 文件：添加引用提示，Agent 可用 read_file 工具读取

#### 消息操作实现原理
1. **消息 ID 映射**：前端保存后端的 `message_id` (UUID)
   - 加载历史时从 API 获取
   - 流式响应的 session 事件获取 user_message_id
   - done 事件获取 assistant_message_id
2. **编辑消息**：删除该消息及之后所有消息，重发新消息（避免分叉对话）
3. **重新生成**：删除最后一条 AI 消息，重发上一条用户消息

---

## 🛠️ 开发规范

### 代码风格
- Python: 遵循 PEP 8，使用 async/await
- TypeScript: 函数式组件 + Hooks
- 文件命名: PascalCase.tsx (组件), camelCase.ts (工具)

### Git 提交规范
```
feat: 添加新功能
fix: 修复 bug
docs: 文档更新
refactor: 代码重构
style: 样式调整
test: 测试相关
```

### 后端开发注意事项
1. **所有路由都需要 JWT 认证**（除了 /api/auth/）
2. **工具调用必须通过审批机制**（在 `app/core/approval.py` 中配置）
3. **文件操作限制在工作区**（`workspace/{session_id}/`）
4. **使用 logger 记录关键步骤**（emoji 前缀，如 ✅ ❌ 🤖 💾）
5. **AsyncSession 使用**：所有数据库操作都是异步的
6. **session_id 注入**：调用文件工具前需 `set_session_id(session_id)`

### 前端开发注意事项
1. **使用 TypeScript 类型**（定义在 `web/src/types/index.ts`）
2. **API 调用通过客户端**（`web/src/api/` 目录）
3. **状态管理优先使用 Hooks**（useState, useCallback, useEffect）
4. **SSE 流式处理**在 `useSSEChat.ts` hook 中
5. **深色模式支持**：使用 Tailwind 的 `dark:` 前缀
6. **组件复用**：相似功能提取为组件（如 FileSelector, MessageActions）

---

## 📊 数据模型

### User (用户)
- `user_id` (UUID)
- `username` (唯一)
- `password_hash`
- `created_at`

### Session (会话)
- `session_id` (UUID)
- `user_id` (外键)
- `title` (会话标题)
- `created_at` / `updated_at`

### Message (消息)
- `message_id` (UUID)
- `session_id` (外键)
- `role` (user, assistant, system, tool)
- `content` (文本内容)
- `extra_data` (JSON 字符串，存储附件、tool_calls 等元数据)
- `created_at`

**extra_data 格式示例：**
```json
{
  "attachments": [
    {"type": "image", "path": "uploads/test.png", "size": 12345}
  ],
  "tool_calls": [
    {"id": "call_xxx", "name": "read_file", "args": {...}}
  ],
  "tool_call_id": "call_xxx",
  "tool_name": "read_file"
}
```

---

## 🔒 安全机制

1. **工作区沙箱**：所有文件操作限制在 `workspace/{session_id}/`
2. **路径验证**：防止路径遍历攻击（检查 `..` 和绝对路径）
3. **JWT 认证**：会话隔离，防止越权访问
4. **工具审批**：高危操作（shell、python、写文件）需用户批准
5. **超时控制**：Python 执行 60 秒超时，审批 60 秒超时
6. **文件大小限制**：上传文件最大 50MB

---

## 🎯 下一步开发计划

参考 `FEATURE_ROADMAP.md` 获取完整规划。

### 立即实现（高优先级 ⭐⭐⭐⭐⭐）
1. **代码块语法高亮 + 复制按钮**（1-1.5小时）
   - 使用 `react-syntax-highlighter`
   - 自动识别语言
   - 一键复制代码

2. **拖拽上传文件**（1小时）
   - 拖拽到聊天区域上传
   - 拖拽高亮提示

### 近期计划（⭐⭐⭐⭐）
3. **会话搜索/过滤**（1小时）
4. **Agent 执行可视化**（3-4小时）- 显示工具调用树
5. **响应式布局**（3-4小时）- 移动端适配

---

## 🐛 已知问题与解决方案

### 1. 孤儿 tool_calls 消息
**问题：** 审批拒绝时，assistant 带 tool_calls 的消息已保存，但没有对应的 tool 消息

**解决：** 
- `message_crud.py` 中的 `_drop_orphan_tool_calls()` 函数过滤孤儿消息
- 审批拒绝时手动保存一条拒绝的 tool 消息

### 2. checkpointer 状态残留
**问题：** 中断/拒绝后 checkpointer 保留中断状态，下次 resume 会出错

**解决：**
- 审批拒绝或停止生成后，调用 `checkpointer.adelete_thread(session_id)` 清理状态

### 3. 前端消息 ID 映射
**问题：** 前端本地 ID 和后端 message_id 不一致

**解决：**
- Message 接口添加 `messageId?: string` 字段
- 从历史 API 和 SSE 事件中获取后端 message_id
- 操作消息时使用后端 message_id

---

## 💡 开发建议

### 添加新功能时
1. **先读现有代码**：理解项目模式和规范
2. **复用现有组件**：如 WorkspacePanel 的文件列表渲染逻辑
3. **后端优先**：确保 API 可用后再做前端
4. **增量开发**：小步提交，便于回滚

### 添加新 Skill
1. 在 `agent-service/app/agent/skills/` 创建目录
2. 编写 `SKILL.md`（包含触发条件、使用方法）
3. 在 `app/agent/tools/skill_tool.py` 的 `SKILLS` 字典中注册

### 添加新工具
1. 在 `agent-service/app/agent/tools/` 创建工具文件
2. 使用 `@tool` 装饰器定义工具
3. 在 `registry.py` 中注册工具
4. 如果是高危工具，在 `app/core/approval.py` 中添加审批规则

---

## 🧪 测试指南

### 手动测试流程
1. 启动服务 `./start-dev.sh`
2. 访问 http://localhost:5173
3. 注册/登录账号
4. 创建新会话
5. 上传测试文件（CSV、图片）
6. 测试文件附加功能（📎 按钮）
7. 测试消息操作（悬停消息查看操作按钮）
8. 测试工具审批（发送需要 python_repl 的消息）

### 验证后端 API
```bash
# 获取 Agent 状态
curl http://localhost:9000/api/chat/status

# 查看 API 文档
open http://localhost:9000/docs
```

---

## 🔍 调试技巧

### 后端调试
```bash
# 查看实时日志
tail -f agent-service/logs/*.log  # 如果配置了日志文件

# 或查看 uvicorn 输出
# 日志格式：emoji + 描述性文字
# ✅ 成功  ❌ 错误  🤖 Agent  💾 数据库  📎 附件
```

### 前端调试
- 打开浏览器开发者工具（F12）
- Network 标签：查看 SSE 流和 API 请求
- Console 标签：查看错误日志
- React DevTools：查看组件状态

### 常见问题

**Q: 前端显示"AI 助手暂时不可用"**
- 检查 `DASHSCOPE_API_KEY` 是否配置
- 查看后端日志是否有 LLM 初始化错误

**Q: 工具调用一直等待审批**
- 检查前端是否显示审批卡片
- 查看 `app/core/approval.py` 配置

**Q: 文件附加后 Agent 看不到**
- 检查文件路径格式：`uploads/filename.ext`
- 查看后端日志是否有"📎 当前消息包含 X 个附件"

---

## 📚 参考资料

- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [通义千问 API](https://help.aliyun.com/zh/dashscope/)
- [React 文档](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)

---

## 🤝 与 Claude Code 协作

### 推荐工作流
1. **探索代码**：使用 `Read`, `Glob`, `Grep` 工具
2. **进入计划模式**：复杂功能先用 `EnterPlanMode` 规划
3. **增量实现**：小步迭代，频繁测试
4. **及时提交**：功能完成后提交 git commit

### 当前状态
- ✅ 文件附加功能完整实现
- ✅ 消息操作菜单完整实现
- ✅ 所有代码已编译通过
- ⚠️ 需要前端刷新浏览器生效

### 待办事项
参考 `FEATURE_ROADMAP.md` 中的优先级列表。

---

## 📝 重要提示

1. **不要修改 `frontend/` 目录**：该目录是旧版前端，已废弃
2. **所有前端开发在 `web/` 目录**
3. **测试前记得刷新浏览器**：Vite 的 HMR 有时不会立即生效
4. **后端使用 --reload**：代码修改会自动重载
5. **工作区文件不要提交到 git**：`workspace/` 目录已在 .gitignore 中

---

## 🎨 UI/UX 设计原则

1. **简洁优先**：不过度设计，保持界面清爽
2. **深色模式**：所有组件支持深色模式
3. **即时反馈**：操作后立即显示反馈（loading, success, error）
4. **键盘友好**：支持 Enter 发送、Esc 关闭弹窗
5. **响应式**：核心功能在移动端也能使用（待优化）

---

## 🔧 常用命令

```bash
# 后端
cd agent-service
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload

# 前端
cd web
npm install
npm run dev
npm run build

# 数据库
cd agent-service
sqlite3 app.db ".schema"        # 查看表结构
sqlite3 app.db "SELECT * FROM users;"  # 查询数据

# Git
git status
git add .
git commit -m "feat: 添加消息操作菜单"
```

---

## 🎓 学习资源

如果你是新加入的开发者或 Claude Code，建议按以下顺序阅读：

1. **README.md** - 项目概述和快速开始
2. **FEATURE_ROADMAP.md** - 功能规划和优先级
3. **本文档 (CLAUDE.md)** - 技术细节和开发指南
4. **agent-service/app/agent/prompts/core_prompt.md** - Agent 系统提示词
5. **agent-service/app/agent/skills/*/SKILL.md** - 各技能的使用说明

---

_此文档由 Claude Code 生成和维护。如有疑问，请查看代码注释或运行 `/help`。_
