import { useEffect, useState, useCallback } from 'react'
import { Plus, MessageSquare, Trash2, Edit2, Check, X, Search, Pin, PinOff, SquarePen, Box, Heart, ClipboardList } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { sessionsApi } from '@/api/sessions'
import { useAuthStore } from '@/stores/authStore'
import ConfirmDialog from '@/components/ConfirmDialog'
import UserProfileMenu from '@/components/UserProfileMenu'
import type { Session } from '@/types'

interface SessionSidebarProps {
  currentSessionId: string | null
  onSelectSession: (sessionId: string | null) => void
  onSessionsChange?: () => void
  refreshTrigger?: number
  style?: React.CSSProperties
}

// ─── 时间分组 ───

type TimeGroup = '置顶' | '今天' | '昨天' | '最近 7 天' | '更早'

const GROUP_ORDER: TimeGroup[] = ['置顶', '今天', '昨天', '最近 7 天', '更早']

function getTimeGroup(dateStr: string): TimeGroup {
  const now = new Date()
  const date = new Date(dateStr)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000)
  const startOf7Days = new Date(startOfToday.getTime() - 6 * 86400000)

  if (date >= startOfToday) return '今天'
  if (date >= startOfYesterday) return '昨天'
  if (date >= startOf7Days) return '最近 7 天'
  return '更早'
}

function groupSessions(sessions: Session[]): Map<TimeGroup, Session[]> {
  const groups = new Map<TimeGroup, Session[]>()
  for (const s of sessions) {
    const g = s.is_pinned ? '置顶' : getTimeGroup(s.updated_at)
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(s)
  }
  return groups
}

export default function SessionSidebar({ currentSessionId, onSelectSession, onSessionsChange, refreshTrigger, style }: SessionSidebarProps) {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true)
      const data = await sessionsApi.getAll({ limit: 200 })
      const sorted = data.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      setSessions(sorted)
    } catch (error) {
      console.error('加载会话列表失败:', error)
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      loadSessions()
    } else {
      setLoading(false)
    }
  }, [isAuthenticated, loadSessions])

  // refreshTrigger 变化时刷新（如流式结束后标题更新）
  useEffect(() => {
    if (refreshTrigger && isAuthenticated) {
      loadSessions()
    }
  }, [refreshTrigger, isAuthenticated, loadSessions])

  useEffect(() => {
    if (currentSessionId && isAuthenticated) {
      // 当前会话已在列表中则跳过，避免切换会话时列表闪烁
      if (sessions.some(s => s.session_id === currentSessionId)) return
      loadSessions()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId, isAuthenticated])

  // ─── 搜索过滤 + 分组 ───
  const filtered = keyword.trim()
    ? sessions.filter((s) => (s.title || '').toLowerCase().includes(keyword.toLowerCase()))
    : sessions

  const grouped = groupSessions(filtered)

  // ─── 操作 ───
  const handleNewChat = () => onSelectSession(null)

  const handleDelete = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingSessionId(sessionId)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!deletingSessionId) return
    try {
      await sessionsApi.delete(deletingSessionId, true)
      setSessions(sessions.filter((s) => s.session_id !== deletingSessionId))
      if (currentSessionId === deletingSessionId) onSelectSession(null)
      onSessionsChange?.()
    } catch (error) {
      console.error('删除会话失败:', error)
    } finally {
      setDeleteDialogOpen(false)
      setDeletingSessionId(null)
    }
  }

  const startEdit = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(session.session_id)
    setEditTitle(session.title)
  }

  const saveEdit = async (sessionId: string) => {
    if (!editTitle.trim()) return
    try {
      await sessionsApi.update(sessionId, { title: editTitle })
      setSessions(sessions.map((s) => (s.session_id === sessionId ? { ...s, title: editTitle } : s)))
      setEditingId(null)
    } catch (error) {
      console.error('重命名会话失败:', error)
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditTitle('')
  }

  const togglePin = async (session: Session, e: React.MouseEvent) => {
    e.stopPropagation()
    const newPinned = !session.is_pinned
    try {
      await sessionsApi.update(session.session_id, { is_pinned: newPinned } as any)
      setSessions(sessions.map((s) =>
        s.session_id === session.session_id ? { ...s, is_pinned: newPinned } : s
      ))
    } catch (error) {
      console.error('置顶操作失败:', error)
    }
  }

  return (
    <div className="bg-white dark:bg-[#22222e] border-r border-gray-200 dark:border-gray-800 flex flex-col flex-shrink-0" style={style}>
      {/* Header */}
      <div className="p-3 space-y-0.5 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded-lg transition-colors"
        >
          <SquarePen className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          新对话
        </button>

        <button
          onClick={() => setShowSearch(!showSearch)}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded-lg transition-colors"
        >
          <Search className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          搜索会话
        </button>

        <button
          onClick={() => navigate('/apps')}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded-lg transition-colors"
        >
          <Box className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          应用管理
        </button>

        <button
          onClick={() => navigate('/diary')}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded-lg transition-colors"
        >
          <Heart className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          心理日记
        </button>

        <button
          onClick={() => navigate('/assessment')}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded-lg transition-colors"
        >
          <ClipboardList className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          心理测评
        </button>

        {/* 搜索框（点击展开） */}
        {showSearch && (
          <div className="relative pt-1">
            <Search className="absolute left-2.5 top-1/2 mt-0.5 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索会话..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500/40 focus:border-primary-400 transition"
              autoFocus
            />
            {keyword && (
              <button
                onClick={() => setKeyword('')}
                className="absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
            {keyword ? '没有匹配的会话' : '暂无会话'}
          </div>
        ) : (
          <div className="space-y-3">
            {GROUP_ORDER.map((group) => {
              const items = grouped.get(group)
              if (!items || items.length === 0) return null

              return (
                <div key={group}>
                  <div className="px-2 pb-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    {group}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((session) => (
                      <div
                        key={session.session_id}
                        onClick={() => onSelectSession(session.session_id)}
                        className={`group px-3 py-2 rounded-lg cursor-pointer transition-all ${
                          currentSessionId === session.session_id
                            ? 'bg-gray-100 dark:bg-gray-800 border-l-2 border-l-primary-500'
                            : 'hover:bg-gray-100 dark:hover:bg-white/[0.04]'
                        }`}
                      >
                        {editingId === session.session_id ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEdit(session.session_id)
                                if (e.key === 'Escape') cancelEdit()
                              }}
                              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                              autoFocus
                            />
                            <button
                              onClick={() => saveEdit(session.session_id)}
                              className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                            <span className="flex-1 text-sm truncate text-gray-900 dark:text-gray-100">
                              {session.title}
                            </span>
                            <div className="hidden group-hover:flex items-center gap-1">
                              <button
                                onClick={(e) => togglePin(session, e)}
                                className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                                title={session.is_pinned ? '取消置顶' : '置顶'}
                              >
                                {session.is_pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                              </button>
                              <button
                                onClick={(e) => startEdit(session, e)}
                                className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => handleDelete(session.session_id, e)}
                                className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* User Profile Menu */}
      <UserProfileMenu />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="删除会话"
        message="此操作无法撤销，会话中的所有消息都将被永久删除。"
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteDialogOpen(false)
          setDeletingSessionId(null)
        }}
      />
    </div>
  )
}
