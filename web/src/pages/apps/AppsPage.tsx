import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Sun, Moon } from 'lucide-react'
import Logo from '@/components/Logo'
import { useThemeStore } from '@/stores/themeStore'
import { useProjectsStore } from '@/stores/projectsStore'
import { devApi } from '@/api/dev'

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

export default function AppsPage() {
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useThemeStore()
  const projects = useProjectsStore((s) => s.projects)
  const loadProjects = useProjectsStore((s) => s.loadProjects)
  const isLoading = useProjectsStore((s) => s.isLoading)
  const [runningCount, setRunningCount] = useState(0)

  useEffect(() => {
    loadProjects()
    devApi.listAllProcesses().then(procs => {
      setRunningCount(procs.filter(p => p.status === 'running').length)
    }).catch(() => {})
  }, [loadProjects])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#1a1a24]">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200/80 dark:border-gray-800/80 bg-white/70 dark:bg-[#22222e]/70 backdrop-blur-xl">
        <div className="px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate('/chat')}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 flex-1">
            <Logo size={22} />
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">我的应用</h1>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Stats */}
        {!isLoading && projects.length > 0 && (
          <div className="flex items-center gap-4 mb-6 text-xs text-gray-400 dark:text-gray-500">
            <span>{projects.length} 个应用</span>
            <span className="w-px h-3 bg-gray-200 dark:bg-gray-700" />
            <span>{projects.reduce((sum, p) => sum + p.session_count, 0)} 次对话</span>
            {runningCount > 0 && (
              <>
                <span className="w-px h-3 bg-gray-200 dark:bg-gray-700" />
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {runningCount} 个运行中
                </span>
              </>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-6 animate-pulse">
                <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 mb-5" />
                <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-2/3 mb-2" />
                <div className="h-3 bg-gray-50 dark:bg-gray-800/60 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {projects.map((project, i) => (
              <button
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="group text-left rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-6 hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-black/20 hover:-translate-y-0.5 hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200 cursor-pointer"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800/60 flex items-center justify-center text-2xl mb-5 group-hover:scale-105 transition-transform duration-200 overflow-hidden">
                  {project.icon?.startsWith('__img__') ? (
                    <img src={`/api/projects/${project.id}/icon`} alt="" className="w-full h-full object-cover" />
                  ) : (
                    project.icon || '📁'
                  )}
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate mb-1">
                  {project.title || `项目 #${project.id}`}
                </h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {project.session_count} 次对话
                </p>
                {project.last_active_at && (
                  <p className="text-[11px] text-gray-300 dark:text-gray-600 mt-2">
                    {formatRelativeTime(project.last_active_at)}
                  </p>
                )}
              </button>
            ))}

            {/* 开始新作品 */}
            <button
              onClick={() => navigate('/chat')}
              className="group rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 p-6 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-white/50 dark:hover:bg-white/[0.02] transition-all duration-200 cursor-pointer flex flex-col items-center justify-center min-h-[170px]"
            >
              <div className="w-12 h-12 rounded-xl bg-gray-100/80 dark:bg-gray-800/40 flex items-center justify-center mb-3 group-hover:bg-gray-200/80 dark:group-hover:bg-gray-800/60 transition-colors">
                <Plus className="w-5 h-5 text-gray-400 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-500 transition-colors" />
              </div>
              <span className="text-sm text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors">
                开始新作品
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
