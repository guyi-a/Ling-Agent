import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'

export interface MessagePart {
  type: 'text' | 'tool' | 'image'
  content?: string  // for text
  imageUrl?: string  // for image (preview URL or workspace path)
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
  }
}

// 辅助函数：获取消息的纯文本内容
export function getMessageContent(message: Message): string {
  return message.parts
    .filter(p => p.type === 'text')
    .map(p => p.content || '')
    .join('')
}

const STREAMING_SESSION_KEY = 'ling_streaming_session'

export function useSSEChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<Message[]>([])
  messagesRef.current = messages
  const token = useAuthStore((state) => state.token)

  // 组件卸载时清理连接
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // 持久化 streaming session 到 sessionStorage
  // 用 ref 跳过首次 mount（避免 isStreaming=false 在重连读取前清掉 key）
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    if (isStreaming && currentSessionId) {
      sessionStorage.setItem(STREAMING_SESSION_KEY, currentSessionId)
    } else if (!isStreaming) {
      sessionStorage.removeItem(STREAMING_SESSION_KEY)
    }
  }, [isStreaming, currentSessionId])

  /**
   * 处理 SSE 流中的事件，更新消息状态。
   * 复用于 sendMessage 和 reconnect 两条路径。
   */
  const processSSEStream = useCallback(async (
    response: Response,
    aiMessageId: string,
    options?: {
      userMessage?: { id: string }
      initialAccumulated?: string
      initialLastPartWasTool?: boolean
    },
  ) => {
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let accumulated = options?.initialAccumulated ?? ''
    let lastPartWasTool = options?.initialLastPartWasTool ?? false

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
            if (parsed.session_id && (parsed.is_new_session || !currentSessionId)) {
              setCurrentSessionId(parsed.session_id)
            }
            if (parsed.user_message_id && options?.userMessage) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === options.userMessage!.id
                    ? { ...msg, messageId: parsed.user_message_id }
                    : msg
                )
              )
            }
          } else if (event === 'token') {
            if (lastPartWasTool) {
              accumulated = ''
              lastPartWasTool = false
            }

            accumulated += parsed.text
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== aiMessageId) return msg

                const parts = [...msg.parts]
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
            lastPartWasTool = true

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
                      },
                    }
                  : msg
              )
            )
          } else if (event === 'approval_rejected') {
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
            reader?.cancel()
            return  // 终止事件，立即退出
          } else if (event === 'done') {
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
            reader?.cancel()
            return  // 终止事件，立即退出
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
            reader?.cancel()
            return  // 终止事件，立即退出
          }
        } catch (err) {
          console.error('Parse error:', err)
        }
      }
    }
  }, [currentSessionId])

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
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsStreaming(false)
  }, [currentSessionId, token])

  const sendMessage = useCallback(
    async (message: string, attachments?: any[], sessionId?: string, imageParts?: MessagePart[]) => {
      if (!message.trim() || isStreaming) return

      // 添加用户消息（含图片缩略图）
      const parts: MessagePart[] = [{ type: 'text', content: message }]
      if (imageParts && imageParts.length > 0) {
        parts.push(...imageParts)
      }
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        parts,
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
        // 准备请求数据
        const payload: any = { message }
        const targetSessionId = sessionId || currentSessionId
        if (targetSessionId) payload.session_id = targetSessionId
        if (attachments && attachments.length > 0) payload.attachments = attachments

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

        await processSSEStream(response, aiMessageId, { userMessage })
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('Stream aborted')
        } else {
          console.error('Stream error:', error)
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, parts: [{ type: 'text', content: '发生错误，请稍后重试' }], isStreaming: false }
                : msg
            )
          )
        }
      } finally {
        setIsStreaming(false)
        abortControllerRef.current = null
      }
    },
    [isStreaming, currentSessionId, token, processSSEStream]
  )

  /**
   * 重连到一个正在运行的会话流。
   * 使用 subscribe_only 模式：保留 DB 已加载的历史消息，只订阅新事件。
   * 避免 stream_all 回放导致的文字闪烁。
   * 返回 true 表示 Agent 还在运行，false 表示无活跃流。
   */
  const reconnect = useCallback(async (sessionId: string): Promise<boolean> => {
    const currentToken = useAuthStore.getState().token
    if (!currentToken) return false

    try {
      abortControllerRef.current = new AbortController()
      const response = await fetch(`/api/chat/${sessionId}/resume?subscribe_only=true`, {
        headers: { Authorization: `Bearer ${currentToken}` },
        signal: abortControllerRef.current.signal,
      })

      // 204 = 无活跃流
      if (response.status === 204) return false
      if (!response.ok) return false

      // 有活跃流 — 设置 streaming 状态
      setIsStreaming(true)

      // 保留 DB 已加载的消息，找到最后一条 assistant 消息复用，
      // 或在末尾追加一条空的 streaming 消息
      const aiMessageId = `reconnect-${Date.now()}`

      // 从 ref 读取当前消息（避免 setMessages 回调的 React 时序问题）
      const currentMsgs = messagesRef.current
      let initialAccumulated = ''
      let initialLastPartWasTool = false
      let lastAssistantIdx = -1

      for (let i = currentMsgs.length - 1; i >= 0; i--) {
        if (currentMsgs[i].role === 'assistant') {
          lastAssistantIdx = i
          break
        }
      }

      if (lastAssistantIdx >= 0) {
        const parts = currentMsgs[lastAssistantIdx].parts
        if (parts.length > 0) {
          const lastPart = parts[parts.length - 1]
          initialLastPartWasTool = lastPart.type === 'tool'
          if (lastPart.type === 'text') {
            initialAccumulated = lastPart.content || ''
          }
        }
      }

      setMessages(prev => {
        // 找最后一条 assistant 消息复用
        let idx = -1
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === 'assistant') { idx = i; break }
        }
        if (idx >= 0) {
          return prev.map((msg, i) =>
            i === idx ? { ...msg, id: aiMessageId, isStreaming: true } : msg
          )
        }
        return [...prev, {
          id: aiMessageId,
          role: 'assistant' as const,
          parts: [],
          isStreaming: true,
        }]
      })

      await processSSEStream(response, aiMessageId, {
        initialAccumulated,
        initialLastPartWasTool,
      })

      return true
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Reconnect error:', error)
      }
      return false
    } finally {
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }, [processSSEStream])

  return {
    messages,
    isStreaming,
    currentSessionId,
    setCurrentSessionId,
    sendMessage,
    stopStreaming,
    setMessages,
    reconnect,
  }
}
