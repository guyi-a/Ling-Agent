# Ling-Agent Web Frontend

Ling-Agent 的主前端应用，基于 React + TypeScript + Vite，负责聊天界面、会话管理、工作区文件交互、工具审批、应用预览，以及心理健康相关页面。

## 技术栈

- **React 19** - UI 框架
- **TypeScript 5.9** - 类型安全
- **Vite 8** - 构建工具
- **Tailwind CSS** - 样式系统
- **React Router 7** - 路由管理
- **Zustand** - 客户端状态持久化
- **TanStack Query** - 服务端状态与请求缓存
- **Axios** - HTTP 客户端
- **react-markdown / remark-gfm** - Markdown 渲染
- **react-syntax-highlighter** - 代码高亮
- **Mermaid / KaTeX** - 图表与公式渲染

## 当前功能

- 登录态持久化与鉴权路由守卫
- SSE 流式聊天与断线恢复
- 多会话管理与历史消息加载
- 消息复制、删除、从此处删除、重新生成、内联编辑
- 工作区文件选择与图片粘贴上传
- 工具调用卡片与人工审批卡片
- 运行中应用预览与工作区侧边栏
- 全局消息搜索
- 主题切换
- 心理日记与心理测评页面

## 页面路由

- `/login` - 登录页
- `/chat` - 主聊天页
- `/sessions` - 会话管理
- `/apps` - 应用管理
- `/diary` - 心理日记
- `/assessment` - 心理测评
- `/profile` - 用户资料
- `/settings` - 设置页

## 项目结构

```text
web/
├── src/
│   ├── api/                # 后端 API 封装
│   ├── components/         # 通用组件与聊天组件
│   ├── hooks/              # 自定义 Hooks（如 useSSEChat）
│   ├── pages/              # 页面级组件
│   │   ├── home/           # 登录页
│   │   ├── chat/           # 聊天主页
│   │   ├── sessions/       # 会话页
│   │   ├── apps/           # 应用页
│   │   ├── diary/          # 心理日记
│   │   ├── assessment/     # 心理测评
│   │   ├── profile/        # 用户资料
│   │   └── settings/       # 设置页
│   ├── stores/             # Zustand 状态管理
│   ├── types/              # 类型定义
│   ├── utils/              # 工具函数
│   ├── App.tsx             # 路由入口
│   └── main.tsx            # 应用入口
├── public/                 # 静态资源
├── index.html
├── vite.config.ts
└── package.json
```

## 开发

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

默认访问：`http://localhost:5174`

开发环境下，`/api` 请求会代理到 `http://localhost:9000`。

## 后端联调

确保后端服务已启动：

```bash
cd ../agent-service
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 9000 --reload
```

## 构建

```bash
npm run build
```

构建产物输出到 `dist/`。
