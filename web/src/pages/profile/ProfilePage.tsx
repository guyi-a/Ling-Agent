import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Lock, CheckCircle, XCircle,
  MessageSquare, CalendarDays, Pencil, ChevronDown, Camera,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useProfileStore, AVATAR_PALETTES, getDefaultPaletteId } from '@/stores/profileStore'
import Avatar from '@/components/Avatar'
import { sessionsApi } from '@/api/sessions'
import apiClient from '@/api/client'

// ---------- 子组件 ----------

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b last:border-0 border-gray-100 dark:border-gray-700/60">
      <span className="text-sm text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  )
}

// ---------- 主页面 ----------

export default function ProfilePage() {
  const navigate = useNavigate()
  const username = useAuthStore((state) => state.username) || ''
  const { paletteId, setPaletteId, refreshAvatar } = useProfileStore()

  const activePaletteId = paletteId || getDefaultPaletteId(username)
  const gradient = AVATAR_PALETTES.find((p) => p.id === activePaletteId)?.gradient ?? AVATAR_PALETTES[0].gradient

  // 头像上传
  const userId = useAuthStore((state) => state.userId)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)

  const handleAvatarClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setUploading(true)
    setUploadMsg(null)
    const form = new FormData()
    form.append('file', file)
    try {
      await apiClient.post(`/api/users/${userId}/avatar`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      refreshAvatar()
      setUploadMsg('头像已更新')
      setTimeout(() => setUploadMsg(null), 2000)
    } catch {
      setUploadMsg('上传失败，请重试')
      setTimeout(() => setUploadMsg(null), 2000)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  // 配色选择器
  const [showPalette, setShowPalette] = useState(false)

  // 修改密码
  const [showPwForm, setShowPwForm] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 统计
  const [sessionCount, setSessionCount] = useState<number | null>(null)
  const [joinedAt, setJoinedAt] = useState<string | null>(null)

  useEffect(() => {
    sessionsApi.getAll({ limit: 1000 }).then((data) => {
      setSessionCount(data.length)
    }).catch(() => {})
    apiClient.get('/api/auth/me').then((res) => {
      const raw = res.data.created_at as string
      const date = new Date(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z')
      setJoinedAt(date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }))
    }).catch(() => {})
  }, [])

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: '两次输入的新密码不一致' })
      return
    }
    setPwLoading(true)
    setPwMsg(null)
    try {
      await apiClient.post('/api/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
      })
      setPwMsg({ type: 'success', text: '密码修改成功' })
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setPwMsg({ type: 'error', text: err.response?.data?.detail || '修改失败，请重试' })
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Hero 横幅 */}
      <div className={`relative h-40 bg-gradient-to-br ${gradient} transition-all duration-500`}>
        <button
          onClick={() => navigate('/chat')}
          className="absolute top-4 left-4 p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white/10 -translate-y-1/3 translate-x-1/4" />
        <div className="absolute bottom-0 left-1/3 w-28 h-28 rounded-full bg-white/10 translate-y-1/2" />

        {/* 头像 */}
        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
          <div className="relative">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />
            <div
              onClick={handleAvatarClick}
              className="cursor-pointer group"
              title="点击上传头像"
            >
              <Avatar size={96} rounded="rounded-3xl" className="ring-4 ring-white dark:ring-gray-900 shadow-2xl" />
              {/* 上传遮罩 */}
              <div className="absolute inset-0 rounded-3xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploading
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera className="w-6 h-6 text-white" />}
              </div>
            </div>
          </div>
          {/* 上传提示 */}
          {uploadMsg && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap text-xs px-3 py-1 bg-gray-900 text-white rounded-full shadow">
              {uploadMsg}
            </div>
          )}
        </div>
      </div>

      {/* 名字 */}
      <div className="pt-16 pb-4 text-center px-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{username}</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Ling-Agent 用户</p>
      </div>

      {/* 正文 */}
      <div className="max-w-lg mx-auto px-4 pb-10 space-y-4">

        {/* 我的数据 */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: <MessageSquare className="w-5 h-5" />, value: sessionCount ?? '—', label: '对话数' },
            { icon: <CalendarDays className="w-5 h-5" />, value: joinedAt ?? '—', label: '加入时间' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-2xl p-4 text-center shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="text-gray-400 dark:text-gray-500 flex justify-center mb-1">{stat.icon}</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">{stat.value}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* 个人资料 */}
        <SectionCard title="个人资料">
          <InfoRow label="用户名">
            <span className="text-sm text-gray-700 dark:text-gray-300">@{username}</span>
          </InfoRow>
          <InfoRow label="头像配色">
            <button
              onClick={() => setShowPalette(!showPalette)}
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-indigo-500 transition-colors"
            >
              <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${gradient}`} />
              <span>{AVATAR_PALETTES.find((p) => p.id === activePaletteId)?.label}</span>
              <Pencil className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </InfoRow>
          {showPalette && (
            <div className="px-5 pb-4 grid grid-cols-4 gap-2">
              {AVATAR_PALETTES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setPaletteId(p.id); setShowPalette(false) }}
                  className={`h-10 rounded-xl bg-gradient-to-br ${p.gradient} shadow-sm hover:scale-105 transition-transform relative`}
                  title={p.label}
                >
                  {activePaletteId === p.id && (
                    <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        {/* 账号安全 */}
        <SectionCard title="账号安全">
          <button
            onClick={() => setShowPwForm(!showPwForm)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-gray-400" />
              <span>修改密码</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showPwForm ? 'rotate-180' : ''}`} />
          </button>

          {showPwForm && (
            <form onSubmit={handleChangePassword} className="px-5 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
              {(['当前密码', '新密码（至少 6 位）', '确认新密码'] as const).map((label, i) => {
                const vals = [oldPassword, newPassword, confirmPassword]
                const setters = [setOldPassword, setNewPassword, setConfirmPassword]
                return (
                  <div key={label}>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
                    <input
                      type="password"
                      value={vals[i]}
                      onChange={(e) => setters[i](e.target.value)}
                      required
                      minLength={i === 1 ? 6 : undefined}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    />
                  </div>
                )
              })}
              {pwMsg && (
                <div className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2.5 ${
                  pwMsg.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                }`}>
                  {pwMsg.type === 'success' ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                  {pwMsg.text}
                </div>
              )}
              <button
                type="submit"
                disabled={pwLoading || !oldPassword || !newPassword || !confirmPassword}
                className="w-full py-2 text-sm bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {pwLoading ? '提交中...' : '确认修改'}
              </button>
            </form>
          )}
        </SectionCard>

        <p className="text-center text-xs text-gray-400 dark:text-gray-600 pb-2">Ling-Agent v1.0.0</p>
      </div>
    </div>
  )
}
