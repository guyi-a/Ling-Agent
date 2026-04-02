# 调试步骤

请打开浏览器控制台，执行以下检查：

## 1. 检查会话列表API

```javascript
fetch('/api/sessions/', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
  }
})
.then(r => r.json())
.then(console.log)
```

## 2. 检查历史消息API

```javascript
// 替换 SESSION_ID 为实际的会话ID
fetch('/api/messages/session/SESSION_ID/history', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
  }
})
.then(r => r.json())
.then(console.log)
```

## 3. 检查审批API

```javascript
// 替换 REQUEST_ID 为实际的请求ID
fetch('/api/chat/approve', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
  },
  body: JSON.stringify({
    request_id: 'REQUEST_ID',
    approved: true
  })
})
.then(r => r.json())
.then(console.log)
```

## 4. 查看React State

打开React DevTools，查看：
- SessionSidebar 组件的 sessions state
- ChatPage 组件的 currentSessionId state
- messages state

## 5. 查看Network请求

打开Network面板，观察：
- /api/sessions/ 是否被调用
- 返回的状态码和数据
- SSE stream 的事件内容
