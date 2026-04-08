import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useProfileStore, AVATAR_PALETTES, getDefaultPaletteId } from '@/stores/profileStore'
import { getInitials } from '@/components/UserProfileMenu'

interface AvatarProps {
  size?: number        // px，默认 32
  rounded?: string     // tailwind rounded class，默认 rounded-xl
  className?: string
}

export default function Avatar({ size = 32, rounded = 'rounded-xl', className = '' }: AvatarProps) {
  const username = useAuthStore((state) => state.username) || ''
  const userId = useAuthStore((state) => state.userId)
  const { paletteId, avatarTs } = useProfileStore()

  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (avatarTs > 0) setImgError(false)
  }, [avatarTs])

  const activePaletteId = paletteId || getDefaultPaletteId(username)
  const gradient = AVATAR_PALETTES.find((p) => p.id === activePaletteId)?.gradient ?? AVATAR_PALETTES[0].gradient
  const initials = getInitials(username)

  const avatarUrl = userId ? `/api/users/${userId}/avatar?t=${avatarTs}` : null
  const showImage = !!avatarUrl && !imgError

  const style = { width: size, height: size, flexShrink: 0 }

  if (showImage) {
    return (
      <img
        src={avatarUrl!}
        alt={username}
        style={style}
        className={`object-cover ${rounded} ${className}`}
        onError={() => setImgError(true)}
      />
    )
  }

  const fontSize = size > 48 ? 'text-3xl' : size > 28 ? 'text-sm' : 'text-xs'

  return (
    <div
      style={style}
      className={`bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold shadow-md ${rounded} ${fontSize} ${className}`}
    >
      {initials}
    </div>
  )
}
