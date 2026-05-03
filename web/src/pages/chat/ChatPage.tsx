import { useState, useRef, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Send, StopCircle, Loader2, CheckCircle, Clock, Paperclip, Save, X, Sun, Moon, ChevronRight, Search, Ban, Shield, Zap, Wrench } from 'lucide-react'
import Logo from '@/components/Logo'
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
import { useSettingsStore } from '@/stores/settingsStore'
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
  const contentPrefix = s.match(/^content=["']/)
  if (contentPrefix) {
    const quote = s[8]
    const tailMatch = s.match(/\s+(?:name=|tool_call_id=)/)
    if (tailMatch && tailMatch.index) {
      s = s.slice(9, tailMatch.index)
      if (s.endsWith(quote)) s = s.slice(0, -1)
    }
  }
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
        const isDiffField = key === 'old_string' || key === 'new_string'
        const diffColor = key === 'old_string'
          ? 'text-red-500 dark:text-red-400'
          : key === 'new_string'
            ? 'text-green-500 dark:text-green-400'
            : 'text-gray-500 dark:text-gray-400'
        return (
          <div key={key}>
            <div className={`text-[11px] font-mono mb-0.5 ${diffColor}`}>{key}:</div>
            <div className={isDiffField ? 'max-h-40 overflow-auto rounded' : ''}>
              <SyntaxHighlighter
                style={isDark ? oneDark : oneLight}
                language={lang}
                customStyle={{ margin: 0, fontSize: '0.75rem', borderRadius: '0.375rem' }}
              >
                {display}
              </SyntaxHighlighter>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ChatPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [sendDisabled, setSendDisabled] = useState(true)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [sessionTitle, setSessionTitle] = useState<string>('')
  const [selectedFiles, setSelectedFiles] = useState<WorkspaceFile[]>([])
  const [fileSelectorOpen, setFileSelectorOpen] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState('')
  const [collapsedTools, setCollapsedTools] = useState<Set<string>>(new Set())
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null)
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([])
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [approvalMenuOpen, setApprovalMenuOpen] = useState(false)
  const approvalBtnRef = useRef<HTMLDivElement>(null)
  const { approvalMode, setApprovalMode } = useSettingsStore()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const [deleteAfterDialogOpen, setDeleteAfterDialogOpen] = useState(false)
  const [deletingAfterMessageId, setDeletingAfterMessageId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(256)
  const [workspaceWidth, setWorkspaceWidth] = useState(320)
  const [isDragging, setIsDragging] = useState<'left' | 'right' | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const loadIdRef = useRef(0)
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
    const loadId = ++loadIdRef.current
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

        // handoff 消息：还原为 handoff part
        if (msg.role === 'assistant' && extraData.handoff) {
          parts.push({
            type: 'handoff' as const,
            agentName: extraData.handoff.to,
            handoffDirection: extraData.handoff.direction as 'to' | 'back',
          })
        }

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

        // 恢复审批状态：只恢复真正待处理的审批（会话最后一条消息，且内容不含"停止"标记）
        let approvalRequest = undefined
        const isLastMessage = idx === (response.messages || []).length - 1
        const contentStr = typeof msg.content === 'string' ? msg.content : ''
        const isCancelledApproval = contentStr.includes('停止生成') || contentStr.includes('已停止')
        if (msg.role === 'assistant' && pendingApproval && isLastMessage && !isCancelledApproval) {
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

      const INITIAL_COUNT = 10
      if (mergedMessages.length > INITIAL_COUNT) {
        setMessages(mergedMessages.slice(-INITIAL_COUNT))
        const schedule = window.requestIdleCallback || ((cb: IdleRequestCallback) => setTimeout(cb, 50))
        schedule(() => {
          if (loadIdRef.current === loadId) {
            setMessages(mergedMessages)
          }
        })
      } else {
        setMessages(mergedMessages)
      }
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
    const message = inputRef.current?.value?.trim() || ''
    if (!message && pastedImages.filter(p => p.uploadedPath).length === 0) return
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
    if (inputRef.current) inputRef.current.value = ''
    setSendDisabled(true)
    setSelectedFiles([])
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
      setIsLoadingHistory(true)
      await loadSessionHistory(sessionId)
      setIsLoadingHistory(false)
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

  // 拖拽调整面板宽度
  const handleResizeStart = useCallback((side: 'left' | 'right') => (e: ReactMouseEvent) => {
    e.preventDefault()
    setIsDragging(side)
    const startX = e.clientX
    const startWidth = side === 'left' ? sidebarWidth : workspaceWidth

    const onMouseMove = (ev: globalThis.MouseEvent) => {
      const delta = ev.clientX - startX
      if (side === 'left') {
        setSidebarWidth(Math.min(400, Math.max(200, startWidth + delta)))
      } else {
        setWorkspaceWidth(Math.min(500, Math.max(240, startWidth - delta)))
      }
    }

    const onMouseUp = () => {
      setIsDragging(null)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [sidebarWidth, workspaceWidth])

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-[#1a1a24]">
      {/* 拖拽时全局 overlay，防止 iframe 拦截和文本选中 */}
      {isDragging && (
        <div className="fixed inset-0 z-50" style={{ cursor: 'col-resize' }} />
      )}

      {/* Left Sidebar - Sessions */}
      <SessionSidebar
        currentSessionId={selectedSessionId ?? currentSessionId}
        onSelectSession={handleSessionSelect}
        refreshTrigger={sidebarRefresh}
        style={{ width: sidebarWidth }}
      />

      {/* 左侧拖拽手柄 */}
      <div className="relative flex-shrink-0" style={{ width: 0 }}>
        <div
          onMouseDown={handleResizeStart('left')}
          className="absolute inset-y-0 -left-[4px] w-[8px] cursor-col-resize z-10 group"
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] opacity-0 group-hover:opacity-100 bg-primary-400/50 transition-opacity" />
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="border-b border-gray-200 dark:border-gray-800 p-4 bg-white/80 dark:bg-[#22222e]/80 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <Logo size={26} className="flex-shrink-0" />
              <h1 className="text-base font-medium text-gray-900 dark:text-gray-100 truncate" style={{ fontFamily: "'Outfit',system-ui,sans-serif" }}>
                {sessionTitle || <span className="tracking-widest">ing</span>}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors border border-gray-200 dark:border-gray-700/60"
                title="全局搜索 (⌘K)"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline text-xs">搜索</span>
                <kbd className="hidden sm:inline-flex items-center px-1 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-50 dark:bg-white/5 rounded border border-gray-200 dark:border-gray-700/60 ml-1">
                  ⌘K
                </kbd>
              </button>
              <button
                onClick={toggleTheme}
                className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
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
          <div className="max-w-4xl mx-auto space-y-4 relative z-10">
            {isLoadingHistory ? (
              <div className="space-y-4 py-8 animate-pulse">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end pl-20' : 'justify-start pr-20'}`}>
                    <div className={`rounded-xl px-4 py-3 ${i % 2 === 0 ? 'bg-gray-100 dark:bg-gray-800' : 'bg-white dark:bg-white/[0.06] border border-gray-100 dark:border-gray-800'}`}>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-2" />
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-16">
                <div className="mx-auto mb-4 opacity-15">
                  <Logo size={56} />
                </div>
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
                      '帮我做一个情绪轮盘，我想更精确地描述我现在的感受',
                      '帮我做一个呼吸放松练习，我现在有点焦虑',
                      '帮我做一个认知扭曲训练小游戏，我想学会识别自己的思维陷阱',
                    ]},
                    { icon: '🧠', title: '身心健康', cases: [
                      '我今天头有点疼，心情也不太好，帮我记录一下健康日记',
                      '帮我做一个心理健康自评，看看我的焦虑和压力水平',
                      '帮我生成最近的身心健康趋势图表，看看身体和情绪的变化',
                    ]},
                  ].map((item) => {
                    const isExpanded = expandedSuggestion === item.title
                    return (
                      <div
                        key={item.title}
                        className="rounded-xl border border-gray-100 dark:border-gray-800/80 bg-white dark:bg-white/[0.05] overflow-hidden flex flex-col hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-md transition-all"
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
                            onClick={() => { if (inputRef.current) { inputRef.current.value = item.cases[0]; setSendDisabled(false) }; setExpandedSuggestion(null) }}
                            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 dark:hover:text-primary-300 transition-colors leading-relaxed flex-1"
                          >
                            {item.cases[0]}
                          </button>

                          {/* More cases — shown when expanded */}
                          {isExpanded && item.cases.slice(1).map((c) => (
                            <button
                              key={c}
                              onClick={() => { if (inputRef.current) { inputRef.current.value = c; setSendDisabled(false) }; setExpandedSuggestion(null) }}
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
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        : 'bg-white dark:bg-white/[0.06] border border-gray-100 dark:border-gray-800 text-gray-900 dark:text-gray-100'
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

                            if (part.type === 'handoff') {
                              const agentLabels: Record<string, string> = {
                                general: '通用助手',
                                developer: '开发者',
                                psych: '心理顾问',
                                data: '数据分析',
                                document: '文档处理',
                                supervisor: 'Supervisor',
                              }
                              const label = agentLabels[part.agentName ?? ''] ?? part.agentName
                              return (
                                <div key={partIdx} className="my-1.5 not-prose">
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700">
                                    {part.handoffDirection === 'back' ? `↩ ${label}` : label}
                                  </span>
                                </div>
                              )
                            }

                            if (part.type === 'tool') {
                              const toolKey = `${msg.id}-${partIdx}`
                              const defaultCollapsed = part.isSkill || /^(read_file|list_dir)$/.test(part.toolName || '')
                              const toggled = collapsedTools.has(toolKey)
                              const isExpanded = defaultCollapsed ? toggled : !toggled
                              const canExpand = part.toolStatus === 'done' && (part.toolInput || part.toolOutput)

                              return (
                                <div key={partIdx} className="my-2 not-prose">
                                  <div
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 ${canExpand ? 'cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600' : ''}`}
                                    onClick={() => {
                                      if (!canExpand) return
                                      setCollapsedTools(prev => {
                                        const next = new Set(prev)
                                        if (next.has(toolKey)) next.delete(toolKey)
                                        else next.add(toolKey)
                                        return next
                                      })
                                    }}
                                  >
                                    {(part.toolStatus === 'pending' || part.toolStatus === 'generating') && (
                                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                                    )}
                                    {part.toolStatus === 'done' && (
                                      <CheckCircle className="w-4 h-4 text-green-500" />
                                    )}
                                    {part.toolStatus === 'rejected' && (
                                      <Clock className="w-4 h-4 text-orange-500" />
                                    )}
                                    {part.toolStatus === 'cancelled' && (
                                      <Ban className="w-4 h-4 text-gray-400" />
                                    )}
                                    <span className="font-mono text-gray-700 dark:text-gray-300">
                                      {part.toolName}
                                    </span>
                                    <span className="text-gray-500 dark:text-gray-400">
                                      {part.isSkill ? (
                                        <>
                                          {part.toolStatus === 'generating' && '加载中...'}
                                          {part.toolStatus === 'pending' && '加载中...'}
                                          {part.toolStatus === 'done' && '加载完成'}
                                          {part.toolStatus === 'rejected' && '等待审批'}
                                          {part.toolStatus === 'cancelled' && '已取消'}
                                        </>
                                      ) : (
                                        <>
                                          {part.toolStatus === 'generating' && '生成中...'}
                                          {part.toolStatus === 'pending' && '执行中...'}
                                          {part.toolStatus === 'done' && '调用成功'}
                                          {part.toolStatus === 'rejected' && '等待审批'}
                                          {part.toolStatus === 'cancelled' && '已取消'}
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
                                          <div className="max-h-96 overflow-auto rounded">
                                            <ToolInputDisplay data={part.toolInput} isDark={isDark} />
                                          </div>
                                        </div>
                                      )}
                                      {part.toolOutput && (() => {
                                        const cleaned = cleanToolOutput(part.toolOutput)
                                        const display = cleaned.length > 800 ? cleaned.slice(0, 800) + '...' : cleaned
                                        let parsed: any = null
                                        try { parsed = JSON.parse(cleaned) } catch {}
                                        const isArray = Array.isArray(parsed)
                                        const isObj = parsed !== null && typeof parsed === 'object' && !isArray
                                        return (
                                          <div>
                                            <div className="text-gray-400 dark:text-gray-500 mb-1 font-medium">输出</div>
                                            <div className="max-h-60 overflow-auto rounded">
                                              {isArray ? (
                                                <div className="space-y-1.5">
                                                  {parsed.map((item: any, i: number) => (
                                                    <div key={i} className="border border-gray-200 dark:border-gray-600 rounded p-2 text-xs">
                                                      {item.title && <div className="font-medium text-gray-800 dark:text-gray-200 truncate">{item.title}</div>}
                                                      {item.body && <div className="text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{item.body}</div>}
                                                      {(item.href || item.url) && (
                                                        <a href={item.href || item.url} target="_blank" rel="noopener noreferrer"
                                                          className="text-blue-500 hover:underline truncate block mt-0.5">
                                                          {item.href || item.url}
                                                        </a>
                                                      )}
                                                      {item.date && <div className="text-gray-400 dark:text-gray-500 mt-0.5">{item.source ? `${item.source} · ` : ''}{item.date}</div>}
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : isObj ? (
                                                <ToolInputDisplay data={parsed} isDark={isDark} />
                                              ) : (
                                                <SyntaxHighlighter
                                                  style={isDark ? oneDark : oneLight}
                                                  language="text"
                                                  customStyle={{ margin: 0, fontSize: '0.75rem', borderRadius: '0.375rem' }}
                                                >
                                                  {display}
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
                            disabled={!msg.isStreaming}
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
                        {msg.isStreaming && msg.parts.length > 0 && (() => {
                          const lastPart = msg.parts[msg.parts.length - 1]
                          // 工具执行中（pending）：显示跳动圆点
                          if (lastPart.type === 'tool' && (lastPart.toolStatus === 'pending' || lastPart.toolStatus === 'generating')) {
                            return (
                              <div className="flex items-center gap-1 mt-2 ml-1">
                                <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                              </div>
                            )
                          }
                          // 工具完成或文字结尾：内联打字光标
                          return <span className="typing-cursor inline-block"></span>
                        })()}
                        {msg.isStreaming && msg.parts.length === 0 && (
                          <div className="flex items-center gap-2 mt-2 text-gray-500 dark:text-gray-400">
                            <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                            <span className="text-sm">Thinking...</span>
                          </div>
                        )}
                        {msg.isCompacting && (
                          <div className="flex items-center gap-2 mt-3 text-gray-500 dark:text-gray-400">
                            <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                            <span className="text-sm">正在整理对话上下文...</span>
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
        <footer className="border-t border-gray-200 dark:border-gray-800 p-4 bg-white/80 dark:bg-[#22222e]/80 backdrop-blur">
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
                ref={inputRef}
                type="text"
                onChange={(e) => setSendDisabled(!e.target.value.trim())}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                onPaste={handlePaste}
                placeholder="发消息与 AI 助手对话...（支持粘贴图片）"
                disabled={isStreaming}
                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700/80 rounded-xl bg-white dark:bg-white/[0.06] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-400 dark:focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              />
              {/* 审批模式快捷切换 */}
              <div className="relative" ref={approvalBtnRef}>
                <button
                  onClick={() => setApprovalMenuOpen(!approvalMenuOpen)}
                  className={`p-2.5 rounded-xl border transition-colors ${
                    approvalMode === 'auto'
                      ? 'border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                      : approvalMode === 'custom'
                        ? 'border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                  title={`审批模式: ${approvalMode === 'default' ? '默认' : approvalMode === 'auto' ? '自动' : '自定义'}`}
                >
                  {approvalMode === 'auto' ? <Zap className="w-5 h-5" /> : approvalMode === 'custom' ? <Wrench className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
                </button>
              </div>
              <button
                onClick={handleSend}
                disabled={(sendDisabled && pastedImages.filter(p => p.uploadedPath).length === 0) || isStreaming}
                className="px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* 右侧拖拽手柄 */}
      <div className="relative flex-shrink-0" style={{ width: 0 }}>
        <div
          onMouseDown={handleResizeStart('right')}
          className="absolute inset-y-0 -left-[4px] w-[8px] cursor-col-resize z-10 group"
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] opacity-0 group-hover:opacity-100 bg-primary-400/50 transition-opacity" />
        </div>
      </div>

      {/* Right Sidebar - Workspace */}
      <WorkspacePanel
        sessionId={selectedSessionId ?? currentSessionId}
        isStreaming={isStreaming}
        onOpenPreview={(url, title) => { setPreviewUrl(url); setPreviewTitle(title) }}
        style={{ width: workspaceWidth }}
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

      {/* 审批模式下拉菜单（fixed 定位避免被裁切） */}
      {approvalMenuOpen && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setApprovalMenuOpen(false)} />
          <div
            className="fixed z-[70] w-44 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1"
            style={(() => {
              const r = approvalBtnRef.current?.getBoundingClientRect()
              if (!r) return {}
              return { bottom: window.innerHeight - r.top + 6, right: window.innerWidth - r.right }
            })()}
          >
            {([
              { value: 'default' as const, icon: <Shield className="w-4 h-4" />, label: '默认', desc: '高危工具需审批' },
              { value: 'auto' as const, icon: <Zap className="w-4 h-4" />, label: '自动', desc: '全部自动通过' },
              { value: 'custom' as const, icon: <Wrench className="w-4 h-4" />, label: '自定义', desc: '在设置中配置' },
            ]).map(m => (
              <button
                key={m.value}
                onClick={() => { setApprovalMode(m.value); setApprovalMenuOpen(false) }}
                className={`w-full px-3 py-2 flex items-center gap-2.5 text-left transition-colors ${
                  approvalMode === m.value
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {m.icon}
                <div>
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-[11px] opacity-60">{m.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* 全局搜索 */}
      <GlobalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(sessionId) => handleSessionSelect(sessionId)}
      />
    </div>
  )
}
