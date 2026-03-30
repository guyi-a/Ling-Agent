# Android智能助手Agent实施方案

## 项目概述

实现一个基于Langchain的智能Agent，能够通过自然语言控制Android设备执行各种操作。

## 核心架构

```
[用户自然语言指令]
        ↓
[FastAPI后端服务]
        ↓
[Langchain Agent]
        ↓
[工具调用]
        ↓
[HTTP API]
        ↓
[Android助手App]
        ↓
[Android系统API]
```

## 实施步骤

### 1. 后端服务完善

#### 1.1 创建Android控制工具
```python
# app/agent/tools/android_controller.py
import requests
from langchain.tools import tool
from typing import Dict, Any

class AndroidController:
    """Android设备控制器"""

    def __init__(self, device_url: str = "http://localhost:8080"):
        self.device_url = device_url

    def launch_app(self, package_name: str) -> str:
        """启动应用"""
        try:
            response = requests.post(
                f"{self.device_url}/api/launch-app",
                json={"package": package_name},
                timeout=10
            )
            if response.status_code == 200:
                return f"✅ 应用启动成功: {package_name}"
            else:
                return f"❌ 应用启动失败: {response.text}"
        except Exception as e:
            return f"❌ 启动应用时发生错误: {str(e)}"

    def check_notifications(self, app_name: str = None) -> str:
        """检查通知"""
        try:
            params = {"app": app_name} if app_name else {}
            response = requests.get(
                f"{self.device_url}/api/notifications",
                params=params,
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                return f"🔔 通知检查结果: {data}"
            else:
                return f"❌ 检查通知失败: {response.text}"
        except Exception as e:
            return f"❌ 检查通知时发生错误: {str(e)}"

    def go_home(self) -> str:
        """返回桌面"""
        try:
            response = requests.post(
                f"{self.device_url}/api/home",
                timeout=10
            )
            if response.status_code == 200:
                return "✅ 已返回桌面"
            else:
                return f"❌ 返回桌面失败: {response.text}"
        except Exception as e:
            return f"❌ 返回桌面时发生错误: {str(e)}"

# 注册为Langchain工具
@tool
def android_control(action: str, params: Dict[str, Any]) -> str:
    """
    控制Android设备的工具

    Args:
        action: 操作类型 (launch_app, check_notifications, go_home)
        params: 参数字典

    Example:
        android_control("launch_app", {"package": "com.google.android.gm"})
        android_control("check_notifications", {"app": "gmail"})
        android_control("go_home", {})
    """
    controller = AndroidController()

    if action == "launch_app":
        return controller.launch_app(params.get("package", ""))
    elif action == "check_notifications":
        return controller.check_notifications(params.get("app"))
    elif action == "go_home":
        return controller.go_home()
    else:
        return f"❌ 不支持的操作: {action}"
```

#### 1.2 创建Agent服务
```python
# app/agent/service/android_agent.py
from langchain.agents import AgentExecutor
from app.agent.infra.agent_factory import create_Ling_Agent
from app.agent.tools.android_controller import android_control

class AndroidAssistantAgent:
    """Android助手Agent"""

    def __init__(self):
        # 创建Agent，包含Android控制工具
        self.agent = create_Ling_Agent(
            tools=[android_control],
            system_prompt="""你是一个Android设备助手，可以帮助用户控制他们的Android设备。

你可以执行以下操作：
1. 启动应用 (launch_app)
2. 检查通知 (check_notifications)
3. 返回桌面 (go_home)

请根据用户的需求选择合适的工具并执行。"""
        )

    async def process_query(self, user_input: str) -> str:
        """处理用户查询"""
        try:
            # 准备输入
            inputs = {"messages": [{"role": "user", "content": user_input}]}

            # 执行Agent
            result = []
            for chunk in self.agent.stream(inputs, stream_mode="updates"):
                result.append(chunk)

            # 提取最终响应
            if result:
                last_chunk = result[-1]
                if 'model' in last_chunk and 'messages' in last_chunk['model']:
                    messages = last_chunk['model']['messages']
                    if messages:
                        return messages[-1].content

            return "抱歉，我没有理解您的请求。"

        except Exception as e:
            return f"处理请求时发生错误: {str(e)}"
```

#### 1.3 创建API端点
```python
# main.py 中添加
from app.agent.service.android_agent import AndroidAssistantAgent

# 创建全局Agent实例
android_agent = AndroidAssistantAgent()

@app.post("/api/android-assistant")
async def android_assistant(query: str):
    """Android助手API端点"""
    response = await android_agent.process_query(query)
    return {"response": response}
```

### 2. Android助手App开发

#### 2.1 核心HTTP服务器
```kotlin
// MainActivity.kt
class MainActivity : AppCompatActivity() {
    private lateinit var httpServer: SimpleHttpServer

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // 启动HTTP服务器
        startHttpServer()
    }

    private fun startHttpServer() {
        httpServer = SimpleHttpServer(8080)
        try {
            httpServer.start()
            Log.d("AndroidAssistant", "HTTP服务器启动成功")
        } catch (e: IOException) {
            Log.e("AndroidAssistant", "HTTP服务器启动失败", e)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        httpServer.stop()
    }
}
```

#### 2.2 HTTP服务器实现
```kotlin
// SimpleHttpServer.kt
class SimpleHttpServer(port: Int) : NanoHTTPD(port) {

    override fun serve(session: IHTTPSession): Response {
        return when (session.uri) {
            "/api/launch-app" -> handleLaunchApp(session)
            "/api/notifications" -> handleNotifications(session)
            "/api/home" -> handleGoHome(session)
            else -> newFixedLengthResponse(Response.Status.NOT_FOUND, "application/json",
                """{"error": "接口不存在"}""")
        }
    }

    private fun handleLaunchApp(session: IHTTPSession): Response {
        try {
            val files = HashMap<String, String>()
            session.parseBody(files)

            val json = JSONObject(files["postData"] ?: "{}")
            val packageName = json.optString("package", "")

            if (packageName.isNotEmpty()) {
                launchApp(packageName)
                return jsonResponse("""{"status": "success", "message": "应用启动成功"}""")
            } else {
                return jsonResponse("""{"status": "error", "message": "缺少包名参数"}""", 400)
            }
        } catch (e: Exception) {
            return jsonResponse("""{"status": "error", "message": "${e.message}"}""", 500)
        }
    }

    private fun handleNotifications(session: IHTTPSession): Response {
        // 简化实现，实际需要NotificationListenerService
        val app = session.parms["app"] ?: "all"
        return jsonResponse("""{
            "status": "success",
            "app": "$app",
            "notifications": [],
            "timestamp": "${System.currentTimeMillis()}"
        }""")
    }

    private fun handleGoHome(session: IHTTPSession): Response {
        goHome()
        return jsonResponse("""{"status": "success", "message": "已返回桌面"}""")
    }

    private fun launchApp(packageName: String) {
        try {
            val intent = packageManager.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
            }
        } catch (e: Exception) {
            Log.e("AndroidAssistant", "启动应用失败: $packageName", e)
        }
    }

    private fun goHome() {
        try {
            val intent = Intent(Intent.ACTION_MAIN)
            intent.addCategory(Intent.CATEGORY_HOME)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
        } catch (e: Exception) {
            Log.e("AndroidAssistant", "返回桌面失败", e)
        }
    }

    private fun jsonResponse(json: String, status: Int = 200): Response {
        return newFixedLengthResponse(
            Response.Status.lookup(status),
            "application/json",
            json
        )
    }
}
```

### 3. 测试和部署

#### 3.1 测试脚本
```python
# test/test_android_agent.py
#!/usr/bin/env python3
import requests
import asyncio

async def test_android_agent():
    """测试Android助手Agent"""

    # 测试启动应用
    response = requests.post(
        "http://localhost:9000/api/android-assistant",
        json={"query": "请帮我打开Gmail应用"}
    )
    print("启动应用测试:", response.json())

    # 测试检查通知
    response = requests.post(
        "http://localhost:9000/api/android-assistant",
        json={"query": "检查一下有没有新邮件"}
    )
    print("检查通知测试:", response.json())

    # 测试返回桌面
    response = requests.post(
        "http://localhost:9000/api/android-assistant",
        json={"query": "返回桌面"}
    )
    print("返回桌面测试:", response.json())

if __name__ == "__main__":
    asyncio.run(test_android_agent())
```

## 部署指南

### 1. 后端部署
```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 配置环境变量
cp .env_example .env
# 编辑.env文件，填入实际的API密钥

# 3. 运行服务
python main.py
```

### 2. Android App部署
1. 使用Android Studio编译APK
2. 安装到目标设备
3. 确保设备和后端在同一网络
4. 在App中配置后端IP地址

## 扩展计划

### 短期目标
1. 完善Android App的通知监听功能
2. 添加更多设备控制操作
3. 优化自然语言理解准确性

### 长期目标
1. 集成语音识别和合成
2. 添加图像识别能力
3. 支持多设备管理
4. 开发Web管理界面

## 安全考虑

1. **API认证**：添加API密钥验证
2. **操作日志**：记录所有设备操作
3. **权限控制**：限制可执行的操作范围
4. **网络加密**：使用HTTPS通信

这个方案提供了完整的实现路径，从概念到部署都有明确的指导。