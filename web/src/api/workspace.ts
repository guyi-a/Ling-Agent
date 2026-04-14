import apiClient from './client'
import type { WorkspaceFile, ProjectInfo, TreeEntry } from '@/types'

export const workspaceApi = {
  // 上传文件
  upload: async (sessionId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    const { data } = await apiClient.post(`/api/workspace/${sessionId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  // 列出文件
  listFiles: async (sessionId: string, folder?: 'uploads' | 'outputs') => {
    const { data } = await apiClient.get<{ session_id: string; files: WorkspaceFile[] }>(
      `/api/workspace/${sessionId}/files`,
      { params: folder ? { folder } : {} }
    )
    return data.files
  },

  // 下载文件
  downloadUrl: (sessionId: string, folder: string, filename: string) => {
    return `/api/workspace/${sessionId}/files/${folder}/${filename}`
  },

  // 删除文件
  deleteFile: async (sessionId: string, folder: string, filename: string) => {
    await apiClient.delete(`/api/workspace/${sessionId}/files/${folder}/${filename}`)
  },

  // 按路径删除文件（支持嵌套目录）
  deleteByPath: async (sessionId: string, path: string) => {
    await apiClient.delete(`/api/workspace/${sessionId}/delete`, { params: { path } })
  },

  // 按路径下载文件（支持嵌套目录）
  downloadByPathUrl: (sessionId: string, path: string) => {
    return `/api/workspace/${sessionId}/download?path=${encodeURIComponent(path)}`
  },

  // 列出项目
  listProjects: async (sessionId: string): Promise<ProjectInfo[]> => {
    const { data } = await apiClient.get<{ session_id: string; projects: ProjectInfo[] }>(
      `/api/workspace/${sessionId}/projects`
    )
    return data.projects
  },

  // 获取项目目录树
  getProjectTree: async (sessionId: string, path: string): Promise<TreeEntry[]> => {
    const { data } = await apiClient.get<{ session_id: string; root: string; entries: TreeEntry[] }>(
      `/api/workspace/${sessionId}/tree`,
      { params: { path } }
    )
    return data.entries
  },
}
