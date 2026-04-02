import apiClient from './client'
import type { WorkspaceFile } from '@/types'

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
}
