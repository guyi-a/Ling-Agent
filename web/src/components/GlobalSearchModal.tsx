import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, MessageSquare, User, Bot, Loader2 } from 'lucide-react'
import { messagesApi, type SearchResult } from '@/api/messages'

interface GlobalSearchModalProps {
  open: boolean
  onClose: () => void
  onSelect: (sessionId: string) => void
}

function highlightMatch(text: string, keyword: string): React.ReactNode {
  if (!keyword.trim()) return text
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-700/60 text-inherit rounded-sm px-0.5">
        {text.slice(idx, idx + keyword.length)}
      </mark>
      {text.slice(idx + keyword.length)}
    </>
  )
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()

  if (diffMs < 60000) return '刚刚'
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} 分钟前`
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)} 小时前`

  const sameYear = d.getFullYear() === now.getFullYear()
  if (sameYear) {
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function GlobalSearchModal({ open, onClose, onSelect }: GlobalSearchModalProps) {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // 打开时聚焦
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      setKeyword('')
      setResults([])
      setSearched(false)
    }
  }, [open])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    setSearched(true)
    try {
      const data = await messagesApi.searchGlobal(q)
      setResults(data)
    } catch (error) {
      console.error('搜索失败:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInputChange = (value: string) => {
    setKeyword(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 300)
  }

  const handleSelect = (sessionId: string) => {
    onSelect(sessionId)
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索输入 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索所有会话中的消息..."
            value={keyword}
            onChange={(e) => handleInputChange(e.target.value)}
            className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 text-sm focus:outline-none"
          />
          {keyword && (
            <button
              onClick={() => { setKeyword(''); setResults([]); setSearched(false) }}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
            ESC
          </kbd>
        </div>

        {/* 结果列表 */}
        <div className="max-h-[50vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">搜索中...</span>
            </div>
          )}

          {!loading && searched && results.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              没有找到匹配的消息
            </div>
          )}

          {!loading && !searched && (
            <div className="text-center py-8 text-gray-400 text-sm">
              输入关键词搜索所有会话
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="py-1">
              {results.map((item) => (
                <button
                  key={item.message_id}
                  onClick={() => handleSelect(item.session_id)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-b-0"
                >
                  {/* 会话标题 */}
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 truncate">
                      {item.session_title}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
                      {formatTime(item.created_at)}
                    </span>
                  </div>
                  {/* 消息内容 */}
                  <div className="flex items-start gap-2">
                    {item.role === 'user' ? (
                      <User className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <Bot className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                    )}
                    <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 leading-relaxed">
                      {highlightMatch(item.content, keyword)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-400 text-center">
            共 {results.length} 条结果 · 点击跳转到对应会话
          </div>
        )}
      </div>
    </div>
  )
}
