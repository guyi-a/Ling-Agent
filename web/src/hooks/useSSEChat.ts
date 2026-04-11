import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'

export interface MessagePart {
  type: 'text' | 'tool'
  content?: string  // for text
  toolName?: string  // for tool
  toolStatus?: 'pending' | 'done' | 'rejected'  // for tool
  isSkill?: boolean  // Skill 工具标记
  toolInput?: any    // 工具输入参数
  toolOutput?: string // 工具输出结果
}

export interface Message {
  id: string
  messageId?: string  // 后端的 message_id (UUID)
  role: 'user' | 'assistant'
  parts: MessagePart[]  // 按时间顺序的内容片段
  isStreaming?: boolean
  approvalRequest?: {
    requestId: string
    toolName: string
    toolInput: any
    remaining: number
  }
}

// 辅助函数：获取消息的纯文本内容
export function getMessageContent(message: Message): string {
  return message.parts
    .filter(p => p.type === 'text')
    .map(p => p.content || '')
    .join('')
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
        parts: [{ type: 'text', content: message }],
      }
      setMessages((prev) => [...prev, userMessage])
      setIsStreaming(true)

      // 创建 AI 消息（用于流式填充）
      const aiMessageId = (Date.now() + 1).toString()
      const aiMessage: Message = {
        id: aiMessageId,
        role: 'assistant',
        parts: [],
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
        let lastPartWasTool = false  // 跟踪最后一个 part 是否为 tool

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
                // 如果上一个 part 是 tool，重置 accumulated
                if (lastPartWasTool) {
                  accumulated = ''
                  lastPartWasTool = false
                }

                // 累积 token
                accumulated += parsed.text
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== aiMessageId) return msg

                    const parts = [...msg.parts]
                    // 如果最后一个 part 是 text，更新内容；否则创建新 text part
                    if (parts.length > 0 && parts[parts.length - 1].type === 'text') {
                      parts[parts.length - 1] = {
                        type: 'text',
                        content: accumulated
                      }
                    } else {
                      parts.push({ type: 'text', content: accumulated })
                    }

                    return { ...msg, parts }
                  })
                )
              } else if (event === 'tool_start') {
                // 工具开始
                lastPartWasTool = true  // 标记最后一个 part 是 tool

                // 如果是 Skill 工具，从 tool_input 中提取实际技能名
                const isSkill = parsed.tool_name === 'Skill'
                let displayName = parsed.tool_name
                if (isSkill && parsed.tool_input?.command) {
                  displayName = parsed.tool_input.command
                }

                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== aiMessageId) return msg

                    return {
                      ...msg,
                      parts: [
                        ...msg.parts,
                        {
                          type: 'tool',
                          toolName: displayName,
                          toolStatus: 'pending' as const,
                          isSkill,
                          toolInput: parsed.tool_input,
                        }
                      ]
                    }
                  })
                )
              } else if (event === 'tool_end') {
                // 工具完成 — 找最后一个 pending 的工具标记为 done
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== aiMessageId) return msg

                    const parts = [...msg.parts]
                    for (let i = parts.length - 1; i >= 0; i--) {
                      if (
                        parts[i].type === 'tool' &&
                        parts[i].toolStatus === 'pending'
                      ) {
                        parts[i] = { ...parts[i], toolStatus: 'done' as const, toolOutput: parsed.tool_output }
                        break
                      }
                    }

                    return { ...msg, parts }
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
                  prev.map((msg) => {
                    if (msg.id !== aiMessageId) return msg

                    const parts = [...msg.parts]
                    parts.push({
                      type: 'text',
                      content: `\n\n_已拒绝执行：${parsed.tool_name}_`
                    })

                    return {
                      ...msg,
                      approvalRequest: undefined,
                      parts
                    }
                  })
                )
              } else if (event === 'cancelled') {
                // 被取消
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== aiMessageId) return msg

                    const parts = [...msg.parts]
                    parts.push({
                      type: 'text',
                      content: '\n\n_已停止生成_'
                    })

                    return {
                      ...msg,
                      isStreaming: false,
                      parts
                    }
                  })
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
                  prev.map((msg) => {
                    if (msg.id !== aiMessageId) return msg

                    const parts = [...msg.parts]
                    parts.push({
                      type: 'text',
                      content: `\n\n_错误：${parsed.message || '未知错误'}_`
                    })

                    return {
                      ...msg,
                      isStreaming: false,
                      parts
                    }
                  })
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
    setCurrentSessionId,
    sendMessage,
    stopStreaming,
    setMessages,
  }
}
