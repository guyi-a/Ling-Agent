import apiClient from './client'
import type { DevProcess } from '@/types'

export const devApi = {
  /** 列出 session 的所有后台进程 */
  listProcesses: async (sessionId: string): Promise<DevProcess[]> => {
    const { data } = await apiClient.get<{ session_id: string; processes: DevProcess[] }>(
      `/api/dev/${sessionId}/processes`
    )
    return data.processes
  },

  /** 获取进程日志 */
  getLogs: async (sessionId: string, name: string, lines = 50): Promise<string[]> => {
    const { data } = await apiClient.get<{ lines: string[] }>(
      `/api/dev/${sessionId}/logs/${name}`,
      { params: { lines } }
    )
    return data.lines
  },

  /** 手动停止进程 */
  stopProcess: async (sessionId: string, name: string): Promise<void> => {
    await apiClient.post(`/api/dev/${sessionId}/stop/${name}`)
  },

  /** 直接启动进程 */
  startProcess: async (sessionId: string, req: {
    name: string
    command: string
    workdir?: string
    port?: number
  }): Promise<any> => {
    const { data } = await apiClient.post(`/api/dev/${sessionId}/start`, req)
    return data
  },

  /** 重启进程（复用端口） */
  restartProcess: async (sessionId: string, name: string): Promise<any> => {
    const { data } = await apiClient.post(`/api/dev/${sessionId}/restart/${name}`)
    return data
  },
}
