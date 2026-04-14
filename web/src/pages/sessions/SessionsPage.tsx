import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Search, MessageSquare, Trash2, Edit2, Check, X,
  MessageCircle, Pin, PinOff,
} from 'lucide-react'
import { sessionsApi } from '@/api/sessions'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { Session } from '@/types'

// ─── 时间分组工具 ───

type TimeGroup = '置顶' | '今天' | '昨天' | '最近 7 天' | '最近 30 天' | '更早'

const GROUP_ORDER: TimeGroup[] = ['置顶', '今天', '昨天', '最近 7 天', '最近 30 天', '更早']

function getTimeGroup(dateStr: string): TimeGroup {
  const now = new Date()
  const date = new Date(dateStr)

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000)
  const startOf7Days = new Date(startOfToday.getTime() - 6 * 86400000)
  const startOf30Days = new Date(startOfToday.getTime() - 29 * 86400000)

  if (date >= startOfToday) return '今天'
  if (date >= startOfYesterday) return '昨天'
  if (date >= startOf7Days) return '最近 7 天'
  if (date >= startOf30Days) return '最近 30 天'
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

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()

  if (diffMs < 60000) return '刚刚'
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} 分钟前`
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)} 小时前`

  const sameYear = d.getFullYear() === now.getFullYear()
  if (sameYear) {
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

// ─── 骨架屏 ───

function SkeletonCard() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-gray-700" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
        <div className="h-3 bg-gray-100 dark:bg-gray-700/60 rounded w-1/3" />
      </div>
    </div>
  )
}

// ─── 主页面 ───

export default function SessionsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true)
      const data = await sessionsApi.getAll({ limit: 200 })
      const sorted = data.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      setSessions(sorted)
    } catch (error) {
      console.error('加载会话失败:', error)
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // ─── 搜索过滤 ───
  const filtered = keyword.trim()
    ? sessions.filter((s) => (s.title || '').toLowerCase().includes(keyword.toLowerCase()))
    : sessions

  const grouped = groupSessions(filtered)

  // ─── 操作 ───
  const handleClick = (sessionId: string) => {
    navigate(`/chat?session=${sessionId}`)
  }

  const startEdit = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(session.session_id)
    setEditTitle(session.title || '')
  }

  const saveEdit = async (sessionId: string) => {
    if (!editTitle.trim()) return
    try {
      await sessionsApi.update(sessionId, { title: editTitle.trim() })
      setSessions((prev) =>
        prev.map((s) => (s.session_id === sessionId ? { ...s, title: editTitle.trim() } : s))
      )
    } catch (error) {
      console.error('重命名失败:', error)
    } finally {
      setEditingId(null)
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
      await sessionsApi.update(session.session_id, { is_pinned: newPinned })
      setSessions((prev) =>
        prev.map((s) => (s.session_id === session.session_id ? { ...s, is_pinned: newPinned } : s))
      )
    } catch (error) {
      console.error('置顶操作失败:', error)
    }
  }

  const handleDelete = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingId(sessionId)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!deletingId) return
    try {
      await sessionsApi.delete(deletingId, true)
      setSessions((prev) => prev.filter((s) => s.session_id !== deletingId))
    } catch (error) {
      console.error('删除失败:', error)
    } finally {
      setDeleteDialogOpen(false)
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 顶栏 */}
      <div className="sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/chat')}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex-1">
            会话管理
          </h1>
          <button
            onClick={() => navigate('/chat')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 rounded-lg transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            新对话
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索会话..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition"
          />
          {keyword && (
            <button
              onClick={() => setKeyword('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 加载态 */}
        {loading && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* 空状态 */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-gray-300 dark:text-gray-600" />
            </div>
            {keyword ? (
              <>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  没有找到包含 "<span className="font-medium text-gray-700 dark:text-gray-300">{keyword}</span>" 的会话
                </p>
                <button
                  onClick={() => setKeyword('')}
                  className="mt-3 text-sm text-indigo-500 hover:text-indigo-600 dark:text-indigo-400"
                >
                  清除搜索
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-500 dark:text-gray-400 text-sm">还没有任何会话</p>
                <button
                  onClick={() => navigate('/chat')}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg shadow-sm hover:from-indigo-600 hover:to-purple-700 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  开始新对话
                </button>
              </>
            )}
          </div>
        )}

        {/* 分组列表 */}
        {!loading &&
          GROUP_ORDER.map((group) => {
            const items = grouped.get(group)
            if (!items || items.length === 0) return null

            return (
              <div key={group}>
                <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-1">
                  {group}
                </h2>
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/60">
                  {items.map((session) => (
                    <div
                      key={session.session_id}
                      onClick={() => handleClick(session.session_id)}
                      className="group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                    >
                      {/* 图标 */}
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                      </div>

                      {/* 内容 */}
                      {editingId === session.session_id ? (
                        <div
                          className="flex-1 flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(session.session_id)
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                            autoFocus
                          />
                          <button
                            onClick={() => saveEdit(session.session_id)}
                            className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {session.title || '未命名对话'}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {formatTime(session.updated_at)}
                            </span>
                            {session.message_count != null && session.message_count > 0 && (
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                {session.message_count} 条消息
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 操作按钮 */}
                      {editingId !== session.session_id && (
                        <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={(e) => togglePin(session, e)}
                            className="p-1.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                            title={session.is_pinned ? '取消置顶' : '置顶'}
                          >
                            {session.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={(e) => startEdit(session, e)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                            title="重命名"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(session.session_id, e)}
                            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

        {/* 统计 */}
        {!loading && sessions.length > 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-600 pt-2">
            共 {sessions.length} 个会话
            {keyword && filtered.length !== sessions.length && (
              <span>，已筛选 {filtered.length} 个</span>
            )}
          </p>
        )}
      </div>

      {/* 删除确认 */}
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
          setDeletingId(null)
        }}
      />
    </div>
  )
}
