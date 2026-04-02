import { useEffect, useState, useRef, useCallback } from 'react'
import { Upload, Download, Trash2, FileText, Image as ImageIcon, File, Eye, X, RefreshCw, Package } from 'lucide-react'
import { workspaceApi } from '@/api/workspace'
import { useAuthStore } from '@/stores/authStore'
import type { WorkspaceFile } from '@/types'

interface WorkspacePanelProps {
  sessionId: string | null
  isStreaming?: boolean
}

export default function WorkspacePanel({ sessionId, isStreaming }: WorkspacePanelProps) {
  const [uploadFiles, setUploadFiles] = useState<WorkspaceFile[]>([])
  const [outputFiles, setOutputFiles] = useState<WorkspaceFile[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const token = useAuthStore((state) => state.token)

  // 清理 object URL
  const closePreview = useCallback(() => {
    if (previewContent && previewContent.startsWith('blob:')) {
      URL.revokeObjectURL(previewContent)
    }
    setPreviewFile(null)
    setPreviewContent(null)
  }, [previewContent])

  const loadFiles = useCallback(async () => {
    if (!sessionId) {
      setUploadFiles([])
      setOutputFiles([])
      return
    }

    try {
      setLoading(true)
      const data = await workspaceApi.listFiles(sessionId)
      setUploadFiles(data.filter((f) => f.folder === 'uploads'))
      setOutputFiles(data.filter((f) => f.folder === 'outputs'))
    } catch (error) {
      console.error('加载文件列表失败:', error)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  // 初始加载
  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  // 自动刷新：AI 生成时每2秒刷新，平时每5秒刷新
  useEffect(() => {
    if (!sessionId) return

    const interval = setInterval(() => {
      loadFiles()
    }, isStreaming ? 2000 : 5000)

    return () => clearInterval(interval)
  }, [sessionId, isStreaming, loadFiles])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!sessionId || !e.target.files?.length) return

    const file = e.target.files[0]
    try {
      setUploading(true)
      await workspaceApi.upload(sessionId, file)
      await loadFiles()
    } catch (error) {
      console.error('上传失败:', error)
      alert('上传失败，请重试')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDownload = async (file: WorkspaceFile) => {
    if (!sessionId) return

    try {
      const url = workspaceApi.downloadUrl(sessionId, file.folder, file.name)
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch (error) {
      console.error('下载失败:', error)
      alert('下载失败，请重试')
    }
  }

  const handleDownloadAll = async () => {
    if (!sessionId || outputFiles.length === 0) return

    for (const file of outputFiles) {
      await handleDownload(file)
      // 延迟一下，避免浏览器阻止多个下载
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }

  const handlePreview = async (file: WorkspaceFile) => {
    if (!sessionId) return
    setPreviewFile(file)
    setPreviewContent(null)

    const ext = file.name.split('.').pop()?.toLowerCase()
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')
    const isText = ['txt', 'md', 'json', 'py', 'js', 'ts', 'tsx', 'jsx', 'css', 'html'].includes(ext || '')

    try {
      const url = workspaceApi.downloadUrl(sessionId, file.folder, file.name)
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      if (isImage || ext === 'pdf') {
        // 图片和 PDF：获取 blob，创建 object URL
        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        setPreviewContent(objectUrl)
      } else if (isText) {
        // 文本文件：直接获取文本内容
        const text = await response.text()
        setPreviewContent(text)
      } else {
        setPreviewContent(null)
      }
    } catch (error) {
      console.error('获取文件内容失败:', error)
      setPreviewContent('error')
    }
  }

  const handleDelete = async (file: WorkspaceFile) => {
    if (!sessionId || !confirm(`确定删除文件 ${file.name}？`)) return

    try {
      await workspaceApi.deleteFile(sessionId, file.folder, file.name)
      await loadFiles()
    } catch (error) {
      console.error('删除失败:', error)
      alert('删除失败，请重试')
    }
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

  const canPreview = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'txt', 'md', 'json', 'py', 'js', 'ts', 'tsx', 'jsx', 'css', 'html'].includes(ext || '')
  }

  const renderFileList = (files: WorkspaceFile[]) => {
    if (files.length === 0) {
      return (
        <div className="text-center py-6 text-gray-500 dark:text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
          <p className="text-xs">暂无文件</p>
        </div>
      )
    }

    return (
      <div className="space-y-1">
        {files.map((file, idx) => (
          <div
            key={idx}
            className="group px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-start gap-2">
              <div className="text-gray-500 dark:text-gray-400 mt-1">{getFileIcon(file.name)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-gray-100 truncate" title={file.name}>
                  {file.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {formatSize(file.size)}
                </p>
              </div>
              <div className="hidden group-hover:flex items-center gap-1">
                {canPreview(file.name) && (
                  <button
                    onClick={() => handlePreview(file)}
                    className="p-1 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                    title="预览"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={() => handleDownload(file)}
                  className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
                  title="下载"
                >
                  <Download className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleDelete(file)}
                  className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                  title="删除"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">工作区</h3>
            {sessionId && (
              <button
                onClick={loadFiles}
                disabled={loading}
                className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                title="刷新"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
          {!sessionId && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">开始新对话后可上传文件</p>
          )}
        </div>

        {/* Upload Section */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">📤 上传区</h4>
              {sessionId && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  <Upload className="w-3 h-3" />
                  {uploading ? '上传中...' : '上传'}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleUpload}
                className="hidden"
                accept="image/*,.pdf,.csv,.txt,.md,.json,.py,.js,.ts"
              />
            </div>
          </div>
          <div className="px-2 py-2 max-h-64 overflow-y-auto">
            {loading && uploadFiles.length === 0 ? (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-xs">
                加载中...
              </div>
            ) : (
              renderFileList(uploadFiles)
            )}
          </div>
        </div>

        {/* Output Section */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">📥 生成区</h4>
              {sessionId && outputFiles.length > 0 && (
                <button
                  onClick={handleDownloadAll}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                  title="下载全部"
                >
                  <Package className="w-3 h-3" />
                  全部下载
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 px-2 py-2 overflow-y-auto">
            {loading && outputFiles.length === 0 ? (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-xs">
                加载中...
              </div>
            ) : (
              renderFileList(outputFiles)
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={closePreview}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl max-h-[90vh] w-full mx-4 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                {previewFile.name}
              </h3>
              <button
                onClick={closePreview}
                className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {!previewContent ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p>加载中...</p>
                </div>
              ) : previewContent === 'error' ? (
                <div className="text-center py-8 text-red-500 dark:text-red-400">
                  <FileText className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p>加载失败，请检查网络或稍后重试</p>
                </div>
              ) : (() => {
                const ext = previewFile.name.split('.').pop()?.toLowerCase()
                const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')
                const isText = ['txt', 'md', 'json', 'py', 'js', 'ts', 'tsx', 'jsx', 'css', 'html'].includes(ext || '')

                if (isImage) {
                  return (
                    <img
                      src={previewContent}
                      alt={previewFile.name}
                      className="max-w-full h-auto mx-auto"
                    />
                  )
                } else if (ext === 'pdf') {
                  return (
                    <iframe
                      src={previewContent}
                      className="w-full h-[70vh] border-0"
                      title={previewFile.name}
                    />
                  )
                } else if (isText) {
                  return (
                    <pre className="text-sm bg-gray-50 dark:bg-gray-900 p-4 rounded overflow-x-auto">
                      <code className="text-gray-900 dark:text-gray-100">{previewContent}</code>
                    </pre>
                  )
                } else {
                  return (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <FileText className="w-16 h-16 mx-auto mb-4 opacity-20" />
                      <p>此文件类型不支持预览</p>
                    </div>
                  )
                }
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => handleDownload(previewFile)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                下载
              </button>
              <button
                onClick={closePreview}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
