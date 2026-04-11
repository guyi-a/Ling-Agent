import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageSquare, Send, StopCircle, Loader2, CheckCircle, Clock, Paperclip, Save, X, Sun, Moon, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSSEChat, getMessageContent, type MessagePart } from '@/hooks/useSSEChat'
import { useThemeStore } from '@/stores/themeStore'
import SessionSidebar from '@/components/SessionSidebar'
import WorkspacePanel from '@/components/WorkspacePanel'
import PreviewPanel from '@/components/PreviewPanel'
import ApprovalCard from '@/components/ApprovalCard'
import FileSelector from '@/components/FileSelector'
import AttachmentChip from '@/components/AttachmentChip'
import MessageActions from '@/components/MessageActions'
import { chatApi } from '@/api/chat'
import { messagesApi } from '@/api/messages'
import { workspaceApi } from '@/api/workspace'
import type { WorkspaceFile } from '@/types'

interface PastedImage {
  file: File
  previewUrl: string
  uploading: boolean
  uploadedPath?: string
}

export default function ChatPage() {
  const [message, setMessage] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<WorkspaceFile[]>([])
  const [fileSelectorOpen, setFileSelectorOpen] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState('')
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null)
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { messages, isStreaming, currentSessionId, setCurrentSessionId, sendMessage, stopStreaming, setMessages } = useSSEChat()
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
            const isSkill = tc.name === 'Skill'
            let displayName = tc.name
            if (isSkill && tc.args?.command) {
              displayName = tc.args.command
            }

            parts.push({
              type: 'tool' as const,
              toolName: displayName,
              toolStatus: 'done' as const,  // 历史消息中的工具都是已完成的
              isSkill,
              toolInput: tc.args,
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

  // 粘贴图片处理
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    const sessionId = selectedSessionId || currentSessionId
    if (!sessionId) return

    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) continue

      const file = item.getAsFile()
      if (!file) continue

      e.preventDefault()

      const previewUrl = URL.createObjectURL(file)

      // 先添加预览（uploading 状态）
      const newImage: PastedImage = { file, previewUrl, uploading: true }
      setPastedImages(prev => [...prev, newImage])

      // 上传到后端
      try {
        const result = await workspaceApi.upload(sessionId, file)
        setPastedImages(prev =>
          prev.map(img =>
            img.previewUrl === previewUrl
              ? { ...img, uploading: false, uploadedPath: result.path }
              : img
          )
        )
      } catch (err) {
        console.error('图片上传失败:', err)
        URL.revokeObjectURL(previewUrl)
        setPastedImages(prev => prev.filter(img => img.previewUrl !== previewUrl))
      }
    }
  }, [selectedSessionId, currentSessionId])

  // 移除粘贴的图片
  const removePastedImage = useCallback((previewUrl: string) => {
    URL.revokeObjectURL(previewUrl)
    setPastedImages(prev => prev.filter(img => img.previewUrl !== previewUrl))
  }, [])

  const handleSend = () => {
    if (!message.trim() && pastedImages.filter(p => p.uploadedPath).length === 0) return
    if (isStreaming) return

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

    // 合并粘贴图片的 attachments
    const imageAttachments = pastedImages
      .filter(img => img.uploadedPath)
      .map(img => ({ type: 'image' as const, path: img.uploadedPath! }))

    const allAttachments = [...attachments, ...imageAttachments]

    sendMessage(message || '(图片)', allAttachments.length > 0 ? allAttachments : undefined, selectedSessionId || undefined)
    setMessage('')
    setSelectedFiles([])
    // 清理粘贴图片预览
    pastedImages.forEach(img => URL.revokeObjectURL(img.previewUrl))
    setPastedImages([])
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
      const userContent = getMessageContent(prevUserMsg)
      if (!userContent.trim()) return
      sendMessage(userContent, undefined, selectedSessionId || undefined)
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

  // 当新会话被创建时（SSE 返回 session_id），同步 selectedSessionId
  useEffect(() => {
    if (currentSessionId && currentSessionId !== selectedSessionId) {
      setSelectedSessionId(currentSessionId)
    }
  }, [currentSessionId, selectedSessionId])

  const handleSessionSelect = async (sessionId: string | null) => {
    // 已经是当前会话，不重复操作
    const activeSessionId = selectedSessionId ?? currentSessionId
    if (sessionId === activeSessionId) return

    setSelectedSessionId(sessionId)
    setCurrentSessionId(sessionId)
    setPreviewUrl(null)
    setPreviewTitle('')

    if (sessionId) {
      await loadSessionHistory(sessionId)
    } else {
      setMessages([])
    }
  }

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-gray-900">
      {/* Left Sidebar - Sessions */}
      <SessionSidebar
        currentSessionId={selectedSessionId ?? currentSessionId}
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

        {/* Preview Panel — 有预览时占满，隐藏聊天区 */}
        {previewUrl && (
          <PreviewPanel
            url={previewUrl}
            title={previewTitle}
            onClose={() => { setPreviewUrl(null); setPreviewTitle('') }}
          />
        )}

        {/* Messages — 预览时隐藏 */}
        <main className={`${previewUrl ? 'hidden' : 'flex-1'} overflow-y-auto p-4 relative`}>
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
              <div className="text-center text-gray-500 dark:text-gray-400 py-16">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="mb-8">开始与 AI 助手对话</p>
                <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto">
                  {[
                    { icon: '🌐', title: '搜索资讯', cases: [
                      '搜索一下最近有什么重大的 AI 新闻，帮我整理成摘要',
                      '帮我搜索最新的科技行业融资动态',
                      '搜一下今年最值得关注的开源项目有哪些',
                    ]},
                    { icon: '📝', title: '生成文档', cases: [
                      '帮我生成一份唐诗宋词精选集 PDF，要排版精美',
                      '帮我写一份产品需求文档（PRD）模板',
                      '生成一份周报模板，包含本周完成、下周计划和风险项',
                    ]},
                    { icon: '💻', title: '开发应用', cases: [
                      '帮我做一个番茄钟计时器，有倒计时动画、专注统计和历史记录',
                      '做一个个人记账本，能记录收支、按分类统计、显示月度图表',
                      '帮我做一个天气仪表盘，展示实时天气、温度趋势和空气质量',
                    ]},
                    { icon: '📊', title: '分析数据', cases: [
                      '帮我分析上传的 CSV 数据，生成可视化图表和分析报告',
                      '帮我清洗数据，去除重复值和异常值，输出数据质量报告',
                      '帮我做一个销售数据的月度趋势分析，找出增长和下滑的关键原因',
                    ]},
                  ].map((item) => {
                    const isExpanded = expandedSuggestion === item.title
                    return (
                      <div
                        key={item.title}
                        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm overflow-hidden flex flex-col"
                      >
                        {/* Header: icon + title + expand toggle */}
                        <div
                          className="flex items-center gap-2 px-5 pt-4 pb-2 cursor-pointer hover:bg-white/80 dark:hover:bg-gray-800/80 transition-colors"
                          onClick={() => setExpandedSuggestion(isExpanded ? null : item.title)}
                        >
                          <span className="text-xl">{item.icon}</span>
                          <span className="text-base font-medium text-gray-800 dark:text-gray-200">{item.title}</span>
                          <ChevronRight className={`w-4 h-4 ml-auto text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                        </div>

                        {/* Cases list */}
                        <div className="px-3 pb-3 space-y-1 flex-1 flex flex-col">
                          {/* First case — always visible */}
                          <button
                            onClick={() => { setMessage(item.cases[0]); setExpandedSuggestion(null) }}
                            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 dark:hover:text-primary-300 transition-colors leading-relaxed flex-1"
                          >
                            {item.cases[0]}
                          </button>

                          {/* More cases — shown when expanded */}
                          {isExpanded && item.cases.slice(1).map((c) => (
                            <button
                              key={c}
                              onClick={() => { setMessage(c); setExpandedSuggestion(null) }}
                              className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 dark:hover:text-primary-300 transition-colors leading-relaxed"
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
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
                              const toolKey = `${msg.id}-${partIdx}`
                              const isExpanded = expandedTools.has(toolKey)
                              const canExpand = !part.isSkill && part.toolStatus === 'done' && (part.toolInput || part.toolOutput)

                              return (
                                <div key={partIdx} className="my-2 not-prose">
                                  <div
                                    className={`flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-sm ${canExpand ? 'cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600' : ''} ${isExpanded ? 'rounded-t-md' : 'rounded-md'}`}
                                    onClick={() => {
                                      if (!canExpand) return
                                      setExpandedTools(prev => {
                                        const next = new Set(prev)
                                        if (next.has(toolKey)) next.delete(toolKey)
                                        else next.add(toolKey)
                                        return next
                                      })
                                    }}
                                  >
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
                                      {part.isSkill ? (
                                        <>
                                          {part.toolStatus === 'pending' && '加载中...'}
                                          {part.toolStatus === 'done' && '加载完成'}
                                          {part.toolStatus === 'rejected' && '等待审批'}
                                        </>
                                      ) : (
                                        <>
                                          {part.toolStatus === 'pending' && '调用中...'}
                                          {part.toolStatus === 'done' && '调用成功'}
                                          {part.toolStatus === 'rejected' && '等待审批'}
                                        </>
                                      )}
                                    </span>
                                    {canExpand && (
                                      <ChevronRight className={`w-4 h-4 ml-auto text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                    )}
                                  </div>
                                  {isExpanded && (
                                    <div className="border border-t-0 border-gray-200 dark:border-gray-600 rounded-b-md bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs">
                                      {part.toolInput && Object.keys(part.toolInput).length > 0 && (
                                        <div className="mb-2">
                                          <div className="text-gray-400 dark:text-gray-500 mb-1 font-medium">输入</div>
                                          <pre className="whitespace-pre-wrap break-all text-gray-600 dark:text-gray-300 font-mono bg-gray-100 dark:bg-gray-700 rounded p-2 max-h-40 overflow-auto">
                                            {JSON.stringify(part.toolInput, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                      {part.toolOutput && (
                                        <div>
                                          <div className="text-gray-400 dark:text-gray-500 mb-1 font-medium">输出</div>
                                          <pre className="whitespace-pre-wrap break-all text-gray-600 dark:text-gray-300 font-mono bg-gray-100 dark:bg-gray-700 rounded p-2 max-h-40 overflow-auto">
                                            {part.toolOutput.length > 500 ? part.toolOutput.slice(0, 500) + '...' : part.toolOutput}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  )}
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
            {/* 附件和粘贴图片预览区 */}
            {(selectedFiles.length > 0 || pastedImages.length > 0) && (
              <div className="flex flex-wrap items-center gap-2 mb-3 ml-11">
                {selectedFiles.map(file => (
                  <AttachmentChip
                    key={file.path}
                    file={file}
                    onRemove={() => setSelectedFiles(prev => prev.filter(f => f.path !== file.path))}
                  />
                ))}
                {pastedImages.map((img) => (
                  <div key={img.previewUrl} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 flex-shrink-0">
                    <img src={img.previewUrl} className="w-full h-full object-cover" alt="粘贴的图片" />
                    {img.uploading && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                      </div>
                    )}
                    <button
                      onClick={() => removePastedImage(img.previewUrl)}
                      className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
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
                onPaste={handlePaste}
                placeholder="发消息与 AI 助手对话...（支持粘贴图片）"
                disabled={isStreaming}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleSend}
                disabled={(!message.trim() && pastedImages.filter(p => p.uploadedPath).length === 0) || isStreaming}
                className="px-4 py-2 bg-gradient-to-r from-primary-500 to-accent-600 text-white rounded-lg hover:from-primary-600 hover:to-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* Right Sidebar - Workspace */}
      <WorkspacePanel
        sessionId={selectedSessionId ?? currentSessionId}
        isStreaming={isStreaming}
        onOpenPreview={(url, title) => { setPreviewUrl(url); setPreviewTitle(title) }}
      />

      {/* File Selector Modal */}
      <FileSelector
        sessionId={selectedSessionId ?? currentSessionId}
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
