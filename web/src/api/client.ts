import axios from 'axios'

const apiClient = axios.create({
  baseURL: '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器：添加 Token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器：处理 401（防抖，避免并发请求同时触发跳转）
let isRedirecting = false
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isRedirecting) {
      isRedirecting = true
      import('@/stores/authStore').then(({ useAuthStore }) => {
        useAuthStore.getState().clearAuth()
      })
      import('@/stores/profileStore').then(({ useProfileStore }) => {
        useProfileStore.getState().clearProfile()
      })
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient
