import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Lock, CheckCircle, XCircle,
  MessageSquare, CalendarDays, Pencil, ChevronDown, Camera, Sun, Moon,
  Sparkles,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useProfileStore, AVATAR_PALETTES, getDefaultPaletteId } from '@/stores/profileStore'
import Avatar from '@/components/Avatar'
import Logo from '@/components/Logo'
import { useThemeStore } from '@/stores/themeStore'
import { sessionsApi } from '@/api/sessions'
import apiClient from '@/api/client'

const GRADIENT_MESH: Record<string, { light: string; dark: string }> = {
  violet: {
    light: 'radial-gradient(ellipse at 20% 50%, rgba(139,92,246,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(168,85,247,0.08) 0%, transparent 50%)',
    dark:  'radial-gradient(ellipse at 20% 50%, rgba(139,92,246,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(168,85,247,0.05) 0%, transparent 50%)',
  },
  blue: {
    light: 'radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(6,182,212,0.08) 0%, transparent 50%)',
    dark:  'radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(6,182,212,0.05) 0%, transparent 50%)',
  },
  green: {
    light: 'radial-gradient(ellipse at 20% 50%, rgba(16,185,129,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(20,184,166,0.08) 0%, transparent 50%)',
    dark:  'radial-gradient(ellipse at 20% 50%, rgba(16,185,129,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(20,184,166,0.05) 0%, transparent 50%)',
  },
  orange: {
    light: 'radial-gradient(ellipse at 20% 50%, rgba(249,115,22,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(245,158,11,0.08) 0%, transparent 50%)',
    dark:  'radial-gradient(ellipse at 20% 50%, rgba(249,115,22,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(245,158,11,0.05) 0%, transparent 50%)',
  },
  rose: {
    light: 'radial-gradient(ellipse at 20% 50%, rgba(244,63,94,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(236,72,153,0.08) 0%, transparent 50%)',
    dark:  'radial-gradient(ellipse at 20% 50%, rgba(244,63,94,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(236,72,153,0.05) 0%, transparent 50%)',
  },
  sky: {
    light: 'radial-gradient(ellipse at 20% 50%, rgba(14,165,233,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(99,102,241,0.08) 0%, transparent 50%)',
    dark:  'radial-gradient(ellipse at 20% 50%, rgba(14,165,233,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(99,102,241,0.05) 0%, transparent 50%)',
  },
  lime: {
    light: 'radial-gradient(ellipse at 20% 50%, rgba(132,204,22,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(16,185,129,0.08) 0%, transparent 50%)',
    dark:  'radial-gradient(ellipse at 20% 50%, rgba(132,204,22,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(16,185,129,0.05) 0%, transparent 50%)',
  },
  red: {
    light: 'radial-gradient(ellipse at 20% 50%, rgba(239,68,68,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(249,115,22,0.08) 0%, transparent 50%)',
    dark:  'radial-gradient(ellipse at 20% 50%, rgba(239,68,68,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(249,115,22,0.05) 0%, transparent 50%)',
  },
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useThemeStore()
  const username = useAuthStore((state) => state.username) || ''
  const { paletteId, setPaletteId, refreshAvatar } = useProfileStore()

  const activePaletteId = paletteId || getDefaultPaletteId(username)
  const gradient = AVATAR_PALETTES.find((p) => p.id === activePaletteId)?.gradient ?? AVATAR_PALETTES[0].gradient
  const mesh = GRADIENT_MESH[activePaletteId] ?? GRADIENT_MESH.violet

  const userId = useAuthStore((state) => state.userId)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

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

  const [showPalette, setShowPalette] = useState(false)

  const [showPwForm, setShowPwForm] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [sessionCount, setSessionCount] = useState<number | null>(null)
  const [joinedAt, setJoinedAt] = useState<string | null>(null)
  const [daysSince, setDaysSince] = useState<number | null>(null)

  useEffect(() => {
    sessionsApi.getAll({ limit: 1000 }).then((data) => {
      setSessionCount(data.length)
    }).catch(() => {})
    apiClient.get('/api/auth/me').then((res) => {
      const raw = res.data.created_at as string
      const date = new Date(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z')
      setJoinedAt(date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }))
      setDaysSince(Math.floor((Date.now() - date.getTime()) / 86400000))
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
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090f]">
      <style>{`
        .fd{font-family:'Outfit',system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif}
        @keyframes float-in{from{opacity:0;transform:translateY(20px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes ring-pulse{0%,100%{box-shadow:0 0 0 0 rgba(139,92,246,0.15)}50%{box-shadow:0 0 0 12px rgba(139,92,246,0)}}
        @keyframes counter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .anim-hero{animation:float-in .7s cubic-bezier(.22,1,.36,1) both}
        .anim-d1{animation:float-in .6s cubic-bezier(.22,1,.36,1) .1s both}
        .anim-d2{animation:float-in .6s cubic-bezier(.22,1,.36,1) .2s both}
        .anim-d3{animation:float-in .6s cubic-bezier(.22,1,.36,1) .3s both}
        .anim-d4{animation:float-in .6s cubic-bezier(.22,1,.36,1) .4s both}
        .anim-ring{animation:ring-pulse 3s ease-in-out infinite}
        .anim-count{animation:counter .5s cubic-bezier(.22,1,.36,1) .5s both}
        .palette-btn{transition:all .2s cubic-bezier(.22,1,.36,1)}
        .palette-btn:hover{transform:scale(1.12) translateY(-2px)}
        .palette-btn:active{transform:scale(0.95)}
      `}</style>

      {/* 顶栏 — 半透明浮动 */}
      <div className="fixed top-0 left-0 right-0 z-20 border-b border-gray-200/50 dark:border-gray-800/50 bg-white/60 dark:bg-[#0f0f15]/60 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/chat')} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <button onClick={toggleTheme} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors">
            {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>
        </div>
      </div>

      {/* ═══ 英雄区 ═══ */}
      <div
        className="relative pt-14 overflow-hidden transition-all duration-700"
        style={{ backgroundImage: isDark ? mesh.dark : mesh.light }}
      >
        {/* 网格装饰 */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04]" style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />

        <div className={`relative flex flex-col items-center py-16 px-6 ${mounted ? 'anim-hero' : 'opacity-0'}`}>
          {/* 头像 */}
          <div className="relative mb-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* 光环 */}
            <div className={`absolute -inset-3 rounded-[28px] bg-gradient-to-br ${gradient} opacity-20 blur-xl`} />
            <div className={`absolute -inset-1.5 rounded-[24px] bg-gradient-to-br ${gradient} opacity-10 anim-ring`} />

            <div onClick={handleAvatarClick} className="relative cursor-pointer group">
              <Avatar size={104} rounded="rounded-[20px]" className="ring-[3px] ring-white/80 dark:ring-white/10 shadow-2xl relative z-10" />
              <div className="absolute inset-0 rounded-[20px] bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all duration-300 z-20">
                <div className="opacity-0 group-hover:opacity-100 transform group-hover:scale-100 scale-75 transition-all duration-300">
                  {uploading
                    ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Camera className="w-6 h-6 text-white drop-shadow-lg" />}
                </div>
              </div>
            </div>

            {uploadMsg && (
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-full shadow-lg anim-count">
                {uploadMsg}
              </div>
            )}
          </div>

          {/* 名字 + 标语 */}
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50 fd tracking-tight">
            {username}
          </h1>
          <div className="flex items-center gap-1.5 mt-2">
            <Logo size={16} />
            <span className="text-sm text-gray-400 dark:text-gray-500 fd">Ling-Agent</span>
          </div>

          {/* 数据条 */}
          <div className={`flex items-center gap-8 mt-8 ${mounted ? 'anim-d1' : 'opacity-0'}`}>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-50 fd tabular-nums anim-count">
                {sessionCount ?? '—'}
              </div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 tracking-wider uppercase fd">对话</div>
            </div>
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-800" />
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-50 fd tabular-nums anim-count">
                {daysSince ?? '—'}
              </div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 tracking-wider uppercase fd">天</div>
            </div>
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-800" />
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-50 fd tabular-nums anim-count">
                {joinedAt?.split('/')[1]}/{joinedAt?.split('/')[2] ?? '—'}
              </div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 tracking-wider uppercase fd">加入</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 内容区 ═══ */}
      <div className="max-w-xl mx-auto px-6 -mt-2 pb-12 space-y-4">

        {/* 配色选择 — 核心交互，抬升可见性 */}
        <div className={`bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-100 dark:border-gray-800/60 p-5 ${mounted ? 'anim-d2' : 'opacity-0'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-gray-300 dark:text-gray-600" />
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider fd">主题配色</span>
            </div>
            <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${gradient} shadow-sm`} />
          </div>
          <div className="grid grid-cols-8 gap-2">
            {AVATAR_PALETTES.map((p) => (
              <button
                key={p.id}
                onClick={() => setPaletteId(p.id)}
                className={`palette-btn aspect-square rounded-xl bg-gradient-to-br ${p.gradient} relative ${
                  activePaletteId === p.id
                    ? 'ring-2 ring-gray-900 dark:ring-white ring-offset-2 ring-offset-white dark:ring-offset-[#09090f] shadow-lg'
                    : 'hover:shadow-md'
                }`}
                title={p.label}
              >
                {activePaletteId === p.id && (
                  <span className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-bold drop-shadow">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 个人资料 */}
        <div className={`bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-100 dark:border-gray-800/60 overflow-hidden ${mounted ? 'anim-d3' : 'opacity-0'}`}>
          <div className="px-5 py-3.5">
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider fd">个人资料</span>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800/60">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-sm text-gray-500 dark:text-gray-400">用户名</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 fd">@{username}</span>
            </div>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800/60">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-sm text-gray-500 dark:text-gray-400">加入日期</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 fd tabular-nums">{joinedAt ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* 账号安全 */}
        <div className={`bg-white dark:bg-white/[0.02] rounded-2xl border border-gray-100 dark:border-gray-800/60 overflow-hidden ${mounted ? 'anim-d4' : 'opacity-0'}`}>
          <div className="px-5 py-3.5">
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider fd">账号安全</span>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800/60">
            <button
              onClick={() => setShowPwForm(!showPwForm)}
              className="w-full flex items-center justify-between px-5 py-4 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50/50 dark:hover:bg-white/[0.01] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <span>修改密码</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-300 dark:text-gray-600 transition-transform duration-300 ${showPwForm ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showPwForm && (
            <form onSubmit={handleChangePassword} className="px-5 pb-5 space-y-3 border-t border-gray-100 dark:border-gray-800/60 pt-4">
              {(['当前密码', '新密码（至少 6 位）', '确认新密码'] as const).map((label, i) => {
                const vals = [oldPassword, newPassword, confirmPassword]
                const setters = [setOldPassword, setNewPassword, setConfirmPassword]
                return (
                  <div key={label}>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
                    <input
                      type="password"
                      value={vals[i]}
                      onChange={(e) => setters[i](e.target.value)}
                      required
                      minLength={i === 1 ? 6 : undefined}
                      className="w-full px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-white/[0.02] text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10 focus:border-gray-300 dark:focus:border-gray-600 transition"
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
                className="w-full py-2.5 text-sm bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                {pwLoading ? '提交中...' : '确认修改'}
              </button>
            </form>
          )}
        </div>

        {/* 页脚 */}
        <div className="flex items-center justify-center gap-1.5 pt-4">
          <Logo size={14} className="opacity-30" />
          <span className="text-[11px] text-gray-300 dark:text-gray-700 fd">Ling-Agent v1.0.0</span>
        </div>
      </div>
    </div>
  )
}
