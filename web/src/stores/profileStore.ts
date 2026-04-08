import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// 可选渐变配色
export const AVATAR_PALETTES = [
  { id: 'violet', gradient: 'from-violet-500 to-purple-600', label: '紫色' },
  { id: 'blue',   gradient: 'from-blue-500 to-cyan-500',    label: '蓝色' },
  { id: 'green',  gradient: 'from-emerald-500 to-teal-600', label: '绿色' },
  { id: 'orange', gradient: 'from-orange-500 to-amber-500', label: '橙色' },
  { id: 'rose',   gradient: 'from-rose-500 to-pink-600',    label: '粉色' },
  { id: 'sky',    gradient: 'from-sky-500 to-indigo-500',   label: '天蓝' },
  { id: 'lime',   gradient: 'from-lime-500 to-emerald-500', label: '草绿' },
  { id: 'red',    gradient: 'from-red-500 to-orange-600',   label: '红色' },
]

export function getDefaultPaletteId(username: string) {
  const code = username ? username.charCodeAt(0) : 0
  return AVATAR_PALETTES[code % AVATAR_PALETTES.length].id
}

interface ProfileState {
  paletteId: string
  avatarTs: number
  setPaletteId: (id: string) => void
  refreshAvatar: () => void
  clearProfile: () => void
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      paletteId: '',
      avatarTs: 0,
      setPaletteId: (paletteId) => set({ paletteId }),
      refreshAvatar: () => set({ avatarTs: Date.now() }),
      clearProfile: () => set({ paletteId: '', avatarTs: 0 }),
    }),
    { name: 'profile-storage' }
  )
)
