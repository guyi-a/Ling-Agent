# Ling-Agent Web Frontend

现代化的 React + TypeScript 前端项目。

## 🚀 技术栈

- **React 19** - UI 框架
- **TypeScript 5.9** - 类型安全
- **Vite 8** - 构建工具
- **Tailwind CSS** - 样式框架
- **React Router** - 路由
- **Zustand** - 状态管理
- **TanStack Query** - 数据请求
- **Axios** - HTTP 客户端
- **Lucide React** - 图标库

## 📂 项目结构

```
web/
├── src/
│   ├── api/              # API 客户端
│   ├── components/       # React 组件
│   │   ├── ui/          # 基础 UI 组件
│   │   ├── layout/      # 布局组件
│   │   └── chat/        # 聊天相关组件
│   ├── pages/           # 页面组件
│   │   ├── home/        # 登录/注册
│   │   ├── chat/        # 聊天页面
│   │   └── sessions/    # 会话列表
│   ├── hooks/           # 自定义 Hooks
│   ├── stores/          # Zustand 状态
│   ├── utils/           # 工具函数
│   ├── types/           # TypeScript 类型
│   ├── App.tsx          # 根组件
│   ├── main.tsx         # 入口文件
│   └── index.css        # 全局样式
├── public/              # 静态资源
├── vite.config.ts       # Vite 配置
├── tailwind.config.js   # Tailwind 配置
└── package.json
```

## 🛠️ 开发

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

**代理配置：** 开发环境下，`/api` 请求会自动代理到 `http://localhost:9000`

### 构建生产版本

```bash
npm run build
```

构建产物在 `dist/` 目录。

## 🔗 后端 API

确保后端服务运行在 `http://localhost:9000`：

```bash
cd ../agent-service
uvicorn app.main:app --host 0.0.0.0 --port 9000 --reload
```

## 📝 TODO

- [ ] 集成 SSE 流式聊天
- [ ] 添加 shadcn/ui 组件库
- [ ] 实现会话管理
- [ ] 工作区文件展示
- [ ] 代码高亮（Shiki）
- [ ] 多模态支持（图片上传/预览）
- [ ] 工具调用卡片
- [ ] 主题切换
- [ ] 快捷键支持
