import { useState, useRef, useEffect } from 'react'
import { LogOut, ChevronUp, UserCircle, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useProfileStore } from '@/stores/profileStore'
import Avatar from '@/components/Avatar'

export function getInitials(username: string) {
  return username ? username.slice(0, 2).toUpperCase() : '??'
}

export default function UserProfileMenu() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const username = useAuthStore((state) => state.username) || ''
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const { clearProfile } = useProfileStore()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  const handleLogout = () => {
    clearProfile()
    clearAuth()
    window.location.href = '/login'
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* 弹出菜单 */}
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-2 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
          {/* 用户信息头部 */}
          <div className="px-4 py-3 flex items-center gap-3 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-750 border-b border-gray-200 dark:border-gray-700">
            <Avatar size={40} rounded="rounded-xl" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{username}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Ling-Agent</div>
            </div>
          </div>

          {/* 导航项 */}
          <div className="py-1.5">
            <button
              onClick={() => go('/profile')}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
            >
              <UserCircle className="w-4 h-4 text-gray-400" />
              <span>个人资料</span>
            </button>

            <button
              onClick={() => go('/settings')}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
            >
              <Settings className="w-4 h-4 text-gray-400" />
              <span>设置</span>
            </button>

            <div className="mx-4 border-t border-gray-200 dark:border-gray-700 my-1" />

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      )}

      {/* 底部触发按钮 */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors border-t border-gray-200 dark:border-gray-700"
      >
        <Avatar size={32} rounded="rounded-xl" />
        <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300 truncate text-left">
          {username}
        </span>
        <ChevronUp className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? '' : 'rotate-180'}`} />
      </button>
    </div>
  )
}
