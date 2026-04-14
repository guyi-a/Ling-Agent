import apiClient from './client'

export interface SearchResult {
  message_id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  session_title: string
}

export const messagesApi = {
  // 全局搜索消息
  searchGlobal: async (keyword: string, limit = 30): Promise<SearchResult[]> => {
    const { data } = await apiClient.get('/api/messages/search', { params: { keyword, limit } })
    return data
  },

  // 删除单条消息
  delete: async (messageId: string) => {
    await apiClient.delete(`/api/messages/${messageId}`)
  },

  // 删除消息及之后的所有消息
  deleteAfter: async (sessionId: string, messageId: string, includeSelf: boolean = true) => {
    const { data } = await apiClient.delete(
      `/api/messages/session/${sessionId}/after/${messageId}`,
      {
        params: { include_self: includeSelf }
      }
    )
    return data
  }
}
