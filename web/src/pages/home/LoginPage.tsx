import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sun, Moon, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import Logo from '@/components/Logo'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import apiClient from '@/api/client'
import type { LoginRequest, LoginResponse } from '@/types'

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)
  const { isDark, toggleTheme } = useThemeStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login'
      const payload = isRegister
        ? { username, password, device_id: `web-${crypto.randomUUID()}` }
        : { username, password }
      const response = await apiClient.post<LoginResponse>(endpoint, payload)
      const { access_token, username: user, user_id } = response.data

      setAuth(access_token, user, user_id)
      navigate('/chat')
    } catch (err: any) {
      setError(err.response?.data?.detail || (isRegister ? '注册失败' : '登录失败，请检查用户名和密码'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#1a1a24] relative overflow-hidden">
      <style>{`
        .fd{font-family:'Outfit',system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif}
        .login-mesh{
          background:
            radial-gradient(ellipse 70% 50% at 30% 20%,rgba(14,165,233,.10),transparent),
            radial-gradient(ellipse 50% 40% at 80% 70%,rgba(168,85,247,.07),transparent);
        }
        .dark .login-mesh{
          background:
            radial-gradient(ellipse 70% 50% at 30% 20%,rgba(14,165,233,.12),transparent),
            radial-gradient(ellipse 50% 40% at 80% 70%,rgba(168,85,247,.08),transparent);
        }
        .dot-grid{
          background-image:radial-gradient(rgba(0,0,0,.05) 1px,transparent 1px);
          background-size:24px 24px;
        }
        .dark .dot-grid{
          background-image:radial-gradient(rgba(255,255,255,.035) 1px,transparent 1px);
        }
        @keyframes fup{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fup .7s cubic-bezier(.16,1,.3,1) forwards;opacity:0}
        .d1{animation-delay:.08s}.d2{animation-delay:.16s}.d3{animation-delay:.24s}
        @keyframes fslow{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        .anim-fs{animation:fslow 6s ease-in-out infinite}
      `}</style>

      {/* background */}
      <div className="absolute inset-0 login-mesh dot-grid" />

      {/* decorative elements */}
      <div className="absolute top-16 right-[15%] w-56 h-56 rounded-full border border-primary-200/20 dark:border-primary-500/10 pointer-events-none" />
      <div className="absolute bottom-20 left-[10%] w-36 h-36 rounded-full border border-accent-200/20 dark:border-accent-500/10 pointer-events-none" />
      <div className="absolute top-[25%] left-[8%] w-1.5 h-1.5 rounded-full bg-primary-400/40 anim-fs" />
      <div className="absolute bottom-[30%] right-[12%] w-2 h-2 rounded-full bg-accent-400/30 anim-fs" style={{ animationDelay: '3s' }} />

      {/* top bar */}
      <div className="fixed top-0 inset-x-0 z-50 px-6 h-16 flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>首页</span>
        </button>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-all"
        >
          {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
        </button>
      </div>

      {/* form card */}
      <div className="relative z-10 w-full max-w-sm px-6">
        {/* logo & title */}
        <div className="text-center mb-8 fu">
          <div className="mx-auto mb-5 w-14 h-14 flex items-center justify-center">
            <Logo size={48} />
          </div>
          <h1 className="text-2xl font-bold fd tracking-tight text-gray-900 dark:text-white">
            {isRegister ? '创建账号' : '欢迎回来'}
          </h1>
          <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
            {isRegister ? '注册后即可开始使用 Ling-Agent' : '登录您的 Ling-Agent 账号'}
          </p>
        </div>

        {/* form */}
        <form onSubmit={handleSubmit} className="fu d1">
          <div className="space-y-4 p-7 rounded-2xl border border-gray-100 dark:border-gray-800/80 bg-white/80 dark:bg-white/[0.06] backdrop-blur-sm shadow-xl shadow-gray-200/30 dark:shadow-black/20">
            <div>
              <label htmlFor="username" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 tracking-wide uppercase">
                用户名
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-200 dark:border-gray-700/80 rounded-xl bg-gray-50 dark:bg-white/[0.04] text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-400 dark:focus:border-primary-500 transition-all"
                placeholder="请输入用户名"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 tracking-wide uppercase">
                密码
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 pr-10 text-sm border border-gray-200 dark:border-gray-700/80 rounded-xl bg-gray-50 dark:bg-white/[0.04] text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-400 dark:focus:border-primary-500 transition-all"
                  placeholder={isRegister ? '至少 6 位密码' : '请输入密码'}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-500 dark:text-red-400 text-center py-1">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all mt-2"
            >
              {loading ? (isRegister ? '注册中…' : '登录中…') : (isRegister ? '注册' : '登录')}
            </button>
          </div>
        </form>

        {/* toggle */}
        <div className="fu d2 mt-6 text-center">
          <button
            type="button"
            onClick={() => { setIsRegister(!isRegister); setError('') }}
            className="text-sm text-gray-400 dark:text-gray-500 hover:text-primary-500 dark:hover:text-primary-400 transition-colors"
          >
            {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
          </button>
        </div>
      </div>
    </div>
  )
}
