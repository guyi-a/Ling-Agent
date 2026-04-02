import apiClient from './client'

export const messagesApi = {
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
