import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  username: string | null
  isAuthenticated: boolean
  setAuth: (token: string, username: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      username: null,
      isAuthenticated: false,
      setAuth: (token, username) => {
        localStorage.setItem('access_token', token)
        localStorage.setItem('username', username)
        set({ token, username, isAuthenticated: true })
      },
      clearAuth: () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('username')
        set({ token: null, username: null, isAuthenticated: false })
      },
    }),
    {
      name: 'auth-storage',
      // 重要：从存储恢复时，如果有token就设置isAuthenticated=true
      onRehydrateStorage: () => (state) => {
        if (state && state.token) {
          state.isAuthenticated = true
          console.log('✅ 从存储恢复登录状态:', state.username)
        } else {
          console.log('⚠️  未找到登录信息')
        }
      },
    }
  )
)
