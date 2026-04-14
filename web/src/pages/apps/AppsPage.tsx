import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Play, Square, RotateCw, Terminal, Globe,
  ExternalLink, Box, X,
} from 'lucide-react'
import { devApi } from '@/api/dev'
import type { DevApp } from '@/types'

function StatusBadge({ status }: { status: string }) {
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        Running
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      Stopped
    </span>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-3 bg-gray-100 dark:bg-gray-700/60 rounded w-1/2" />
        </div>
      </div>
    </div>
  )
}

export default function AppsPage() {
  const navigate = useNavigate()
  const [apps, setApps] = useState<DevApp[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadApps = useCallback(async () => {
    try {
      const data = await devApi.listAllProcesses()
      setApps(data)
    } catch (error) {
      console.error('加载应用列表失败:', error)
      setApps([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadApps()
    const interval = setInterval(loadApps, 5000)
    return () => clearInterval(interval)
  }, [loadApps])

  const handleStop = async (app: DevApp) => {
    const key = `${app.session_id}/${app.name}`
    setActionLoading(key)
    try {
      await devApi.stopProcess(app.session_id, app.name)
      await loadApps()
    } catch (error) {
      console.error('停止失败:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleRestart = async (app: DevApp) => {
    const key = `${app.session_id}/${app.name}`
    setActionLoading(key)
    try {
      await devApi.restartProcess(app.session_id, app.name)
      await loadApps()
    } catch (error) {
      console.error('重启失败:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const toggleLogs = async (app: DevApp) => {
    const key = `${app.session_id}/${app.name}`
    if (expandedLogs === key) {
      setExpandedLogs(null)
      setLogs([])
      return
    }
    setExpandedLogs(key)
    setLogsLoading(true)
    try {
      const lines = await devApi.getLogs(app.session_id, app.name, 80)
      setLogs(lines)
    } catch (error) {
      console.error('获取日志失败:', error)
      setLogs(['获取日志失败'])
    } finally {
      setLogsLoading(false)
    }
  }

  // 按会话分组
  const grouped = apps.reduce<Record<string, { title: string; apps: DevApp[] }>>((acc, app) => {
    if (!acc[app.session_id]) {
      acc[app.session_id] = { title: app.session_title, apps: [] }
    }
    acc[app.session_id].apps.push(app)
    return acc
  }, {})

  const runningCount = apps.filter((a) => a.status === 'running').length

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 顶栏 */}
      <div className="sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/chat')}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex-1">
            应用管理
          </h1>
          {runningCount > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {runningCount} 个运行中
            </span>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* 加载态 */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* 空状态 */}
        {!loading && apps.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Box className="w-8 h-8 text-gray-300 dark:text-gray-600" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">还没有运行中的应用</p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
              在对话中让 Agent 启动一个项目试试
            </p>
          </div>
        )}

        {/* 按会话分组的应用列表 */}
        {!loading &&
          Object.entries(grouped).map(([sessionId, { title, apps: sessionApps }]) => (
            <div key={sessionId}>
              <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-1 flex items-center gap-2">
                <span className="truncate max-w-xs">{title}</span>
                <span className="text-gray-300 dark:text-gray-600">
                  {sessionApps.length} 个进程
                </span>
              </h2>
              <div className="space-y-3">
                {sessionApps.map((app) => {
                  const key = `${app.session_id}/${app.name}`
                  const isExpanded = expandedLogs === key
                  const isActionLoading = actionLoading === key

                  return (
                    <div
                      key={key}
                      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer"
                      onClick={() => navigate(`/chat?session=${app.session_id}`)}
                    >
                      {/* 卡片主体 */}
                      <div className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {/* 图标 */}
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            app.status === 'running'
                              ? 'bg-green-50 dark:bg-green-900/20'
                              : 'bg-gray-100 dark:bg-gray-700'
                          }`}>
                            <Globe className={`w-5 h-5 ${
                              app.status === 'running'
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-gray-400 dark:text-gray-500'
                            }`} />
                          </div>

                          {/* 信息 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {app.name}
                              </span>
                              <StatusBadge status={app.status} />
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              {app.port && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  :{app.port}
                                </span>
                              )}
                              <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                                {app.command.join(' ')}
                              </span>
                            </div>
                          </div>

                          {/* 操作按钮 */}
                          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            {app.status === 'running' && app.port && (
                              <a
                                href={`http://localhost:${app.port}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                                title="在浏览器中打开"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                            {app.status === 'running' ? (
                              <>
                                <button
                                  onClick={() => handleRestart(app)}
                                  disabled={isActionLoading}
                                  className="p-2 text-gray-500 hover:text-amber-600 dark:text-gray-400 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors disabled:opacity-50"
                                  title="重启"
                                >
                                  <RotateCw className={`w-4 h-4 ${isActionLoading ? 'animate-spin' : ''}`} />
                                </button>
                                <button
                                  onClick={() => handleStop(app)}
                                  disabled={isActionLoading}
                                  className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                                  title="停止"
                                >
                                  <Square className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleRestart(app)}
                                disabled={isActionLoading}
                                className="p-2 text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50"
                                title="启动"
                              >
                                <Play className={`w-4 h-4 ${isActionLoading ? 'animate-spin' : ''}`} />
                              </button>
                            )}
                            <button
                              onClick={() => toggleLogs(app)}
                              className={`p-2 rounded-lg transition-colors ${
                                isExpanded
                                  ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                              title="查看日志"
                            >
                              <Terminal className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 日志展开区域 */}
                      {isExpanded && (
                        <div className="border-t border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800/50">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              日志输出
                            </span>
                            <button
                              onClick={() => { setExpandedLogs(null); setLogs([]) }}
                              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="max-h-64 overflow-y-auto bg-gray-900 dark:bg-gray-950">
                            {logsLoading ? (
                              <div className="px-4 py-3 text-xs text-gray-400">加载中...</div>
                            ) : logs.length === 0 ? (
                              <div className="px-4 py-3 text-xs text-gray-500">暂无日志</div>
                            ) : (
                              <pre className="px-4 py-3 text-xs text-gray-300 font-mono leading-5">
                                {logs.join('\n')}
                              </pre>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

        {/* 统计 */}
        {!loading && apps.length > 0 && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-600 pt-2">
            共 {apps.length} 个进程，{runningCount} 个运行中
          </p>
        )}
      </div>
    </div>
  )
}
