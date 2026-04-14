import { useState } from 'react'
import { Copy, RotateCw, Edit2, Trash2, Scissors, Check } from 'lucide-react'

interface MessageActionsProps {
  role: 'user' | 'assistant'
  disabled?: boolean
  isLastAssistantMessage?: boolean
  onCopy: () => void
  onRegenerate?: () => void
  onEdit?: () => void
  onDelete: () => void
  onDeleteAfter?: () => void
}

export default function MessageActions({
  role,
  disabled = false,
  isLastAssistantMessage = false,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
  onDeleteAfter,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (disabled) return null

  return (
    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-1 shadow-sm">
      {/* 复制按钮 */}
      <button
        onClick={handleCopy}
        className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
        title={copied ? '已复制' : '复制'}
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>

      {/* 编辑按钮（仅用户消息） */}
      {role === 'user' && onEdit && (
        <button
          onClick={onEdit}
          className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
          title="编辑"
        >
          <Edit2 className="w-4 h-4" />
        </button>
      )}

      {/* 重新生成按钮（仅最后一条 AI 消息） */}
      {role === 'assistant' && isLastAssistantMessage && onRegenerate && (
        <button
          onClick={onRegenerate}
          className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
          title="重新生成"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      )}

      {/* 从此处删除按钮 */}
      {onDeleteAfter && (
        <button
          onClick={onDeleteAfter}
          className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors"
          title="从此处删除"
        >
          <Scissors className="w-4 h-4" />
        </button>
      )}

      {/* 删除按钮 */}
      <button
        onClick={onDelete}
        className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
        title="删除"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}
