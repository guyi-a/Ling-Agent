import { useEffect, useState, useCallback } from 'react'
import { Play, Square, RotateCcw, ChevronDown, ChevronRight, Terminal, Circle } from 'lucide-react'
import { devApi } from '@/api/dev'
import type { DevProcess } from '@/types'

interface ProcessPanelProps {
  sessionId: string | null
  isStreaming?: boolean
}

export default function ProcessPanel({ sessionId, isStreaming }: ProcessPanelProps) {
  const [processes, setProcesses] = useState<DevProcess[]>([])
  const [expandedLogs, setExpandedLogs] = useState<Record<string, string[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const loadProcesses = useCallback(async () => {
    if (!sessionId) {
      setProcesses([])
      return
    }
    try {
      const data = await devApi.listProcesses(sessionId)
      setProcesses(data)
    } catch {
      // 静默失败（session 可能还没有进程）
    }
  }, [sessionId])

  // 轮询进程状态
  useEffect(() => {
    loadProcesses()
    if (!sessionId) return

    const interval = setInterval(loadProcesses, isStreaming ? 2000 : 5000)
    return () => clearInterval(interval)
  }, [sessionId, isStreaming, loadProcesses])

  const handleStop = async (name: string) => {
    if (!sessionId) return
    try {
      await devApi.stopProcess(sessionId, name)
      await loadProcesses()
    } catch (error) {
      console.error('停止进程失败:', error)
    }
  }

  const toggleLogs = async (name: string) => {
    const next = new Set(expanded)
    if (next.has(name)) {
      next.delete(name)
    } else {
      next.add(name)
      // 加载日志
      if (sessionId) {
        try {
          const lines = await devApi.getLogs(sessionId, name, 30)
          setExpandedLogs(prev => ({ ...prev, [name]: lines }))
        } catch {
          setExpandedLogs(prev => ({ ...prev, [name]: ['(无法加载日志)'] }))
        }
      }
    }
    setExpanded(next)
  }

  // 没有进程时不渲染
  if (processes.length === 0) return null

  const statusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-green-500'
      case 'exited': return 'text-red-500'
      default: return 'text-yellow-500'
    }
  }

  const statusLabel = (p: DevProcess) => {
    if (p.status === 'running') return '运行中'
    if (p.status === 'exited') return p.exit_code !== null ? `已退出 (${p.exit_code})` : '已退出'
    return '启动中'
  }

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex items-center gap-2 mb-1">
          <Terminal className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            后台进程 ({processes.length})
          </h4>
        </div>
      </div>

      <div className="px-2 py-2 max-h-72 overflow-y-auto space-y-1">
        {processes.map((proc) => (
          <div key={proc.name} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* 进程头部 */}
            <div
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
              onClick={() => toggleLogs(proc.name)}
            >
              {/* 展开箭头 */}
              {expanded.has(proc.name)
                ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              }

              {/* 状态圆点 */}
              <Circle className={`w-2.5 h-2.5 fill-current ${statusColor(proc.status)} flex-shrink-0`} />

              {/* 名称 + 端口 */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-mono text-gray-900 dark:text-gray-100 truncate">
                  {proc.name}
                </span>
                {proc.port && (
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    :{proc.port}
                  </span>
                )}
              </div>

              {/* 状态文字 */}
              <span className={`text-xs flex-shrink-0 ${statusColor(proc.status)}`}>
                {statusLabel(proc)}
              </span>

              {/* 操作按钮 */}
              {proc.status === 'running' && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleStop(proc.name) }}
                  className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors flex-shrink-0"
                  title="停止"
                >
                  <Square className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* 展开的日志 */}
            {expanded.has(proc.name) && (
              <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-900 dark:bg-black max-h-40 overflow-y-auto">
                <pre className="p-2 text-xs font-mono text-green-400 whitespace-pre-wrap break-all">
                  {(expandedLogs[proc.name] || []).length > 0
                    ? expandedLogs[proc.name].join('\n')
                    : '(暂无输出)'
                  }
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
