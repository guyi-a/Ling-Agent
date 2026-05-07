/**
 * 时间工具函数
 *
 * 后端返回的时间是 UTC 时间，但没有 Z 后缀，需要手动添加
 */

/**
 * 解析后端返回的时间字符串为 Date 对象
 * 后端返回格式：2026-05-07T10:00:00（UTC 时间，但没有 Z）
 */
export function parseBackendTime(dateStr: string): Date {
  // 如果已经有时区标识（Z 或 +/-），直接解析
  if (dateStr.endsWith('Z') || dateStr.includes('+') || dateStr.match(/-\d{2}:\d{2}$/)) {
    return new Date(dateStr)
  }
  // 否则添加 Z 后缀，表示这是 UTC 时间
  return new Date(dateStr + 'Z')
}

/**
 * 格式化相对时间（几分钟前、几小时前等）
 */
export function formatRelativeTime(dateStr: string): string {
  const date = parseBackendTime(dateStr)
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)

  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`

  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 周前`
  if (days < 365) return `${Math.floor(days / 30)} 个月前`

  return `${Math.floor(days / 365)} 年前`
}

/**
 * 格式化为本地日期时间
 */
export function formatDateTime(dateStr: string): string {
  const date = parseBackendTime(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 格式化为本地日期
 */
export function formatDate(dateStr: string): string {
  const date = parseBackendTime(dateStr)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * 格式化为简短时间（用于列表）
 */
export function formatTime(dateStr: string): string {
  const date = parseBackendTime(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)

  if (date >= today) {
    // 今天：显示时间
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } else if (date >= yesterday) {
    // 昨天
    return '昨天'
  } else if (date.getFullYear() === now.getFullYear()) {
    // 今年：显示月日
    return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  } else {
    // 往年：显示年月日
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' })
  }
}

/**
 * 获取时间分组（用于会话列表分组）
 */
export function getTimeGroup(dateStr: string): string {
  const date = parseBackendTime(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const lastWeek = new Date(today.getTime() - 7 * 86400000)
  const lastMonth = new Date(today.getTime() - 30 * 86400000)

  if (date >= today) return '今天'
  if (date >= yesterday) return '昨天'
  if (date >= lastWeek) return '最近 7 天'
  if (date >= lastMonth) return '最近 30 天'
  return '更早'
}
