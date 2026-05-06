import { useEffect, useState, useRef } from 'react'
import { MessageSquare, Trash2, Edit2, Check, X, Search, SquarePen, Heart, ClipboardList, ChevronDown, ChevronRight, GitBranch, Radio, ArrowUpDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { sessionsApi } from '@/api/sessions'
import { useAuthStore } from '@/stores/authStore'
import { useProjectsStore } from '@/stores/projectsStore'
import ConfirmDialog from '@/components/ConfirmDialog'
import UserProfileMenu from '@/components/UserProfileMenu'
import type { Session, Project, AdhocSession } from '@/types'

type SortMode = 'recent' | 'name' | 'created'

interface SessionSidebarProps {
  currentSessionId: string | null
  onSelectSession: (sessionId: string | null) => void
  onSessionsChange?: () => void
  refreshTrigger?: number
  onSearchClick?: () => void
  style?: React.CSSProperties
}

// --- 时间分组（临时对话用）---

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

export default function SessionSidebar({ currentSessionId, onSelectSession, onSessionsChange, refreshTrigger, onSearchClick, style }: SessionSidebarProps) {
  const navigate = useNavigate()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false)
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  const projects = useProjectsStore((s) => s.projects)
  const adhocSessions = useProjectsStore((s) => s.adhocSessions)
  const expandedProjectId = useProjectsStore((s) => s.expandedProjectId)
  const setExpandedProject = useProjectsStore((s) => s.setExpandedProject)
  const loadAll = useProjectsStore((s) => s.loadAll)
  const deleteProject = useProjectsStore((s) => s.deleteProject)
  const isLoading = useProjectsStore((s) => s.isLoading)

  const [projectsExpanded, setProjectsExpanded] = useState(true)
  const [adhocExpanded, setAdhocExpanded] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isAuthenticated) {
      loadAll()
    }
  }, [isAuthenticated, loadAll])

  useEffect(() => {
    if (refreshTrigger && isAuthenticated) {
      loadAll()
    }
  }, [refreshTrigger, isAuthenticated, loadAll])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false)
      }
    }
    if (sortDropdownOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [sortDropdownOpen])

  const sortedProjects = [...projects].sort((a, b) => {
    if (sortMode === 'name') return (a.title || '').localeCompare(b.title || '', 'zh')
    if (sortMode === 'created') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    return new Date(b.last_active_at || b.created_at).getTime() - new Date(a.last_active_at || a.created_at).getTime()
  })

  // --- 操作 ---
  const handleNewChat = () => onSelectSession(null)

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingSessionId(sessionId)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteSession = async () => {
    if (!deletingSessionId) return
    try {
      await sessionsApi.delete(deletingSessionId, true)
      if (currentSessionId === deletingSessionId) onSelectSession(null)
      onSessionsChange?.()
      loadAll()
    } catch (error) {
      console.error('删除会话失败:', error)
    } finally {
      setDeleteDialogOpen(false)
      setDeletingSessionId(null)
    }
  }

  const handleDeleteProject = (projectId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingProjectId(projectId)
    setDeleteProjectDialogOpen(true)
  }

  const confirmDeleteProject = async () => {
    if (!deletingProjectId) return
    const ok = await deleteProject(deletingProjectId)
    if (ok) onSelectSession(null)
    setDeleteProjectDialogOpen(false)
    setDeletingProjectId(null)
  }

  const startEdit = (sessionId: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(sessionId)
    setEditTitle(title)
  }

  const saveEdit = async (sessionId: string) => {
    if (!editTitle.trim()) return
    try {
      await sessionsApi.update(sessionId, { title: editTitle })
      setEditingId(null)
      loadAll()
    } catch (error) {
      console.error('重命名会话失败:', error)
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditTitle('')
  }

  const togglePin = async (sessionId: string, currentPinned: boolean, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await sessionsApi.update(sessionId, { is_pinned: !currentPinned } as any)
      loadAll()
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
          onClick={onSearchClick}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 rounded-lg transition-colors"
        >
          <Search className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          搜索
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

      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">加载中...</div>
        ) : (
          <div className="space-y-3">
            {/* 我的项目 */}
              <div>
                <div className="flex items-center px-3 py-1">
                  <button
                    onClick={() => setProjectsExpanded(!projectsExpanded)}
                    className="flex items-center gap-1.5 flex-1 text-left"
                  >
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      我的项目
                    </span>
                    {projectsExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </button>
                  <div className="flex items-center gap-0.5">
                    <div className="relative" ref={sortRef}>
                      <button
                        onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
                        title="排序方式"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                      {sortDropdownOpen && (
                        <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-[#2a2a38] border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
                          {([['recent', '最近活跃'], ['name', '名称排序'], ['created', '创建时间']] as const).map(([key, label]) => (
                            <button
                              key={key}
                              onClick={() => { setSortMode(key); setSortDropdownOpen(false) }}
                              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                                sortMode === key
                                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => navigate('/apps')}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
                      title="我的应用"
                    >
                      <Radio className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                </div>

                {projectsExpanded && (
                  <div className="space-y-1">
                    {sortedProjects.map((project) => (
                      <ProjectItem
                        key={project.id}
                        project={project}
                        isExpanded={expandedProjectId === project.id}
                        currentSessionId={currentSessionId}
                        onToggle={() => setExpandedProject(expandedProjectId === project.id ? null : project.id)}
                        onSelectSession={onSelectSession}
                        onDelete={handleDeleteProject}
                        onNavigate={() => navigate(`/projects/${project.id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>

            {/* 我的草稿 */}
            <div>
                <button
                  onClick={() => setAdhocExpanded(!adhocExpanded)}
                  className="flex items-center gap-1.5 px-3 py-1 w-full text-left"
                >
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    我的草稿
                  </span>
                  {adhocExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </button>

                {adhocExpanded && (
                  <div className="space-y-0.5">
                    {adhocSessions.map((session) => (
                      <div
                        key={session.session_id}
                        onClick={() => onSelectSession(session.session_id)}
                        className={`group px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                          currentSessionId === session.session_id
                            ? 'bg-gray-100 dark:bg-gray-800'
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
                            <button onClick={() => saveEdit(session.session_id)} className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={cancelEdit} className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <MessageSquare className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                            <span className="flex-1 text-sm truncate text-gray-900 dark:text-gray-100">
                              {session.title || '新对话'}
                            </span>
                            <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={(e) => startEdit(session.session_id, session.title || '', e)}
                                className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => handleDeleteSession(session.session_id, e)}
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
        )}
      </div>

      {/* User Profile Menu */}
      <UserProfileMenu />

      {/* Delete Session Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="删除会话"
        message="此操作无法撤销，会话中的所有消息都将被永久删除。"
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={confirmDeleteSession}
        onCancel={() => { setDeleteDialogOpen(false); setDeletingSessionId(null) }}
      />

      {/* Delete Project Dialog */}
      <ConfirmDialog
        open={deleteProjectDialogOpen}
        title="删除项目"
        message="删除项目将同时删除该项目下所有会话和工作区文件，此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={confirmDeleteProject}
        onCancel={() => { setDeleteProjectDialogOpen(false); setDeletingProjectId(null) }}
      />
    </div>
  )
}

// --- 项目列表项子组件 ---

interface ProjectItemProps {
  project: Project
  isExpanded: boolean
  currentSessionId: string | null
  onToggle: () => void
  onSelectSession: (sessionId: string | null) => void
  onDelete: (projectId: number, e: React.MouseEvent) => void
  onNavigate: () => void
}

function ProjectItem({ project, isExpanded, currentSessionId, onToggle, onSelectSession, onDelete, onNavigate }: ProjectItemProps) {
  const [sessions, setSessions] = useState<Array<{ session_id: string; title: string | null; updated_at: string; is_pinned: boolean }>>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!loaded) {
      setLoaded(true)
      import('@/api/client').then(({ default: apiClient }) => {
        apiClient.get(`/api/projects/${project.id}`).then(({ data }) => {
          setSessions((data as any).sessions || [])
        }).catch(() => {})
      })
    }
  }, [loaded, project.id])

  const formatRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins} 分钟`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} 小时`
    const days = Math.floor(hours / 24)
    return `${days} 天`
  }

  const latestSession = sessions.length > 0 ? sessions[0] : null

  return (
    <div>
      {/* 项目卡片 */}
      <div
        onClick={onNavigate}
        className="group px-3 py-2.5 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {project.icon?.startsWith('__img__') ? (
            <img src={`/api/projects/${project.id}/icon`} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
          ) : (
            <span className="flex-shrink-0 text-xl leading-none">{project.icon || '📁'}</span>
          )}
          <span className="flex-1 text-sm font-medium truncate text-gray-900 dark:text-gray-100">
            {project.title || `项目 #${project.id}`}
          </span>
          {project.last_active_at && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0">
              {formatRelativeTime(project.last_active_at)}
            </span>
          )}
          <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(project.id, e) }}
              className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 最近一条子会话 */}
      {latestSession && (
        <div
          onClick={() => onSelectSession(latestSession.session_id)}
          className={`flex items-center gap-2 pl-7 pr-3 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
            currentSessionId === latestSession.session_id
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.03]'
          }`}
        >
          <GitBranch className="w-3 h-3 flex-shrink-0 opacity-40" />
          <span className="truncate">{latestSession.title || '新对话'}</span>
        </div>
      )}
    </div>
  )
}
