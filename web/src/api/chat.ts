import apiClient from './client'
import type { ChatRequest, ChatResponse } from '@/types'

export const chatApi = {
  // 发送消息（非流式）
  send: async (request: ChatRequest) => {
    const { data } = await apiClient.post<ChatResponse>('/api/chat/', request)
    return data
  },

  // 获取聊天历史
  getHistory: async (sessionId: string, limit = 50) => {
    const { data } = await apiClient.get(`/api/messages/session/${sessionId}/history`, {
      params: { limit },
    })
    return data
  },

  // 停止生成
  stop: async (sessionId: string) => {
    const { data } = await apiClient.post(`/api/chat/${sessionId}/stop`)
    return data
  },

  // 审批工具调用
  approve: async (requestId: string, approved: boolean) => {
    const { data } = await apiClient.post('/api/chat/approve', {
      request_id: requestId,
      approved,
    })
    return data
  },

  // 获取 Agent 状态
  getStatus: async () => {
    const { data } = await apiClient.get('/api/chat/status')
    return data
  },
}
