import apiClient from './client'
import type { Session } from '@/types'

export const sessionsApi = {
  // 获取所有会话
  getAll: async (params?: { skip?: number; limit?: number; is_active?: boolean }) => {
    const { data } = await apiClient.get<Session[]>('/api/sessions/', { params })
    return data
  },

  // 获取单个会话
  getById: async (sessionId: string) => {
    const { data } = await apiClient.get<Session>(`/api/sessions/${sessionId}`)
    return data
  },

  // 创建新会话
  create: async (title: string) => {
    const { data } = await apiClient.post<Session>('/api/sessions/', { title })
    return data
  },

  // 更新会话
  update: async (sessionId: string, updates: { title?: string; is_active?: boolean; is_pinned?: boolean }) => {
    const { data } = await apiClient.put<Session>(`/api/sessions/${sessionId}`, updates)
    return data
  },

  // 删除会话
  delete: async (sessionId: string, hardDelete = false) => {
    await apiClient.delete(`/api/sessions/${sessionId}`, { params: { hard_delete: hardDelete } })
  },
}
