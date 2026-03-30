# Agent Service

基于FastAPI的智能体服务，使用Langchain和DashScope API。

## 功能特性

- FastAPI Web框架
- Langchain集成
- DashScope Qwen模型支持
- SQLite数据库存储（通过SQLAlchemy ORM）
- Alembic数据库迁移
- 环境变量配置管理

## 快速开始

### 1. 环境设置

```bash
# 创建虚拟环境
python3 -m venv venv

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 2. 数据库迁移

```bash
# 创建数据库迁移
alembic revision --autogenerate -m "Initial migration"

# 应用数据库迁移
alembic upgrade head
```

### 3. 运行应用

```bash
# 启动服务
python main.py
```

服务将在 `http://localhost:9000` 上运行。

## API端点

- `GET /` - 主页
- `GET /health` - 健康检查
- `GET /docs` - API文档

## 配置

所有配置都通过 `.env` 文件管理：

- `PORT`: 服务端口 (默认: 9000)
- `DASHSCOPE_API_KEY`: DashScope API密钥
- `DATABASE_URL`: 数据库连接URL