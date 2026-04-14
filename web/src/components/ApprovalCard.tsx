import { useState, useCallback } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import { chatApi } from '@/api/chat'

interface ApprovalCardProps {
  requestId: string
  toolName: string
  toolInput: any
  onComplete: () => void
}

export default function ApprovalCard({
  requestId,
  toolName,
  toolInput,
  onComplete,
}: ApprovalCardProps) {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'expired'>('pending')

  const handleDecision = useCallback(async (approved: boolean) => {
    if (status !== 'pending') return

    // 先更新状态，防止重复点击
    setStatus(approved ? 'approved' : 'rejected')

    try {
      await chatApi.approve(requestId, approved)

      setTimeout(() => {
        onComplete()
      }, 800)
    } catch (error: any) {
      console.error('审批请求失败:', error)
      if (error.response?.status === 404) {
        // request_id 不存在（服务重启 / 已过期）
        setStatus('expired')
      } else {
        setStatus('rejected')
      }

      setTimeout(() => {
        onComplete()
      }, 1500)
    }
  }, [status, requestId, onComplete])

  const getToolLabel = (name: string) => {
    const map: Record<string, string> = {
      list_dir: '查看工作区',
      read_file: '读取文件',
      write_file: '写入文件',
      edit_file: '编辑文件',
      web_search: '网络搜索',
      search_web: '网络搜索',
      fetch_url: '访问网页',
      python_repl: '执行Python代码',
      run_command: '执行命令',
      skill: '加载技能',
    }
    return map[name] || name.replace(/_/g, ' ')
  }

  if (status === 'approved') {
    return (
      <div className="my-3 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
          <Check className="w-4 h-4" />
          <span className="text-sm font-medium">已允许</span>
        </div>
      </div>
    )
  }

  if (status === 'rejected') {
    return (
      <div className="my-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
          <X className="w-4 h-4" />
          <span className="text-sm font-medium">已拒绝</span>
        </div>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="my-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <X className="w-4 h-4" />
          <span className="text-sm font-medium">审批已失效（服务已重启或会话已结束）</span>
        </div>
      </div>
    )
  }

  return (
    <div className="my-3 px-4 py-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
        <span className="text-sm font-medium text-orange-900 dark:text-orange-100">需要授权</span>
      </div>

      {/* Tool Info */}
      <div className="mb-3">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
          工具：{getToolLabel(toolName)}
        </div>
        {Object.keys(toolInput).length > 0 && (
          <pre className="text-xs bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto">
            {JSON.stringify(toolInput, null, 2)}
          </pre>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => handleDecision(false)}
          className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          拒绝
        </button>
        <button
          onClick={() => handleDecision(true)}
          className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
        >
          ✓ 允许
        </button>
      </div>
    </div>
  )
}
