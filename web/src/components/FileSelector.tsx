import { useState, useEffect } from 'react'
import { X, FileText, Image as ImageIcon, File, Upload as UploadIcon } from 'lucide-react'
import { workspaceApi } from '@/api/workspace'
import type { WorkspaceFile } from '@/types'

interface FileSelectorProps {
  sessionId: string | null
  open: boolean
  onClose: () => void
  onSelect: (files: WorkspaceFile[]) => void
}

export default function FileSelector({ sessionId, open, onClose, onSelect }: FileSelectorProps) {
  const [uploadFiles, setUploadFiles] = useState<WorkspaceFile[]>([])
  const [outputFiles, setOutputFiles] = useState<WorkspaceFile[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Map<string, WorkspaceFile>>(new Map())
  const [activeTab, setActiveTab] = useState<'uploads' | 'outputs'>('uploads')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && sessionId) {
      loadFiles()
    }
  }, [open, sessionId])

  const loadFiles = async () => {
    if (!sessionId) return

    try {
      setLoading(true)
      const files = await workspaceApi.listFiles(sessionId)
      setUploadFiles(files.filter((f) => f.folder === 'uploads'))
      setOutputFiles(files.filter((f) => f.folder === 'outputs'))
    } catch (error) {
      console.error('加载文件列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleFile = (file: WorkspaceFile) => {
    setSelectedFiles((prev) => {
      const next = new Map(prev)
      if (next.has(file.path)) {
        next.delete(file.path)
      } else {
        next.set(file.path, file)
      }
      return next
    })
  }

  const handleConfirm = () => {
    onSelect(Array.from(selectedFiles.values()))
    setSelectedFiles(new Map())
  }

  const handleClose = () => {
    setSelectedFiles(new Map())
    onClose()
  }

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) {
      return <ImageIcon className="w-4 h-4" />
    }
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext || '')) {
      return <FileText className="w-4 h-4" />
    }
    return <File className="w-4 h-4" />
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const renderFileList = (files: WorkspaceFile[]) => {
    if (loading) {
      return (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm">加载中...</p>
        </div>
      )
    }

    if (files.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <UploadIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">暂无文件</p>
          <p className="text-xs mt-1">请先在工作区面板上传文件</p>
        </div>
      )
    }

    return (
      <div className="space-y-1">
        {files.map((file) => {
          const isSelected = selectedFiles.has(file.path)
          return (
            <label
              key={file.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-900/20 dark:to-accent-900/20 gradient-border'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleFile(file)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <div className="text-gray-600 dark:text-gray-400">
                {getFileIcon(file.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-gray-100 truncate" title={file.name}>
                  {file.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {formatSize(file.size)}
                </p>
              </div>
            </label>
          )
        })}
      </div>
    )
  }

  if (!open) return null

  const currentFiles = activeTab === 'uploads' ? uploadFiles : outputFiles

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl max-h-[80vh] mx-4 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            选择要附加的文件
          </h3>
          <button
            onClick={handleClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('uploads')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'uploads'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            📤 上传区 ({uploadFiles.length})
          </button>
          <button
            onClick={() => setActiveTab('outputs')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'outputs'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            📥 生成区 ({outputFiles.length})
          </button>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderFileList(currentFiles)}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            已选择 {selectedFiles.size} 个文件
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedFiles.size === 0}
              className="px-4 py-2 bg-gradient-to-r from-primary-500 to-accent-600 text-white rounded-lg hover:from-primary-600 hover:to-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              确定附加 ({selectedFiles.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
