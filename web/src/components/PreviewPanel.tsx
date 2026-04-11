import { useRef, useCallback } from 'react'
import { RefreshCw, ExternalLink, X } from 'lucide-react'

interface PreviewPanelProps {
  url: string
  title: string
  onClose: () => void
}

export default function PreviewPanel({ url, title, onClose }: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const handleRefresh = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src
    }
  }, [])

  const handleOpenExternal = useCallback(() => {
    // 从代理 URL 提取端口，构建直接访问地址
    const match = url.match(/\/api\/preview\/(\d+)/)
    if (match) {
      window.open(`http://localhost:${match[1]}/`, '_blank')
    }
  }, [url])

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
          {title}
        </span>
        <button
          onClick={handleRefresh}
          className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title="刷新"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleOpenExternal}
          className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title="在新标签页打开"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
          title="关闭预览"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* iframe */}
      <div className="flex-1 relative">
        <iframe
          ref={iframeRef}
          src={url}
          className="absolute inset-0 w-full h-full border-0"
          title={title}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  )
}
