#!/bin/bash

echo "🚀 启动 Ling-Agent 开发环境"
echo ""

# 启动后端
echo "📡 启动后端服务 (端口 9000)..."
cd agent-service
source venv/bin/activate 2>/dev/null || true
uvicorn app.main:app --host 0.0.0.0 --port 9000 --reload &
BACKEND_PID=$!
cd ..

sleep 2

# 启动前端
echo "🎨 启动前端服务 (端口 5173)..."
cd web
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ 服务已启动！"
echo ""
echo "📱 前端地址: http://localhost:5173"
echo "🔧 后端地址: http://localhost:9000"
echo "📖 API 文档: http://localhost:9000/docs"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 等待用户中断
trap "echo ''; echo '⏹️  停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

wait
