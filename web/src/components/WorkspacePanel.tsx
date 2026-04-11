import { useEffect, useState, useRef, useCallback } from 'react'
import { Upload, Download, Trash2, FileText, Image as ImageIcon, File, Eye, X, RefreshCw, Package, FolderOpen, Folder, ChevronDown, ChevronRight, Play, Square, Loader2, RotateCw } from 'lucide-react'
import { workspaceApi } from '@/api/workspace'
import { devApi } from '@/api/dev'
import { useAuthStore } from '@/stores/authStore'
import type { WorkspaceFile, ProjectInfo, TreeEntry, DevProcess } from '@/types'

interface WorkspacePanelProps {
  sessionId: string | null
  isStreaming?: boolean
  onOpenPreview?: (url: string, title: string) => void
}

export default function WorkspacePanel({ sessionId, isStreaming, onOpenPreview }: WorkspacePanelProps) {
  const [uploadFiles, setUploadFiles] = useState<WorkspaceFile[]>([])
  const [outputFiles, setOutputFiles] = useState<WorkspaceFile[]>([])
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [projectTrees, setProjectTrees] = useState<Record<string, TreeEntry[]>>({})
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [processes, setProcesses] = useState<DevProcess[]>([])
  const [startingProjects, setStartingProjects] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const token = useAuthStore((state) => state.token)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  // 清理 object URL
  const closePreview = useCallback(() => {
    if (previewContent && previewContent.startsWith('blob:')) {
      URL.revokeObjectURL(previewContent)
    }
    setPreviewFile(null)
    setPreviewContent(null)
  }, [previewContent])

  // 比较文件列表是否相同（避免不必要的状态更新）
  const filesEqual = (a: WorkspaceFile[], b: WorkspaceFile[]) => {
    if (a.length !== b.length) return false
    return a.every((file, idx) =>
      file.name === b[idx]?.name &&
      file.size === b[idx]?.size &&
      file.folder === b[idx]?.folder
    )
  }

  const loadFiles = useCallback(async (showLoading = false) => {
    if (!sessionId) {
      setUploadFiles([])
      setOutputFiles([])
      return
    }

    try {
      if (showLoading) setLoading(true)
      const data = await workspaceApi.listFiles(sessionId)
      const newUploads = data.filter((f) => f.folder === 'uploads')
      const newOutputs = data.filter((f) => f.folder === 'outputs')

      // 只有文件列表真的改变时才更新状态
      setUploadFiles(prev => filesEqual(prev, newUploads) ? prev : newUploads)
      setOutputFiles(prev => filesEqual(prev, newOutputs) ? prev : newOutputs)
    } catch (error) {
      console.error('加载文件列表失败:', error)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [sessionId])

  const loadProjects = useCallback(async () => {
    if (!sessionId) {
      setProjects([])
      return
    }
    try {
      const data = await workspaceApi.listProjects(sessionId)
      setProjects(prev => {
        if (prev.length !== data.length) return data
        const same = prev.every((p, i) => p.name === data[i]?.name && p.file_count === data[i]?.file_count && p.total_size === data[i]?.total_size)
        return same ? prev : data
      })
    } catch {
      // 静默失败
    }
  }, [sessionId])

  const toggleProject = async (projectName: string) => {
    const next = new Set(expandedProjects)
    if (next.has(projectName)) {
      next.delete(projectName)
    } else {
      next.add(projectName)
      // 加载目录树
      if (sessionId) {
        try {
          const tree = await workspaceApi.getProjectTree(sessionId, `outputs/projects/${projectName}`)
          setProjectTrees(prev => ({ ...prev, [projectName]: tree }))
        } catch {
          setProjectTrees(prev => ({ ...prev, [projectName]: [] }))
        }
      }
    }
    setExpandedProjects(next)
  }

  const loadProcesses = useCallback(async () => {
    if (!sessionId) { setProcesses([]); return }
    try {
      const data = await devApi.listProcesses(sessionId)
      setProcesses(data)
    } catch { /* 静默 */ }
  }, [sessionId])

  // 根据项目名找到对应进程
  const getProjectProcess = (projName: string): DevProcess | undefined => {
    return processes.find(p => p.name === `${projName}-server`)
  }

  const handleStartServer = async (proj: ProjectInfo) => {
    if (!sessionId) return
    setStartingProjects(prev => new Set(prev).add(proj.name))
    try {
      await devApi.startProcess(sessionId, {
        name: `${proj.name}-server`,
        command: 'python -m uvicorn main:app --host 127.0.0.1',
        workdir: proj.path,
      })
      await loadProcesses()
    } catch (error: any) {
      console.error('启动服务失败:', error)
      const detail = error?.response?.data?.detail || '启动服务失败，请重试'
      showToast(detail)
    } finally {
      setStartingProjects(prev => {
        const next = new Set(prev)
        next.delete(proj.name)
        return next
      })
    }
  }

  const handleStopServer = async (proj: ProjectInfo) => {
    if (!sessionId) return
    try {
      await devApi.stopProcess(sessionId, `${proj.name}-server`)
      await loadProcesses()
    } catch (error) {
      console.error('停止服务失败:', error)
    }
  }

  const handleRestartServer = async (proj: ProjectInfo) => {
    if (!sessionId) return
    try {
      await devApi.restartProcess(sessionId, `${proj.name}-server`)
      await loadProcesses()
    } catch (error) {
      console.error('重启服务失败:', error)
      showToast('重启服务失败')
    }
  }

  const toggleDir = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // sessionId 变化时静默加载新数据（不清空、不显示 loading，避免闪烁）
  const prevSessionRef = useRef<string | null>(null)
  useEffect(() => {
    const isSwitch = sessionId !== prevSessionRef.current
    prevSessionRef.current = sessionId

    if (isSwitch && sessionId) {
      // 切换会话：静默加载，到达后直接替换，不显示 loading
      loadFiles()
      loadProjects()
      loadProcesses()
      // 重置展开状态
      setExpandedProjects(new Set())
      setProjectTrees({})
      setExpandedDirs(new Set())
    } else if (isSwitch && !sessionId) {
      // 新对话：清空所有数据
      setUploadFiles([])
      setOutputFiles([])
      setProjects([])
      setProcesses([])
      setExpandedProjects(new Set())
      setProjectTrees({})
      setExpandedDirs(new Set())
    } else {
      // 非切换（首次挂载等）
      loadFiles(true)
      loadProjects()
      loadProcesses()
    }
  }, [loadFiles, loadProjects, loadProcesses, sessionId])

  // 自动刷新：AI 生成时每2秒刷新，平时每5秒刷新
  useEffect(() => {
    if (!sessionId) return

    const interval = setInterval(() => {
      loadFiles()
      loadProjects()
      loadProcesses()
    }, isStreaming ? 2000 : 5000)

    return () => clearInterval(interval)
  }, [sessionId, isStreaming, loadFiles, loadProjects, loadProcesses])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!sessionId || !e.target.files?.length) return

    const file = e.target.files[0]
    try {
      setUploading(true)
      await workspaceApi.upload(sessionId, file)
      await loadFiles()
    } catch (error) {
      console.error('上传失败:', error)
      showToast('上传失败，请重试')
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
      showToast('下载失败，请重试')
    }
  }

  const handleDownloadByPath = async (path: string, filename: string) => {
    if (!sessionId) return
    try {
      const url = workspaceApi.downloadByPathUrl(sessionId, path)
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch (error) {
      console.error('下载失败:', error)
      showToast('下载失败，请重试')
    }
  }

  const handlePreviewByPath = async (path: string, filename: string) => {
    if (!sessionId) return
    setPreviewFile({ name: filename, path, folder: '', size: 0, modified_at: 0 })
    setPreviewContent(null)

    const ext = filename.split('.').pop()?.toLowerCase()
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')
    const isText = ['txt', 'md', 'json', 'py', 'js', 'ts', 'tsx', 'jsx', 'css', 'html'].includes(ext || '')

    try {
      const url = workspaceApi.downloadByPathUrl(sessionId, path)
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      if (isImage || ext === 'pdf') {
        const blob = await response.blob()
        setPreviewContent(URL.createObjectURL(blob))
      } else if (isText) {
        setPreviewContent(await response.text())
      } else {
        setPreviewContent(null)
      }
    } catch (error) {
      console.error('获取文件内容失败:', error)
      setPreviewContent('error')
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
      showToast('删除失败，请重试')
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

  const renderTree = (entries: TreeEntry[], projectName: string) => {
    return (
      <div className="space-y-0.5">
        {entries.map((entry) => {
          const fullPath = entry.path
          if (entry.type === 'dir') {
            const isExpanded = expandedDirs.has(fullPath)
            return (
              <div key={fullPath}>
                <div
                  className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer transition-colors"
                  onClick={() => toggleDir(fullPath)}
                >
                  {isExpanded
                    ? <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    : <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  }
                  <Folder className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{entry.name}/</span>
                </div>
                {isExpanded && entry.children && (
                  <div className="pl-4">
                    {renderTree(entry.children, projectName)}
                  </div>
                )}
              </div>
            )
          }
          // file
          return (
            <div key={fullPath} className="group flex items-center gap-1.5 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors">
              <div className="w-3 h-3 flex-shrink-0" /> {/* indent spacer */}
              <div className="text-gray-500 dark:text-gray-400 flex-shrink-0">{getFileIcon(entry.name)}</div>
              <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1" title={entry.name}>
                {entry.name}
              </span>
              {entry.size !== undefined && (
                <span className="text-xs text-gray-400 flex-shrink-0">{formatSize(entry.size)}</span>
              )}
              <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                {canPreview(entry.name) && (
                  <button
                    onClick={() => handlePreviewByPath(fullPath, entry.name)}
                    className="p-0.5 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                    title="预览"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={() => handleDownloadByPath(fullPath, entry.name)}
                  className="p-0.5 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded"
                  title="下载"
                >
                  <Download className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
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
                  className="p-1 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded"
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
                onClick={() => loadFiles(true)}
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

        {sessionId ? (
          <>
            {/* Upload Section */}
            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">📤 上传区</h4>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-gradient-to-r from-primary-500 to-accent-600 text-white rounded hover:from-primary-600 hover:to-accent-700 disabled:opacity-50 transition-colors"
                  >
                    <Upload className="w-3 h-3" />
                    {uploading ? '上传中...' : '上传'}
                  </button>
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
            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">📥 生成区</h4>
                  {outputFiles.length > 0 && (
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
              <div className="px-2 py-2 max-h-64 overflow-y-auto">
                {loading && outputFiles.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-xs">
                    加载中...
                  </div>
                ) : (
                  renderFileList(outputFiles)
                )}
              </div>
            </div>

            {/* Projects Section */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">📁 项目区</h4>
              </div>
              <div className="flex-1 px-2 py-2 overflow-y-auto">
                {projects.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                    <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-xs">暂无项目</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {projects.map((proj) => (
                      <div key={proj.name} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        {(() => {
                          const proc = getProjectProcess(proj.name)
                          const isStarting = startingProjects.has(proj.name)
                          const isRunning = proc?.status === 'running'
                          return (
                            <div
                              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                              onClick={() => toggleProject(proj.name)}
                            >
                              {expandedProjects.has(proj.name)
                                ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              }
                              <FolderOpen className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate block">
                                  {proj.name}
                                </span>
                                {isRunning && proc?.port ? (
                                  <span className="text-xs text-green-600 dark:text-green-400">
                                    :{proc.port} 运行中
                                  </span>
                                ) : null}
                              </div>
                              <span className="text-xs text-gray-400 flex-shrink-0">
                                {proj.file_count} files
                              </span>
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                {isStarting ? (
                                  <div className="p-1">
                                    <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                                  </div>
                                ) : isRunning ? (
                                  <>
                                    {onOpenPreview && proc?.port && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); onOpenPreview(`/api/preview/${proc.port}/`, proj.name) }}
                                        className="p-1 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
                                        title="预览"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleRestartServer(proj) }}
                                      className="p-1 text-orange-500 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded transition-colors"
                                      title="重启服务"
                                    >
                                      <RotateCw className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleStopServer(proj) }}
                                      className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                                      title="停止服务"
                                    >
                                      <Square className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                ) : proj.file_count > 0 ? (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleStartServer(proj) }}
                                    className="p-1 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
                                    title="启动服务"
                                  >
                                    <Play className="w-3.5 h-3.5" />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          )
                        })()}

                        {expandedProjects.has(proj.name) && (
                          <div className="border-t border-gray-200 dark:border-gray-700 pl-4 py-1">
                            {(projectTrees[proj.name] || []).length > 0
                              ? renderTree(projectTrees[proj.name], proj.name)
                              : <p className="text-xs text-gray-500 dark:text-gray-400 py-2 px-2">(空项目)</p>
                            }
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-400 dark:text-gray-500">
              <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">选择或创建对话后</p>
              <p className="text-sm">即可使用工作区</p>
            </div>
          </div>
        )}
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
                onClick={() => previewFile.folder
                  ? handleDownload(previewFile)
                  : handleDownloadByPath(previewFile.path, previewFile.name)
                }
                className="px-4 py-2 bg-gradient-to-r from-primary-500 to-accent-600 text-white rounded-lg hover:from-primary-600 hover:to-accent-700 transition-colors"
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 text-sm rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </>
  )
}
