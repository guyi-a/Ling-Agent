import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageSquare, Send, StopCircle, Loader2, CheckCircle, Clock, Paperclip, Save, X, Sun, Moon, ChevronRight, Search } from 'lucide-react'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useSSEChat, getMessageContent, type MessagePart } from '@/hooks/useSSEChat'
import { useThemeStore } from '@/stores/themeStore'
import SessionSidebar from '@/components/SessionSidebar'
import WorkspacePanel from '@/components/WorkspacePanel'
import PreviewPanel from '@/components/PreviewPanel'
import ApprovalCard from '@/components/ApprovalCard'
import FileSelector from '@/components/FileSelector'
import AttachmentChip from '@/components/AttachmentChip'
import MessageActions from '@/components/MessageActions'
import ConfirmDialog from '@/components/ConfirmDialog'
import GlobalSearchModal from '@/components/GlobalSearchModal'
import { useAuthStore } from '@/stores/authStore'
import { chatApi } from '@/api/chat'
import { messagesApi } from '@/api/messages'
import { sessionsApi } from '@/api/sessions'
import { workspaceApi } from '@/api/workspace'
import type { WorkspaceFile } from '@/types'

interface PastedImage {
  file: File
  previewUrl: string
  uploading: boolean
  uploadedPath?: string
}


// 根据 key 名或内容猜测语言
function guessLang(key: string, value: string): string {
  const lk = key.toLowerCase()
  if (/\.py$/i.test(lk) || lk === 'python') return 'python'
  if (/\.(jsx?|mjs)$/i.test(lk)) return 'javascript'
  if (/\.(tsx?|mts)$/i.test(lk)) return 'typescript'
  if (/\.html?$/i.test(lk) || value.trimStart().startsWith('<!DOCTYPE') || value.trimStart().startsWith('<html')) return 'html'
  if (/\.css$/i.test(lk)) return 'css'
  if (/\.json$/i.test(lk)) return 'json'
  if (/\.(sh|bash)$/i.test(lk)) return 'bash'
  if (/\.sql$/i.test(lk)) return 'sql'
  if (['code', 'content', 'script', 'source', 'body', 'template'].includes(lk)) {
    if (value.includes('def ') || value.includes('import ')) return 'python'
    if (value.includes('function ') || value.includes('const ')) return 'javascript'
    if (value.trimStart().startsWith('<')) return 'html'
  }
  return 'text'
}

// 清理工具输出：提取 ToolMessage 序列化中的 content，替换 \n 为真实换行
function cleanToolOutput(raw: string): string {
  let s = raw
  const m = s.match(/^content=["']([\s\S]*?)["']\s*(?:name=|tool_call_id=|$)/)
  if (m) s = m[1]
  s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
  return s.trim()
}

// 智能渲染工具输入：每个字段单独展示，带语法高亮
function ToolInputDisplay({ data, isDark }: { data: Record<string, any>; isDark: boolean }) {
  const entries = Object.entries(data)
  return (
    <div className="space-y-1.5">
      {entries.map(([key, value]) => {
        const display = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
        const lang = typeof value === 'string' ? guessLang(key, value) : 'json'
        return (
          <div key={key}>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono mb-0.5">{key}:</div>
            <SyntaxHighlighter
              style={isDark ? oneDark : oneLight}
              language={lang}
              customStyle={{ margin: 0, fontSize: '0.75rem', borderRadius: '0.375rem' }}
            >
              {display}
            </SyntaxHighlighter>
          </div>
        )
      })}
    </div>
  )
}

export default function ChatPage() {
  const [message, setMessage] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [sessionTitle, setSessionTitle] = useState<string>('')
  const [selectedFiles, setSelectedFiles] = useState<WorkspaceFile[]>([])
  const [fileSelectorOpen, setFileSelectorOpen] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState('')
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null)
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([])
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const [deleteAfterDialogOpen, setDeleteAfterDialogOpen] = useState(false)
  const [deletingAfterMessageId, setDeletingAfterMessageId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { messages, isStreaming, currentSessionId, setCurrentSessionId, sendMessage, stopStreaming, setMessages, reconnect } = useSSEChat()
  const [sidebarRefresh, setSidebarRefresh] = useState(0)
  const prevStreamingRef = useRef(false)
  const { isDark, toggleTheme } = useThemeStore()
  const token = useAuthStore((state) => state.token)
  const reconnectAttemptedRef = useRef(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const urlSessionId = searchParams.get('session')

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

        // 检查是否有待审批状态
        const pendingApproval = extraData.pending_approval || null

        // 如果有 tool_calls，重建交错的 parts
        // 但如果有 pending_approval，说明工具还没执行（被审批拦截），
        // 不生成 tool card，让审批卡片展示工具信息，审批后 live stream 补上
        if (msg.role === 'assistant' && extraData.tool_calls && Array.isArray(extraData.tool_calls) && !pendingApproval) {
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
              toolStatus: 'done' as const,
              isSkill,
              toolInput: tc.args,
            })
          })
        } else {
          // 普通消息 / 有 pending_approval 时只添加文本
          if (msg.content) {
            parts.push({ type: 'text' as const, content: msg.content })
          }
        }

        // 用户消息：从 extra_data.attachments 恢复图片缩略图
        if (msg.role === 'user' && extraData.attachments && Array.isArray(extraData.attachments)) {
          const imgToken = localStorage.getItem('access_token') || ''
          for (const att of extraData.attachments) {
            if (att.type === 'image' && att.path) {
              parts.push({
                type: 'image' as const,
                imageUrl: `/api/workspace/${sessionId}/download?path=${encodeURIComponent(att.path)}&token=${encodeURIComponent(imgToken)}`,
                content: att.path, // 保存原始路径，用于重新生成时传递 attachments
              })
            }
          }
        }

        // 恢复审批状态
        let approvalRequest = undefined
        if (msg.role === 'assistant' && pendingApproval) {
          approvalRequest = {
            requestId: pendingApproval.request_id,
            toolName: pendingApproval.tool_name,
            toolInput: pendingApproval.tool_input || {},
          }
        }

        return {
          id: `history-${sessionId}-${idx}`,
          messageId: msg.message_id,
          role: msg.role,
          parts,
          isStreaming: false,
          approvalRequest,
        }
      })

      // 将 role="tool" 消息的 content 回填到前面 assistant 消息对应的 tool part
      const allRaw = response.messages || []
      for (let i = 0; i < allRaw.length; i++) {
        if (allRaw[i].role === 'tool' && allRaw[i].content) {
          // 向前找最近的 assistant 消息，匹配还没有 toolOutput 的 tool part
          for (let j = i - 1; j >= 0; j--) {
            if (rawMessages[j]?.role === 'assistant') {
              const toolPart = rawMessages[j].parts.find(
                (p: MessagePart) => p.type === 'tool' && !p.toolOutput
              )
              if (toolPart) {
                toolPart.toolOutput = allRaw[i].content
              }
              break
            }
          }
        }
      }

      // 过滤掉 role="tool" 消息（其 content 已回填到 assistant 的 tool part）
      const visibleMessages = rawMessages.filter((msg: any) => msg.role !== 'tool')

      // 合并连续的同角色消息（特别是 assistant 的多段回复）
      const mergedMessages: typeof rawMessages = []
      for (const msg of visibleMessages) {
        const lastMsg = mergedMessages[mergedMessages.length - 1]

        // 如果当前消息和上一条消息角色相同，合并 parts
        if (lastMsg && lastMsg.role === msg.role) {
          lastMsg.parts = [...lastMsg.parts, ...msg.parts]
          // 保留第一条消息的 messageId，合并 approvalRequest（取最后一个非空的）
          if (msg.approvalRequest) {
            lastMsg.approvalRequest = msg.approvalRequest
          }
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

    // 收集图片文件
    const imageFiles: File[] = []
    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) continue
      const file = item.getAsFile()
      if (file) imageFiles.push(file)
    }
    if (imageFiles.length === 0) return

    e.preventDefault()

    // 如果没有 session，先创建一个
    let sessionId = selectedSessionId || currentSessionId
    if (!sessionId) {
      try {
        const newSession = await sessionsApi.create('')
        sessionId = newSession.session_id
        setSelectedSessionId(sessionId)
        setCurrentSessionId(sessionId)
      } catch (err) {
        console.error('创建会话失败:', err)
        return
      }
    }

    for (const file of imageFiles) {
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
  }, [selectedSessionId, currentSessionId, setCurrentSessionId])

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

    // 构建图片 parts 用于在用户消息气泡中显示缩略图
    const imgParts: MessagePart[] = pastedImages
      .filter(img => img.uploadedPath)
      .map(img => ({ type: 'image' as const, imageUrl: img.previewUrl, content: img.uploadedPath }))

    // 从 selectedFiles 中提取图片
    const selectedImgParts: MessagePart[] = selectedFiles
      .filter(f => {
        const ext = f.name.split('.').pop()?.toLowerCase() || ''
        return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)
      })
      .map(f => ({
        type: 'image' as const,
        imageUrl: `/api/workspace/${selectedSessionId || currentSessionId}/files/uploads/${f.name}`,
      }))

    const allImageParts = [...imgParts, ...selectedImgParts]

    sendMessage(
      message || '(图片)',
      allAttachments.length > 0 ? allAttachments : undefined,
      selectedSessionId || undefined,
      allImageParts.length > 0 ? allImageParts : undefined
    )
    setMessage('')
    setSelectedFiles([])
    // 不 revoke 粘贴图片的 previewUrl — 需要留给消息气泡显示
    setPastedImages([])
  }

  // 复制消息
  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
  }

  // 删除单条消息
  const handleDeleteMessage = (messageId?: string) => {
    if (!messageId) return
    setDeletingMessageId(messageId)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteMessage = async () => {
    if (!deletingMessageId) return
    try {
      await messagesApi.delete(deletingMessageId)
      setMessages(prev => prev.filter(m => m.messageId !== deletingMessageId))
    } catch (error) {
      console.error('删除失败:', error)
    } finally {
      setDeleteDialogOpen(false)
      setDeletingMessageId(null)
    }
  }

  // 从此处删除（删除该消息及之后所有消息）
  const handleDeleteAfter = (messageId?: string) => {
    if (!messageId) return
    setDeletingAfterMessageId(messageId)
    setDeleteAfterDialogOpen(true)
  }

  const confirmDeleteAfter = async () => {
    if (!deletingAfterMessageId) return
    const sessionId = selectedSessionId || currentSessionId
    if (!sessionId) return
    try {
      await messagesApi.deleteAfter(sessionId, deletingAfterMessageId, true)
      await loadSessionHistory(sessionId)
    } catch (error) {
      console.error('删除失败:', error)
    } finally {
      setDeleteAfterDialogOpen(false)
      setDeletingAfterMessageId(null)
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

    const userContent = getMessageContent(prevUserMsg)
    if (!userContent.trim()) return

    // 3. 从原始用户消息中提取附件和图片 parts
    const attachments = prevUserMsg.parts
      .filter(p => p.type === 'image' && p.content)
      .map(p => ({ type: 'image' as const, path: p.content! }))

    const imageParts: MessagePart[] = prevUserMsg.parts.filter(p => p.type === 'image')

    try {
      // 4. 删除 AI 消息和用户消息（后端）
      await messagesApi.delete(messageId)
      if (prevUserMsg.messageId) {
        await messagesApi.delete(prevUserMsg.messageId)
      }

      // 5. 从本地状态中移除两条消息
      setMessages(prev => prev.filter(m =>
        m.messageId !== messageId && m.messageId !== prevUserMsg.messageId
      ))

      // 6. 重新发送（sendMessage 会在 UI 和后端重新创建 user + assistant 消息）
      sendMessage(
        userContent,
        attachments.length > 0 ? attachments : undefined,
        selectedSessionId || undefined,
        imageParts.length > 0 ? imageParts : undefined,
      )
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

  // 页面加载时尝试恢复正在运行的流（SSE 断线重连）
  // 等待 zustand persist 从 localStorage 恢复 token 后再尝试
  // 先加载 DB 历史（已完成的消息），再尝试重连活跃流（追加 streaming 消息）
  useEffect(() => {
    if (reconnectAttemptedRef.current) return
    if (!token) return  // zustand 尚未从 localStorage 恢复 token

    const savedSession = sessionStorage.getItem('ling_streaming_session')
    if (!savedSession) {
      reconnectAttemptedRef.current = true
      return
    }

    reconnectAttemptedRef.current = true
    setSelectedSessionId(savedSession)
    setCurrentSessionId(savedSession)

    // 先从 DB 加载已完成的历史消息，再尝试重连活跃流
    loadSessionHistory(savedSession).then(() => {
      reconnect(savedSession).then((wasActive) => {
        if (!wasActive) {
          // Agent 已结束，DB 历史已加载完毕
          sessionStorage.removeItem('ling_streaming_session')
        }
        // wasActive=true：streaming 消息已追加在历史之后，
        // useSSEChat 的 sessionStorage effect 会在流结束后清理
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]) // token 从 null 变为有效值时触发

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
      // 获取会话标题
      try {
        const session = await sessionsApi.getById(sessionId)
        setSessionTitle(session.title || '')
      } catch {
        setSessionTitle('')
      }
      // 尝试重连活跃流（如切回正在 streaming 的会话，恢复审批卡片/游标等）
      reconnect(sessionId)
    } else {
      setMessages([])
      setSessionTitle('')
    }
  }

  // 流式结束后刷新侧边栏和标题
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      setSidebarRefresh(n => n + 1)
      // 刷新会话标题（首次对话后后端会生成标题）
      const sid = selectedSessionId ?? currentSessionId
      if (sid) {
        sessionsApi.getById(sid).then(s => setSessionTitle(s.title || '')).catch(() => {})
      }
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, selectedSessionId, currentSessionId])

  // 从 URL 参数 ?session=xxx 加载指定会话（SessionsPage 跳转过来）
  const urlSessionHandled = useRef(false)
  useEffect(() => {
    if (!urlSessionId || urlSessionHandled.current) return
    if (!token) return  // 等 token 恢复
    urlSessionHandled.current = true
    // 清除 URL 参数，避免刷新重复触发
    setSearchParams({}, { replace: true })
    handleSessionSelect(urlSessionId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSessionId, token])

  // Cmd+K / Ctrl+K 打开全局搜索
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="h-screen flex bg-[#f5f0e8] dark:bg-gray-900">
      {/* Left Sidebar - Sessions */}
      <SessionSidebar
        currentSessionId={selectedSessionId ?? currentSessionId}
        onSelectSession={handleSessionSelect}
        refreshTrigger={sidebarRefresh}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b border-[#e0d5c3] dark:border-gray-700 p-4 bg-[#fefcf3]/80 dark:bg-gray-800 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center shadow-lg flex-shrink-0">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-base font-medium text-gray-900 dark:text-gray-100 truncate">
                {sessionTitle || 'Ling-Agent'}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors border border-gray-200 dark:border-gray-600"
                title="全局搜索 (⌘K)"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline text-xs">搜索</span>
                <kbd className="hidden sm:inline-flex items-center px-1 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 ml-1">
                  ⌘K
                </kbd>
              </button>
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
                  className={`flex ${msg.role === 'user' ? 'justify-end pl-20' : 'justify-start pr-20'} message-enter`}
                >
                  <div
                    className={`group relative max-w-[95%] px-4 py-3 rounded-xl ${
                      msg.role === 'user'
                        ? 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        : 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
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
                            {/* 图片在文字上方 */}
                            {msg.parts.some(p => p.type === 'image') && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {msg.parts.filter(p => p.type === 'image' && p.imageUrl).map((p, i) => (
                                  <img
                                    key={i}
                                    src={p.imageUrl}
                                    alt="attached"
                                    onClick={() => setLightboxUrl(p.imageUrl!)}
                                    className="max-w-[200px] max-h-[150px] rounded-lg object-cover border border-white/20 cursor-pointer hover:opacity-80 transition-opacity"
                                  />
                                ))}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap">{getMessageContent(msg)}</p>
                            {/* 用户消息操作菜单 */}
                            {!msg.isStreaming && msg.messageId && (
                              <MessageActions
                                role="user"
                                onCopy={() => handleCopyMessage(getMessageContent(msg))}
                                onEdit={() => handleStartEdit(msg.messageId!, getMessageContent(msg))}
                                onDelete={() => handleDeleteMessage(msg.messageId)}
                                onDeleteAfter={() => handleDeleteAfter(msg.messageId)}
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
                                <MarkdownRenderer key={partIdx} content={part.content} />
                              )
                            }

                            if (part.type === 'tool') {
                              const toolKey = `${msg.id}-${partIdx}`
                              const isExpanded = expandedTools.has(toolKey)
                              const canExpand = !part.isSkill && part.toolStatus === 'done' && (part.toolInput || part.toolOutput)

                              return (
                                <div key={partIdx} className="my-2 not-prose">
                                  <div
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 ${canExpand ? 'cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600' : ''}`}
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
                                    <div className="border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs mt-1">
                                      {part.toolInput && Object.keys(part.toolInput).length > 0 && (
                                        <div className="mb-2">
                                          <div className="text-gray-400 dark:text-gray-500 mb-1 font-medium">输入</div>
                                          <div className="max-h-60 overflow-auto rounded">
                                            <ToolInputDisplay data={part.toolInput} isDark={isDark} />
                                          </div>
                                        </div>
                                      )}
                                      {part.toolOutput && (() => {
                                        const cleaned = cleanToolOutput(part.toolOutput.length > 500 ? part.toolOutput.slice(0, 500) + '...' : part.toolOutput)
                                        let parsed: any = null
                                        try { parsed = JSON.parse(cleaned) } catch {}
                                        const isJson = parsed !== null && typeof parsed === 'object'
                                        return (
                                          <div>
                                            <div className="text-gray-400 dark:text-gray-500 mb-1 font-medium">输出</div>
                                            <div className="max-h-40 overflow-auto rounded">
                                              {isJson ? (
                                                <ToolInputDisplay data={parsed} isDark={isDark} />
                                              ) : (
                                                <SyntaxHighlighter
                                                  style={isDark ? oneDark : oneLight}
                                                  language="text"
                                                  customStyle={{ margin: 0, fontSize: '0.75rem', borderRadius: '0.375rem' }}
                                                >
                                                  {cleaned}
                                                </SyntaxHighlighter>
                                              )}
                                            </div>
                                          </div>
                                        )
                                      })()}
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
                            onDeleteAfter={() => handleDeleteAfter(msg.messageId)}
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
        <footer className="border-t border-[#e0d5c3] dark:border-gray-700 p-4 bg-[#fefcf3]/80 dark:bg-gray-800 backdrop-blur">
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

      {/* 图片 Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="preview"
            className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* 删除单条消息确认 */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="删除消息"
        message="确定删除这条消息吗？"
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={confirmDeleteMessage}
        onCancel={() => { setDeleteDialogOpen(false); setDeletingMessageId(null) }}
      />

      {/* 从此处删除确认 */}
      <ConfirmDialog
        open={deleteAfterDialogOpen}
        title="从此处删除"
        message="将删除该消息及之后的所有消息，此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
        variant="warning"
        onConfirm={confirmDeleteAfter}
        onCancel={() => { setDeleteAfterDialogOpen(false); setDeletingAfterMessageId(null) }}
      />

      {/* 全局搜索 */}
      <GlobalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(sessionId) => handleSessionSelect(sessionId)}
      />
    </div>
  )
}
