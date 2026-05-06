import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageSquare, Settings, Sun, Moon, ChevronUp, Send, Shield, Zap, Wrench, Pencil, FolderOpen, Trash2, Square, Play } from 'lucide-react'
import apiClient from '@/api/client'
import Logo from '@/components/Logo'
import { useProjectsStore } from '@/stores/projectsStore'
import { useThemeStore } from '@/stores/themeStore'
import { useSettingsStore } from '@/stores/settingsStore'
import ConfirmDialog from '@/components/ConfirmDialog'
import EmojiPicker from '@/components/EmojiPicker'
import { sessionsApi } from '@/api/sessions'
import { devApi } from '@/api/dev'
import type { ProjectDetail, SessionBrief, DevApp } from '@/types'

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useThemeStore()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chatInputOpen, setChatInputOpen] = useState(false)
  const [chatSending, setChatSending] = useState(false)
  const [approvalMenuOpen, setApprovalMenuOpen] = useState(false)
  const [runningProcesses, setRunningProcesses] = useState<DevApp[]>([])
  const [stoppedProcesses, setStoppedProcesses] = useState<DevApp[]>([])
  const [stoppingProcess, setStoppingProcess] = useState<string | null>(null)
  const [startingProcesses, setStartingProcesses] = useState(false)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const approvalBtnRef = useRef<HTMLDivElement>(null)
  const settingsBtnRef = useRef<HTMLDivElement>(null)
  const { approvalMode, setApprovalMode } = useSettingsStore()

  const updateProject = useProjectsStore((s) => s.updateProject)
  const deleteProjectStore = useProjectsStore((s) => s.deleteProject)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    apiClient
      .get<ProjectDetail>(`/api/projects/${projectId}`)
      .then(({ data }) => setProject(data))
      .catch(() => navigate('/apps'))
      .finally(() => setLoading(false))
  }, [projectId, navigate])

  useEffect(() => {
    if (!project) return
    const sessionIds = new Set((project.sessions || []).map(s => s.session_id))
    if (sessionIds.size === 0) return
    devApi.listAllProcesses().then(procs => {
      const matching = procs.filter(p => sessionIds.has(p.session_id))
      const seen = new Set<string>()
      const dedup = (list: DevApp[]) => list.filter(p => {
        const key = `${p.name}:${p.port ?? ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      const running = dedup(matching.filter(p => p.status === 'running'))
      seen.clear()
      const stopped = dedup(matching.filter(p => p.status === 'exited'))
      setRunningProcesses(running)
      setStoppedProcesses(stopped)
    }).catch(() => {})
  }, [project])

  const handleStopAll = async () => {
    setStoppingProcess('all')
    try {
      for (const proc of runningProcesses) {
        await devApi.stopProcess(proc.session_id, proc.name)
      }
      setStoppedProcesses(prev => [...prev, ...runningProcesses])
      setRunningProcesses([])
    } catch (e) {
      console.error('停止进程失败:', e)
    } finally {
      setStoppingProcess(null)
    }
  }

  const handleStartAll = async () => {
    setStartingProcesses(true)
    try {
      const started: DevApp[] = []
      for (const proc of stoppedProcesses) {
        const result = await devApi.restartProcess(proc.session_id, proc.name)
        started.push({ ...proc, ...result, status: 'running' })
      }
      setRunningProcesses(prev => [...prev, ...started])
      setStoppedProcesses([])
    } catch (e) {
      console.error('启动进程失败:', e)
    } finally {
      setStartingProcesses(false)
    }
  }

  const handleSaveTitle = async () => {
    if (!project || !titleDraft.trim()) return
    const ok = await updateProject(project.id, { title: titleDraft.trim() })
    if (ok) setProject({ ...project, title: titleDraft.trim() })
    setEditingTitle(false)
  }

  const handleSelectIcon = async (emoji: string) => {
    if (!project) return
    const ok = await updateProject(project.id, { icon: emoji })
    if (ok) setProject({ ...project, icon: emoji })
  }

  const handleUploadIcon = async (file: File) => {
    if (!project) return
    const form = new FormData()
    form.append('file', file)
    try {
      const { data } = await apiClient.post(`/api/projects/${project.id}/icon`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setProject({ ...project, icon: data.icon })
    } catch (e) {
      console.error('上传图标失败:', e)
    }
  }

  const handleClearIcon = async () => {
    if (!project) return
    const ok = await updateProject(project.id, { icon: null })
    if (ok) setProject({ ...project, icon: null })
  }

  const handleDelete = async () => {
    if (!project) return
    const ok = await deleteProjectStore(project.id)
    if (ok) navigate('/apps')
    setDeleteDialogOpen(false)
  }

  const handleOpenInFinder = async () => {
    if (!project) return
    setSettingsOpen(false)
    try {
      await apiClient.post(`/api/projects/${project.id}/open`)
    } catch (e) {
      console.error('打开工作区失败:', e)
    }
  }

  const handleRename = () => {
    if (!project) return
    setSettingsOpen(false)
    setTitleDraft(project.title || '')
    setEditingTitle(true)
  }

  const handleChatSend = async () => {
    const message = chatInputRef.current?.value?.trim()
    if (!message || !project || chatSending) return
    setChatSending(true)
    try {
      const session = await sessionsApi.create('', project.id)
      navigate(`/chat?session=${session.session_id}&msg=${encodeURIComponent(message)}`)
    } catch (e) {
      console.error('创建会话失败:', e)
      setChatSending(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#1a1a24]">
        <div className="text-gray-400 dark:text-gray-500 text-sm">加载中...</div>
      </div>
    )
  }

  if (!project) return null

  const sessions = project.sessions || []
  const lastActive = project.last_active_at || project.updated_at || project.created_at

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#1a1a24]">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200/80 dark:border-gray-800/80 bg-white/70 dark:bg-[#22222e]/70 backdrop-blur-xl">
        <div className="px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate('/apps')}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 flex-1">
            <Logo size={22} />
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Project Header */}
        <div className="flex items-start gap-5 mb-8">
          {/* Icon */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}
              className="group w-20 h-20 flex items-center justify-center bg-gray-100 dark:bg-gray-800/60 rounded-2xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors relative overflow-hidden"
              title="修改图标"
            >
              {project.icon?.startsWith('__img__') ? (
                <img src={`/api/projects/${project.id}/icon?t=${Date.now()}`} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl">{project.icon || '📁'}</span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium">
                更换
              </span>
            </button>
            {emojiPickerOpen && (
              <EmojiPicker
                onSelect={handleSelectIcon}
                onUpload={handleUploadIcon}
                onClose={() => setEmojiPickerOpen(false)}
                onClear={handleClearIcon}
              />
            )}
          </div>

          <div className="flex-1 min-w-0 pt-1">
            {/* Title */}
            {editingTitle ? (
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle()
                  if (e.key === 'Escape') setEditingTitle(false)
                }}
                onBlur={handleSaveTitle}
                className="text-3xl font-bold px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full max-w-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            ) : (
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {project.title || `项目 #${project.id}`}
              </h1>
            )}

            {/* Description */}
            {project.description && (
              <p className="mt-2 text-base text-gray-500 dark:text-gray-400">
                {project.description}
              </p>
            )}
          </div>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center gap-8 pb-6 mb-6 border-b border-gray-200 dark:border-gray-800">
          <div>
            <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-0.5">最近活动</div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {formatRelativeTime(lastActive)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-0.5">对话</div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {sessions.length} 次对话
            </div>
          </div>
          <div>
            <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-0.5">创建于</div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {new Date(project.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <div className="flex-1" />
          <div className="relative" ref={settingsBtnRef}>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
              title="项目设置"
            >
              <Settings className="w-5 h-5" />
            </button>
            {settingsOpen && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setSettingsOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-[70] w-48 bg-white dark:bg-[#2a2a38] rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1.5 overflow-hidden">
                  <button
                    onClick={handleRename}
                    className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition-colors"
                  >
                    <Pencil className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    重命名
                  </button>
                  <button
                    onClick={handleOpenInFinder}
                    className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition-colors"
                  >
                    <FolderOpen className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    在 Finder 中打开
                  </button>
                  <div className="my-1.5 border-t border-gray-100 dark:border-gray-700/50" />
                  <button
                    onClick={() => { setSettingsOpen(false); setDeleteDialogOpen(true) }}
                    className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    删除项目
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Running Processes */}
        {runningProcesses.length > 0 && (
          <div className="mb-6 rounded-2xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-emerald-200/60 dark:border-emerald-800/30">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">运行中</span>
              </div>
              <button
                onClick={handleStopAll}
                disabled={stoppingProcess !== null}
                className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                停止
              </button>
            </div>
            <div className="px-5 py-2 space-y-1">
              {runningProcesses.map((proc) => (
                <div key={`${proc.session_id}-${proc.name}`} className="flex items-center gap-3 py-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{proc.name}</span>
                  {proc.port && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200/80 dark:bg-gray-700/60 text-gray-600 dark:text-gray-400 font-mono">
                      :{proc.port}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {runningProcesses.some(p => p.port) && (
              <div className="px-5 py-3 border-t border-emerald-200/60 dark:border-emerald-800/30">
                <a
                  href={`http://localhost:${runningProcesses.find(p => p.port)!.port}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 transition-colors"
                >
                  立即前往 →
                </a>
              </div>
            )}
          </div>
        )}

        {/* Start Backend */}
        {runningProcesses.length === 0 && stoppedProcesses.length > 0 && (
          <button
            onClick={handleStartAll}
            disabled={startingProcesses}
            className="w-full mb-6 py-8 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/[0.03] hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors flex flex-col items-center gap-3 disabled:opacity-50"
          >
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <Play className="w-5 h-5 text-gray-600 dark:text-gray-300 ml-0.5" />
            </div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {startingProcesses ? '启动中...' : '启动后台'}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">
              {stoppedProcesses.length} 个服务
            </div>
          </button>
        )}

        {/* Sessions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">历史对话</h2>
            <button
              onClick={() => {
                setChatInputOpen(!chatInputOpen)
                setTimeout(() => chatInputRef.current?.focus(), 100)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/[0.04] rounded-lg transition-colors"
            >
              {chatInputOpen ? <ChevronUp className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
              {chatInputOpen ? '收起' : '继续改进'}
            </button>
          </div>

          {/* Inline Chat Input */}
          {chatInputOpen && (
            <div className="mb-6 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/[0.03]">
              <textarea
                ref={chatInputRef}
                placeholder="Say something..."
                rows={2}
                disabled={chatSending}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleChatSend()
                  }
                }}
                className="w-full resize-none bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none disabled:opacity-50"
              />
              <div className="flex items-center justify-between mt-2">
                <div className="relative" ref={approvalBtnRef}>
                  <button
                    onClick={() => setApprovalMenuOpen(!approvalMenuOpen)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      approvalMode === 'auto'
                        ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                        : approvalMode === 'custom'
                          ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    {approvalMode === 'auto' ? <Zap className="w-3.5 h-3.5" /> : approvalMode === 'custom' ? <Wrench className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                    {approvalMode === 'default' ? '默认' : approvalMode === 'auto' ? '自动' : '自定义'}
                  </button>
                  {approvalMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-[60]" onClick={() => setApprovalMenuOpen(false)} />
                      <div className="absolute bottom-full left-0 mb-2 z-[70] w-44 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1">
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
                </div>
                <button
                  onClick={handleChatSend}
                  disabled={chatSending}
                  className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 disabled:opacity-50 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {sessions.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">
              暂无对话
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => (
                <button
                  key={session.session_id}
                  onClick={() => navigate(`/chat?session=${session.session_id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-xl hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors group"
                >
                  <MessageSquare className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
                    {session.title || '新对话'}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                    {formatRelativeTime(session.updated_at)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        title="删除项目"
        message="删除项目将同时删除该项目下所有会话和工作区文件，此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </div>
  )
}
