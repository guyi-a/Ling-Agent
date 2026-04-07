import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageSquare, Send, StopCircle, Loader2, CheckCircle, Clock, Paperclip, Save, X, Sun, Moon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSSEChat, getMessageContent, type MessagePart } from '@/hooks/useSSEChat'
import { useThemeStore } from '@/stores/themeStore'
import SessionSidebar from '@/components/SessionSidebar'
import WorkspacePanel from '@/components/WorkspacePanel'
import ApprovalCard from '@/components/ApprovalCard'
import FileSelector from '@/components/FileSelector'
import AttachmentChip from '@/components/AttachmentChip'
import MessageActions from '@/components/MessageActions'
import { chatApi } from '@/api/chat'
import { messagesApi } from '@/api/messages'
import type { WorkspaceFile } from '@/types'

export default function ChatPage() {
  const [message, setMessage] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<WorkspaceFile[]>([])
  const [fileSelectorOpen, setFileSelectorOpen] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { messages, isStreaming, currentSessionId, sendMessage, stopStreaming, setMessages } = useSSEChat()
  const { isDark, toggleTheme } = useThemeStore()

  // 加载会话历史消息
  const loadSessionHistory = useCallback(async (sessionId: string) => {
    try {
      const response = await chatApi.getHistory(sessionId)
      // API返回的格式: {session_id, messages: [{role, content, message_id?, extra_data?}]}
      // 转换为新的 parts 格式
      const rawMessages = (response.messages || []).map((msg: any, idx: number) => {
        const parts: MessagePart[] = []

        // 解析 extra_data 中的 tool_calls
        let extraData: any = {}
        if (msg.extra_data) {
          try {
            extraData = typeof msg.extra_data === 'string' ? JSON.parse(msg.extra_data) : msg.extra_data
          } catch (e) {
            console.warn('解析 extra_data 失败:', e)
          }
        }

        // 如果有 tool_calls，重建交错的 parts
        if (msg.role === 'assistant' && extraData.tool_calls && Array.isArray(extraData.tool_calls)) {
          // assistant 消息带 tool_calls：先添加文本（如果有），然后添加工具
          if (msg.content) {
            parts.push({ type: 'text' as const, content: msg.content })
          }
          extraData.tool_calls.forEach((tc: any) => {
            // 如果是 Skill 工具，从 args 中提取实际技能名
            let displayName = tc.name
            if (tc.name === 'Skill' && tc.args?.skill) {
              displayName = tc.args.skill
            }

            parts.push({
              type: 'tool' as const,
              toolName: displayName,
              toolStatus: 'done' as const  // 历史消息中的工具都是已完成的
            })
          })
        } else {
          // 普通消息：只有文本
          if (msg.content) {
            parts.push({ type: 'text' as const, content: msg.content })
          }
        }

        return {
          id: `history-${sessionId}-${idx}`,
          messageId: msg.message_id,
          role: msg.role,
          parts,
          isStreaming: false,
        }
      })

      // 合并连续的同角色消息（特别是 assistant 的多段回复）
      const mergedMessages: typeof rawMessages = []
      for (const msg of rawMessages) {
        const lastMsg = mergedMessages[mergedMessages.length - 1]

        // 如果当前消息和上一条消息角色相同，合并 parts
        if (lastMsg && lastMsg.role === msg.role) {
          lastMsg.parts = [...lastMsg.parts, ...msg.parts]
          // 保留第一条消息的 messageId
        } else {
          mergedMessages.push(msg)
        }
      }

      setMessages(mergedMessages)
    } catch (error) {
      console.error('加载历史消息失败:', error)
      setMessages([])
    }
  }, [setMessages])

  const handleSend = () => {
    if (!message.trim() || isStreaming) return

    // 构建 attachments 参数
    const attachments = selectedFiles.map(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)

      return {
        type: isImage ? 'image' : 'file' as 'image' | 'file',
        path: file.path,
        size: file.size
      }
    })

    sendMessage(message, attachments.length > 0 ? attachments : undefined, selectedSessionId || undefined)
    setMessage('')
    setSelectedFiles([])  // 清空选中文件
  }

  // 复制消息
  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
  }

  // 删除消息
  const handleDeleteMessage = async (messageId?: string) => {
    if (!messageId) {
      alert('无法删除：消息ID不存在')
      return
    }

    if (!confirm('确定删除这条消息？')) return

    try {
      await messagesApi.delete(messageId)
      // 从本地状态中移除
      setMessages(prev => prev.filter(m => m.messageId !== messageId))
    } catch (error) {
      console.error('删除失败:', error)
      alert('删除失败，请重试')
    }
  }

  // 重新生成（只对最后一条 AI 消息有效）
  const handleRegenerate = async (messageId?: string) => {
    if (!messageId) {
      alert('无法重新生成：消息ID不存在')
      return
    }

    // 1. 找到该 AI 消息的索引
    const msgIndex = messages.findIndex(m => m.messageId === messageId)
    if (msgIndex <= 0) return

    // 2. 找到上一条用户消息
    const prevUserMsg = messages[msgIndex - 1]
    if (prevUserMsg.role !== 'user') return

    try {
      // 3. 删除当前 AI 消息
      await messagesApi.delete(messageId)
      setMessages(prev => prev.filter(m => m.messageId !== messageId))

      // 4. 重新发送用户消息
      sendMessage(prevUserMsg.content, undefined, selectedSessionId || undefined)
    } catch (error) {
      console.error('重新生成失败:', error)
      alert('重新生成失败，请重试')
    }
  }

  // 开始编辑用户消息
  const handleStartEdit = (messageId: string, currentContent: string) => {
    setEditingMessageId(messageId)
    setEditContent(currentContent)
  }

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingMessageId(null)
    setEditContent('')
  }

  // 保存编辑后的消息
  const handleSaveEdit = async (messageId?: string) => {
    if (!messageId || !editContent.trim()) return
    if (!selectedSessionId && !currentSessionId) return

    const sessionId = selectedSessionId || currentSessionId
    if (!sessionId) return

    if (!confirm('编辑后将删除该消息之后的所有对话，是否继续？')) {
      handleCancelEdit()
      return
    }

    try {
      // 1. 删除该消息及之后的所有消息
      await messagesApi.deleteAfter(sessionId, messageId, true)

      // 2. 重新加载历史
      await loadSessionHistory(sessionId)

      // 3. 发送编辑后的消息
      sendMessage(editContent, undefined, sessionId)

      // 4. 清理编辑状态
      handleCancelEdit()
    } catch (error) {
      console.error('编辑失败:', error)
      alert('编辑失败，请重试')
    }
  }

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 切换会话时加载历史消息
  useEffect(() => {
    if (selectedSessionId && selectedSessionId !== currentSessionId) {
      loadSessionHistory(selectedSessionId)
    } else if (!selectedSessionId && !currentSessionId) {
      // 只有在没有任何会话时才清空消息
      setMessages([])
    }
  }, [selectedSessionId, currentSessionId, loadSessionHistory, setMessages])

  // 当新会话被创建时，更新 selectedSessionId
  useEffect(() => {
    if (currentSessionId && currentSessionId !== selectedSessionId) {
      setSelectedSessionId(currentSessionId)
    }
  }, [currentSessionId, selectedSessionId])

  const handleSessionSelect = (sessionId: string | null) => {
    setSelectedSessionId(sessionId)
  }

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-gray-900">
      {/* Left Sidebar - Sessions */}
      <SessionSidebar
        currentSessionId={currentSessionId || selectedSessionId}
        onSelectSession={handleSessionSelect}
        onSessionsChange={() => {
          // 会话列表变化时的回调
        }}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 gradient-bg-light">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center shadow-lg">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-semibold bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
                Ling-Agent
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title={isDark ? '切换到浅色模式' : '切换到深色模式'}
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              {isStreaming && (
                <button
                  onClick={stopStreaming}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors"
                >
                  <StopCircle className="w-4 h-4" />
                  停止生成
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto p-4 relative">
          {/* 浮动气泡背景 */}
          <div className="floating-bubbles">
            <div className="bubble"></div>
            <div className="bubble"></div>
            <div className="bubble"></div>
            <div className="bubble"></div>
            <div className="bubble"></div>
          </div>

          <div className="max-w-4xl mx-auto space-y-4 relative z-10">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-20">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p>开始与 AI 助手对话</p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} message-enter`}
                >
                  <div
                    className={`group relative max-w-[80%] px-4 py-3 rounded-xl ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow'
                        : 'bg-white dark:bg-gray-800 shadow-md hover:shadow-lg border border-gray-200 dark:border-gray-700 transition-all'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <>
                        {/* 用户消息 - 支持编辑模式 */}
                        {editingMessageId === msg.messageId ? (
                          <div className="space-y-2">
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full min-h-[100px] px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={handleCancelEdit}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                              >
                                <X className="w-3 h-3" />
                                取消
                              </button>
                              <button
                                onClick={() => handleSaveEdit(msg.messageId)}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors"
                              >
                                <Save className="w-3 h-3" />
                                保存
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="whitespace-pre-wrap">{getMessageContent(msg)}</p>
                            {/* 用户消息操作菜单 */}
                            {!msg.isStreaming && msg.messageId && (
                              <MessageActions
                                role="user"
                                onCopy={() => handleCopyMessage(getMessageContent(msg))}
                                onEdit={() => handleStartEdit(msg.messageId!, getMessageContent(msg))}
                                onDelete={() => handleDeleteMessage(msg.messageId)}
                              />
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        {/* AI 消息 - 按 parts 顺序渲染 */}
                        <div className="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 leading-loose [&>*]:mb-4">
                          {msg.parts.map((part, partIdx) => {
                            if (part.type === 'text' && part.content) {
                              return (
                                <ReactMarkdown key={partIdx} remarkPlugins={[remarkGfm]}>
                                  {part.content}
                                </ReactMarkdown>
                              )
                            }

                            if (part.type === 'tool') {
                              return (
                                <div key={partIdx} className="flex items-center gap-2 px-3 py-2 my-2 bg-gray-100 dark:bg-gray-700 rounded-md text-sm not-prose">
                                  {part.toolStatus === 'pending' && (
                                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                                  )}
                                  {part.toolStatus === 'done' && (
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                  )}
                                  {part.toolStatus === 'rejected' && (
                                    <Clock className="w-4 h-4 text-orange-500" />
                                  )}
                                  <span className="font-mono text-gray-700 dark:text-gray-300">
                                    {part.toolName}
                                  </span>
                                  <span className="text-gray-500 dark:text-gray-400">
                                    {part.toolStatus === 'pending' && '执行中...'}
                                    {part.toolStatus === 'done' && '完成'}
                                    {part.toolStatus === 'rejected' && '等待审批'}
                                  </span>
                                </div>
                              )
                            }

                            return null
                          })}
                        </div>

                        {/* 审批卡片 */}
                        {msg.approvalRequest && (
                          <ApprovalCard
                            requestId={msg.approvalRequest.requestId}
                            toolName={msg.approvalRequest.toolName}
                            toolInput={msg.approvalRequest.toolInput}
                            initialRemaining={msg.approvalRequest.remaining}
                            onComplete={() => {
                              setMessages((prev) =>
                                prev.map((m) =>
                                  m.id === msg.id ? { ...m, approvalRequest: undefined } : m
                                )
                              )
                            }}
                          />
                        )}

                        {/* 流式加载指示器（带打字机光标） */}
                        {msg.isStreaming && msg.parts.length > 0 && (
                          <span className="typing-cursor inline-block"></span>
                        )}
                        {msg.isStreaming && msg.parts.length === 0 && (
                          <div className="flex items-center gap-2 mt-2 text-gray-500 dark:text-gray-400">
                            <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                            <span className="text-sm">AI 正在思考...</span>
                          </div>
                        )}

                        {/* AI 消息操作菜单 */}
                        {!msg.isStreaming && msg.messageId && (
                          <MessageActions
                            role="assistant"
                            isLastAssistantMessage={
                              idx === messages.length - 1 ||
                              (idx === messages.length - 2 && messages[messages.length - 1].isStreaming)
                            }
                            onCopy={() => handleCopyMessage(getMessageContent(msg))}
                            onRegenerate={() => handleRegenerate(msg.messageId)}
                            onDelete={() => handleDeleteMessage(msg.messageId)}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input */}
        <footer className="border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
          <div className="max-w-4xl mx-auto">
            {/* 附件卡片展示区 */}
            {selectedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedFiles.map(file => (
                  <AttachmentChip
                    key={file.path}
                    file={file}
                    onRemove={() => setSelectedFiles(prev => prev.filter(f => f.path !== file.path))}
                  />
                ))}
              </div>
            )}

            {/* 输入框和按钮 */}
            <div className="flex gap-2">
              <button
                onClick={() => setFileSelectorOpen(true)}
                disabled={!selectedSessionId && !currentSessionId || isStreaming}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="附加文件"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="发消息与 AI 助手对话..."
                disabled={isStreaming}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleSend}
                disabled={!message.trim() || isStreaming}
                className="px-4 py-2 bg-gradient-to-r from-primary-500 to-accent-600 text-white rounded-lg hover:from-primary-600 hover:to-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* Right Sidebar - Workspace */}
      <WorkspacePanel sessionId={currentSessionId || selectedSessionId} isStreaming={isStreaming} />

      {/* File Selector Modal */}
      <FileSelector
        sessionId={currentSessionId || selectedSessionId}
        open={fileSelectorOpen}
        onClose={() => setFileSelectorOpen(false)}
        onSelect={(files) => {
          setSelectedFiles(prev => [...prev, ...files.filter(f => !prev.some(p => p.path === f.path))])
          setFileSelectorOpen(false)
        }}
      />
    </div>
  )
}
