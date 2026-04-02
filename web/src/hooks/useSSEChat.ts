import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'

export interface Message {
  id: string
  messageId?: string  // 后端的 message_id (UUID)
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  toolCalls?: Array<{
    name: string
    status: 'pending' | 'done' | 'rejected'
  }>
  approvalRequest?: {
    requestId: string
    toolName: string
    toolInput: any
    remaining: number
  }
}

export function useSSEChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const token = useAuthStore((state) => state.token)

  // 组件卸载时清理连接
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const stopStreaming = useCallback(async () => {
    // 先通知后端停止
    if (currentSessionId) {
      try {
        await fetch(`/api/chat/${currentSessionId}/stop`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })
      } catch (error) {
        console.error('停止请求失败:', error)
      }
    }

    // 然后中止前端连接
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsStreaming(false)

    // 移除最后一条消息的streaming状态
    setMessages((prev) =>
      prev.map((msg, idx) =>
        idx === prev.length - 1 && msg.isStreaming
          ? { ...msg, isStreaming: false, content: msg.content + '\n\n_已停止生成_' }
          : msg
      )
    )
  }, [currentSessionId, token])

  const sendMessage = useCallback(
    async (message: string, attachments?: any[], sessionId?: string) => {
      if (!message.trim() || isStreaming) return

      // 添加用户消息
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: message,
      }
      setMessages((prev) => [...prev, userMessage])
      setIsStreaming(true)

      // 创建 AI 消息（用于流式填充）
      const aiMessageId = (Date.now() + 1).toString()
      const aiMessage: Message = {
        id: aiMessageId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      }
      setMessages((prev) => [...prev, aiMessage])

      try {
        // 准备请求数据（优先使用传入的 sessionId，其次是 currentSessionId）
        const payload: any = { message }
        const targetSessionId = sessionId || currentSessionId
        if (targetSessionId) payload.session_id = targetSessionId
        if (attachments && attachments.length > 0) payload.attachments = attachments

        // 使用 fetch 发送 POST 请求
        abortControllerRef.current = new AbortController()
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
          signal: abortControllerRef.current.signal,
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        // 读取 SSE 流
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let accumulated = ''

        while (reader) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() || ''

          for (const part of parts) {
            const lines = part.split('\n')
            let event = 'message'
            let data = ''

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                event = line.slice(7).trim()
              } else if (line.startsWith('data: ')) {
                data = line.slice(6).trim()
              }
            }

            if (!data) continue

            try {
              const parsed = JSON.parse(data)

              if (event === 'session') {
                // 设置会话 ID（只在新会话或没有会话时更新）
                if (parsed.session_id && (parsed.is_new_session || !currentSessionId)) {
                  console.log('新会话创建:', parsed.session_id)
                  setCurrentSessionId(parsed.session_id)
                }
                // 保存用户消息的 message_id
                if (parsed.user_message_id) {
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === userMessage.id
                        ? { ...msg, messageId: parsed.user_message_id }
                        : msg
                    )
                  )
                }
              } else if (event === 'token') {
                // 累积 token
                accumulated += parsed.text
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === aiMessageId
                      ? { ...msg, content: accumulated }
                      : msg
                  )
                )
              } else if (event === 'tool_start') {
                // 工具开始
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === aiMessageId
                      ? {
                          ...msg,
                          toolCalls: [
                            ...(msg.toolCalls || []),
                            { name: parsed.tool_name, status: 'pending' as const },
                          ],
                        }
                      : msg
                  )
                )
              } else if (event === 'tool_end') {
                // 工具完成
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id === aiMessageId && msg.toolCalls) {
                      const updatedTools = [...msg.toolCalls]
                      const idx = updatedTools.findIndex(
                        (t) => t.name === parsed.tool_name && t.status === 'pending'
                      )
                      if (idx !== -1) {
                        updatedTools[idx].status = 'done'
                      }
                      return { ...msg, toolCalls: updatedTools }
                    }
                    return msg
                  })
                )
              } else if (event === 'approval_required') {
                // 需要审批
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === aiMessageId
                      ? {
                          ...msg,
                          isStreaming: false,
                          approvalRequest: {
                            requestId: parsed.request_id,
                            toolName: parsed.tool_name,
                            toolInput: parsed.tool_input || {},
                            remaining: 60,
                          },
                        }
                      : msg
                  )
                )
              } else if (event === 'approval_rejected') {
                // 审批被拒绝
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === aiMessageId
                      ? {
                          ...msg,
                          approvalRequest: undefined,
                          content: msg.content + `\n\n_已拒绝执行：${parsed.tool_name}_`,
                        }
                      : msg
                  )
                )
              } else if (event === 'cancelled') {
                // 被取消
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === aiMessageId
                      ? {
                          ...msg,
                          isStreaming: false,
                          content: msg.content + '\n\n_已停止生成_',
                        }
                      : msg
                  )
                )
              } else if (event === 'done') {
                // 流式结束，保存 assistant 的 message_id
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === aiMessageId
                      ? {
                          ...msg,
                          isStreaming: false,
                          approvalRequest: undefined,
                          messageId: parsed.assistant_message_id
                        }
                      : msg
                  )
                )
              } else if (event === 'error') {
                console.error('SSE error:', parsed)
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === aiMessageId
                      ? {
                          ...msg,
                          isStreaming: false,
                          content: msg.content + `\n\n_错误：${parsed.message || '未知错误'}_`,
                        }
                      : msg
                  )
                )
              }
            } catch (err) {
              console.error('Parse error:', err)
            }
          }
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('Stream aborted')
        } else {
          console.error('Stream error:', error)
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, content: '发生错误，请稍后重试', isStreaming: false }
                : msg
            )
          )
        }
      } finally {
        setIsStreaming(false)
        abortControllerRef.current = null
      }
    },
    [isStreaming, currentSessionId, token]
  )

  return {
    messages,
    isStreaming,
    currentSessionId,
    sendMessage,
    stopStreaming,
    setMessages,
  }
}
