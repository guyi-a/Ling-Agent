import { useEffect, useState, useCallback } from 'react'
import { Plus, MessageSquare, Trash2, Edit2, Check, X } from 'lucide-react'
import { sessionsApi } from '@/api/sessions'
import { useAuthStore } from '@/stores/authStore'
import type { Session } from '@/types'

interface SessionSidebarProps {
  currentSessionId: string | null
  onSelectSession: (sessionId: string | null) => void
  onSessionsChange?: () => void
}

export default function SessionSidebar({ currentSessionId, onSelectSession, onSessionsChange }: SessionSidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  const loadSessions = useCallback(async () => {
    console.log('🔄 开始加载会话列表...')
    try {
      setLoading(true)
      const data = await sessionsApi.getAll({ limit: 100 })
      console.log('✅ API返回数据:', data)
      // 按更新时间倒序排序
      const sorted = data.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      setSessions(sorted)
      console.log('📋 设置会话列表:', sorted.length, '个会话', sorted)
    } catch (error: any) {
      console.error('❌ 加载会话列表失败:', error)
      console.error('错误详情:', error.response?.data || error.message)
      setSessions([])
    } finally {
      setLoading(false)
      console.log('✅ 加载完成')
    }
  }, [])

  useEffect(() => {
    console.log('🚀 SessionSidebar mounted, 认证状态:', isAuthenticated)
    if (isAuthenticated) {
      loadSessions()
    } else {
      console.log('⚠️  未登录，跳过加载会话列表')
      setLoading(false)
    }
  }, [isAuthenticated, loadSessions])

  // 当currentSessionId变化时（新会话创建），刷新列表
  useEffect(() => {
    console.log('🔄 currentSessionId 变化:', currentSessionId)
    if (currentSessionId && isAuthenticated) {
      loadSessions()
    }
  }, [currentSessionId, isAuthenticated, loadSessions])

  const handleNewChat = () => {
    onSelectSession(null)
  }

  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定删除此会话？')) return

    try {
      await sessionsApi.delete(sessionId, true)
      setSessions(sessions.filter((s) => s.session_id !== sessionId))
      if (currentSessionId === sessionId) {
        onSelectSession(null)
      }
      onSessionsChange?.()
    } catch (error) {
      console.error('删除会话失败:', error)
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

  return (
    <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500 to-accent-600 text-white rounded-lg hover:from-primary-600 hover:to-accent-700 transition-all shadow-lg hover:shadow-xl"
        >
          <Plus className="w-4 h-4" />
          新对话
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">加载中...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">暂无会话</div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <div
                key={session.session_id}
                onClick={() => onSelectSession(session.session_id)}
                className={`group px-3 py-2 rounded-lg cursor-pointer transition-all ${
                  currentSessionId === session.session_id
                    ? 'bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-900/30 dark:to-accent-900/30 gradient-border gradient-shadow-sm'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {editingId === session.session_id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && saveEdit(session.session_id)}
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
        )}
      </div>
    </div>
  )
}
