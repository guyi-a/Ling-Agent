import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Play, Square, RotateCw, Terminal, Globe,
  ExternalLink, X, Sun, Moon, Radio, Cpu,
} from 'lucide-react'
import Logo from '@/components/Logo'
import { useThemeStore } from '@/stores/themeStore'
import { devApi } from '@/api/dev'
import type { DevApp } from '@/types'

function StatusIndicator({ status }: { status: string }) {
  const running = status === 'running'
  return (
    <span className="relative flex items-center gap-1.5">
      <span className={`relative w-2 h-2 rounded-full ${running ? 'bg-emerald-400' : 'bg-gray-400 dark:bg-gray-600'}`}>
        {running && (
          <>
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-40" />
            <span className="absolute -inset-1 rounded-full bg-emerald-400/20 animate-pulse" />
          </>
        )}
      </span>
      <span className={`text-[11px] font-semibold tracking-wider uppercase fd ${
        running ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-600'
      }`}>
        {running ? 'Live' : 'Off'}
      </span>
    </span>
  )
}

function PortBadge({ port }: { port: number | null }) {
  if (!port) return null
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 dark:bg-white/[0.04] text-[11px] font-mono text-gray-500 dark:text-gray-400 tabular-nums">
      :{port}
    </span>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800/60 bg-white dark:bg-white/[0.05] p-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
          <div className="h-3 bg-gray-50 dark:bg-gray-800/60 rounded w-2/3" />
        </div>
      </div>
    </div>
  )
}

export default function AppsPage() {
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useThemeStore()
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

  const grouped = apps.reduce<Record<string, { title: string; apps: DevApp[] }>>((acc, app) => {
    if (!acc[app.session_id]) {
      acc[app.session_id] = { title: app.session_title, apps: [] }
    }
    acc[app.session_id].apps.push(app)
    return acc
  }, {})

  const runningCount = apps.filter((a) => a.status === 'running').length
  const totalCount = apps.length

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#1a1a24]">
      <style>{`
        .fd{font-family:'Outfit',system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif}
        @keyframes card-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes terminal-blink{0%,100%{opacity:1}50%{opacity:0}}
        .anim-card{animation:card-up .45s cubic-bezier(.22,1,.36,1) both}
        .anim-d1{animation-delay:.05s}
        .anim-d2{animation-delay:.1s}
        .anim-d3{animation-delay:.15s}
        .anim-d4{animation-delay:.2s}
        .term-cursor::after{content:'_';animation:terminal-blink 1s step-end infinite;color:#4ade80}
        .log-line{counter-increment:line}
        .log-line::before{content:counter(line);display:inline-block;width:2.5em;text-align:right;margin-right:1em;color:#4b5563;user-select:none;font-size:10px}
        .log-wrap{counter-reset:line}
        .glow-ring{box-shadow:0 0 0 1px rgba(16,185,129,0.1),0 0 20px -4px rgba(16,185,129,0.15)}
        .dark .glow-ring{box-shadow:0 0 0 1px rgba(52,211,153,0.08),0 0 24px -4px rgba(52,211,153,0.1)}
        .action-btn{transition:all .15s cubic-bezier(.22,1,.36,1)}
        .action-btn:hover{transform:translateY(-1px)}
        .action-btn:active{transform:translateY(0) scale(0.95)}
      `}</style>

      {/* ─── Header ─── */}
      <div className="sticky top-0 z-10 border-b border-gray-200/80 dark:border-gray-800/80 bg-white/70 dark:bg-[#22222e]/70 backdrop-blur-xl">
        <div className="px-6 h-16 flex items-center gap-3">
          <button
            onClick={() => navigate('/chat')}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 flex-1 fd">
            <Logo size={24} />
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">应用管理</h1>
          </div>
          <div className="flex items-center gap-3">
            {totalCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 dark:bg-white/[0.04]">
                <Radio className={`w-3 h-3 ${runningCount > 0 ? 'text-emerald-500' : 'text-gray-400'}`} />
                <span className="text-xs text-gray-500 dark:text-gray-400 fd tabular-nums">
                  <span className={`font-semibold ${runningCount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500'}`}>{runningCount}</span>
                  <span className="mx-0.5">/</span>
                  {totalCount}
                </span>
              </div>
            )}
            <button
              onClick={toggleTheme}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
            >
              {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* ─── 状态总览面板 ─── */}
        {!loading && apps.length > 0 && (
          <div className="anim-card relative overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800/60 bg-white dark:bg-white/[0.05]">
            {/* 网格背景 */}
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04]" style={{
              backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }} />
            {/* 渐变氛围 */}
            {runningCount > 0 && (
              <div className="absolute top-0 right-0 w-64 h-64 -translate-y-1/2 translate-x-1/4 rounded-full bg-emerald-400/[0.06] dark:bg-emerald-400/[0.03] blur-3xl" />
            )}

            <div className="relative px-6 py-6 flex items-center gap-8">
              {/* 主指标 — 运行数 */}
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                  runningCount > 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/40'
                    : 'bg-gray-100 dark:bg-gray-800/50'
                }`}>
                  <Radio className={`w-6 h-6 ${runningCount > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-600'}`} />
                </div>
                <div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-gray-50 fd tabular-nums leading-none">
                    {runningCount}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 fd">运行中</div>
                </div>
              </div>

              <div className="w-px h-10 bg-gray-200 dark:bg-gray-800" />

              {/* 总进程 */}
              <div className="text-center">
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100 fd tabular-nums">{totalCount}</div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500 fd">总进程</div>
              </div>

              <div className="w-px h-10 bg-gray-200 dark:bg-gray-800" />

              {/* 会话数 */}
              <div className="text-center">
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100 fd tabular-nums">{Object.keys(grouped).length}</div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500 fd">会话</div>
              </div>

              <div className="w-px h-10 bg-gray-200 dark:bg-gray-800" />

              {/* 端口列表 */}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-gray-400 dark:text-gray-500 fd mb-1.5">活跃端口</div>
                <div className="flex flex-wrap gap-1.5">
                  {apps.filter(a => a.status === 'running' && a.port).map(a => (
                    <a
                      key={a.port}
                      href={`http://localhost:${a.port}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                      :{a.port}
                    </a>
                  ))}
                  {apps.filter(a => a.status === 'running' && a.port).length === 0 && (
                    <span className="text-[11px] text-gray-300 dark:text-gray-600 font-mono">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 加载态 */}
        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* 空状态 */}
        {!loading && apps.length === 0 && (
          <div className="text-center py-24">
            <div className="relative inline-block mb-6">
              <div className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-white/[0.06] border border-gray-200 dark:border-gray-800 flex items-center justify-center">
                <Cpu className="w-8 h-8 text-gray-300 dark:text-gray-700" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-600" />
              </div>
            </div>
            <p className="text-gray-400 dark:text-gray-500 text-sm fd">还没有运行中的应用</p>
            <p className="text-gray-300 dark:text-gray-600 text-xs mt-1">
              在对话中让 Agent 启动一个项目试试
            </p>
          </div>
        )}

        {/* ─── 按会话分组 ─── */}
        {!loading &&
          Object.entries(grouped).map(([sessionId, { title, apps: sessionApps }], gi) => (
            <div key={sessionId} className={`anim-card ${gi === 0 ? 'anim-d1' : gi === 1 ? 'anim-d2' : 'anim-d3'}`}>
              {/* 会话标题 */}
              <div className="flex items-center gap-3 mb-3 px-1">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate fd font-medium">{title}</p>
                </div>
                <span className="text-[11px] text-gray-400 dark:text-gray-600 fd tabular-nums flex-shrink-0">
                  {sessionApps.length} 个进程
                </span>
              </div>

              {/* 进程列表 */}
              <div className="space-y-3">
                {sessionApps.map((app) => {
                  const key = `${app.session_id}/${app.name}`
                  const isExpanded = expandedLogs === key
                  const isActionLoading = actionLoading === key
                  const isRunning = app.status === 'running'

                  return (
                    <div
                      key={key}
                      className={`rounded-2xl border overflow-hidden transition-all duration-300 ${
                        isRunning
                          ? 'bg-white dark:bg-white/[0.05] border-emerald-200/60 dark:border-emerald-900/30 glow-ring'
                          : 'bg-white dark:bg-white/[0.015] border-gray-100 dark:border-gray-800/60'
                      } ${!isExpanded ? 'hover:shadow-lg hover:-translate-y-0.5' : 'shadow-lg'} cursor-pointer`}
                      onClick={() => navigate(`/chat?session=${app.session_id}`)}
                    >
                      <div className="px-5 py-4">
                        <div className="flex items-center gap-4">
                          {/* 图标 */}
                          <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                            isRunning
                              ? 'bg-emerald-50 dark:bg-emerald-950/30'
                              : 'bg-gray-50 dark:bg-gray-800/50'
                          }`}>
                            <Globe className={`w-5 h-5 transition-colors ${
                              isRunning
                                ? 'text-emerald-500 dark:text-emerald-400'
                                : 'text-gray-400 dark:text-gray-600'
                            }`} />
                            {isRunning && (
                              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white dark:border-[#09090f]" />
                            )}
                          </div>

                          {/* 信息 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2.5">
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 fd truncate">
                                {app.name}
                              </span>
                              <StatusIndicator status={app.status} />
                              {isRunning && <PortBadge port={app.port} />}
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-600 truncate mt-1 font-mono">
                              {app.command.join(' ')}
                            </p>
                          </div>

                          {/* 操作按钮 */}
                          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            {isRunning && app.port && (
                              <a
                                href={`http://localhost:${app.port}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="action-btn p-2.5 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors"
                                title="在浏览器中打开"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                            {isRunning ? (
                              <>
                                <button
                                  onClick={() => handleRestart(app)}
                                  disabled={isActionLoading}
                                  className="action-btn p-2.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl transition-colors disabled:opacity-40"
                                  title="重启"
                                >
                                  <RotateCw className={`w-4 h-4 ${isActionLoading ? 'animate-spin' : ''}`} />
                                </button>
                                <button
                                  onClick={() => handleStop(app)}
                                  disabled={isActionLoading}
                                  className="action-btn p-2.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-40"
                                  title="停止"
                                >
                                  <Square className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleRestart(app)}
                                disabled={isActionLoading}
                                className="action-btn p-2.5 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors disabled:opacity-40"
                                title="启动"
                              >
                                <Play className={`w-4 h-4 ${isActionLoading ? 'animate-spin' : ''}`} />
                              </button>
                            )}
                            <button
                              onClick={() => toggleLogs(app)}
                              className={`action-btn p-2.5 rounded-xl transition-colors ${
                                isExpanded
                                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'
                              }`}
                              title="查看日志"
                            >
                              <Terminal className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* ─── 终端日志 ─── */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 dark:border-gray-800/60" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between px-5 py-2 bg-gray-50/80 dark:bg-black/20">
                            <div className="flex items-center gap-2">
                              <div className="flex gap-1">
                                <span className="w-2 h-2 rounded-full bg-red-400/60" />
                                <span className="w-2 h-2 rounded-full bg-amber-400/60" />
                                <span className="w-2 h-2 rounded-full bg-emerald-400/60" />
                              </div>
                              <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500">
                                {app.name} — logs
                              </span>
                            </div>
                            <button
                              onClick={() => { setExpandedLogs(null); setLogs([]) }}
                              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="max-h-72 overflow-y-auto bg-[#0d1117] dark:bg-[#060609]">
                            {logsLoading ? (
                              <div className="px-5 py-4 text-xs text-gray-500 font-mono term-cursor">Loading</div>
                            ) : logs.length === 0 ? (
                              <div className="px-5 py-4 text-xs text-gray-600 font-mono">No output yet.</div>
                            ) : (
                              <div className="px-5 py-3 log-wrap">
                                {logs.map((line, i) => (
                                  <div key={i} className="log-line text-[12px] leading-5 font-mono text-gray-300 hover:bg-white/[0.02] -mx-2 px-2 rounded">
                                    {line || ' '}
                                  </div>
                                ))}
                              </div>
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

        {/* 页脚统计 */}
        {!loading && apps.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 pt-2">
            <Logo size={14} className="opacity-20" />
            <p className="text-xs text-gray-300 dark:text-gray-700 fd">
              共 {apps.length} 个进程，{runningCount} 个运行中
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
