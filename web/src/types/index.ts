// 用户相关
export interface User {
  user_id: string
  username: string
  created_at: string
}

// 会话相关
export interface Session {
  session_id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

// 消息相关
export interface Message {
  message_id: string
  session_id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  extra_data?: Record<string, any>
  created_at: string
}

// 认证相关
export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  username: string
}

// 聊天相关
export interface ChatRequest {
  message: string
  session_id?: string
  attachments?: Array<{
    type: 'image' | 'file'
    path: string
    mime_type?: string
    size?: number
  }>
}

export interface ChatResponse {
  session_id: string
  user_message_id: string
  assistant_response: string
  is_new_session: boolean
}

// 工作区文件
export interface WorkspaceFile {
  name: string
  path: string
  folder: string
  size: number
  modified_at: number
}
