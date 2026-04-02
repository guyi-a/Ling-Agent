import { X, FileText, Image as ImageIcon, File } from 'lucide-react'
import type { WorkspaceFile } from '@/types'

interface AttachmentChipProps {
  file: WorkspaceFile
  onRemove: () => void
}

export default function AttachmentChip({ file, onRemove }: AttachmentChipProps) {
  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) {
      return <ImageIcon className="w-3 h-3" />
    }
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext || '')) {
      return <FileText className="w-3 h-3" />
    }
    return <File className="w-3 h-3" />
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600 group">
      <div className="text-gray-600 dark:text-gray-400">
        {getFileIcon(file.name)}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-sm text-gray-900 dark:text-gray-100 truncate max-w-[150px]" title={file.name}>
          {file.name}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatSize(file.size)}
        </span>
      </div>
      <button
        onClick={onRemove}
        className="ml-1 p-0.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 rounded transition-colors"
        title="移除"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
