import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Heart, Brain, Pencil, Trash2, ChevronLeft, ChevronRight, ArrowDownWideNarrow, ArrowUpNarrowWide, Sun, Moon, BookOpen } from 'lucide-react'
import { healthApi, type HealthRecord, type HealthRecordCreate } from '@/api/health'
import ConfirmDialog from '@/components/ConfirmDialog'
import Logo from '@/components/Logo'
import { useThemeStore } from '@/stores/themeStore'

const BODY_PARTS = ['头', '胸', '胃', '背', '全身', '其他']
const EMOTIONS = [
  { label: '焦虑', emoji: '😰' },
  { label: '低落', emoji: '😞' },
  { label: '烦躁', emoji: '😤' },
  { label: '平静', emoji: '😌' },
  { label: '开心', emoji: '😊' },
  { label: '疲惫', emoji: '😩' },
]

function parseUTC(dateStr: string): Date {
  const s = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z'
  return new Date(s)
}

function formatTime(dateStr: string) {
  const d = parseUTC(dateStr)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function getTodayStr() {
  const d = new Date()
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
}

export default function DiaryPage() {
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useThemeStore()
  const [tab, setTab] = useState<'body' | 'emotion'>('body')
  const [records, setRecords] = useState<HealthRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const PAGE_SIZE = 5

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null)

  const [bodyPart, setBodyPart] = useState('')
  const [symptoms, setSymptoms] = useState('')
  const [emotion, setEmotion] = useState('')
  const [trigger, setTrigger] = useState('')
  const [notes, setNotes] = useState('')

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true)
      const data = await healthApi.getRecords({ limit: 100 })
      setRecords(data)
    } catch (e) {
      console.error('加载记录失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRecords() }, [loadRecords])

  const resetForm = () => { setBodyPart(''); setSymptoms(''); setEmotion(''); setTrigger(''); setNotes('') }

  const handleSubmit = async () => {
    const data: HealthRecordCreate = { record_type: tab, notes: notes || undefined }
    if (tab === 'body') {
      if (!bodyPart) return
      data.body_part = bodyPart; data.discomfort_level = 5; data.symptoms = symptoms || undefined
    } else {
      if (!emotion) return
      data.emotion = emotion; data.emotion_level = 5; data.trigger = trigger || undefined
    }
    try {
      setSubmitting(true); await healthApi.createRecord(data); resetForm(); setPage(0); loadRecords()
    } catch (e) { console.error('提交失败:', e) }
    finally { setSubmitting(false) }
  }

  const handleDelete = (recordId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingRecordId(recordId)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!deletingRecordId) return
    try {
      await healthApi.deleteRecord(deletingRecordId)
      setRecords(records.filter(r => r.record_id !== deletingRecordId))
      if (selectedId === deletingRecordId) setSelectedId(null)
    } catch (e) { console.error('删除失败:', e) }
    finally { setDeleteDialogOpen(false); setDeletingRecordId(null) }
  }

  const sortedRecords = [...records].sort((a, b) => {
    const diff = parseUTC(b.created_at).getTime() - parseUTC(a.created_at).getTime()
    return sortOrder === 'newest' ? diff : -diff
  })
  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / PAGE_SIZE))
  const pagedRecords = sortedRecords.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const pagedGrouped = pagedRecords.reduce<Record<string, HealthRecord[]>>((acc, r) => {
    const date = parseUTC(r.created_at).toLocaleDateString('zh-CN')
    if (!acc[date]) acc[date] = []
    acc[date].push(r)
    return acc
  }, {})

  const stats = useMemo(() => {
    const bodyCount = records.filter(r => r.record_type === 'body').length
    const emotionCount = records.filter(r => r.record_type === 'emotion').length
    const emotionCounts: Record<string, number> = {}
    records.filter(r => r.record_type === 'emotion' && r.emotion).forEach(r => {
      emotionCounts[r.emotion!] = (emotionCounts[r.emotion!] || 0) + 1
    })
    const topEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]
    const uniqueDays = new Set(records.map(r => parseUTC(r.created_at).toLocaleDateString('zh-CN'))).size
    return { bodyCount, emotionCount, topEmotion, uniqueDays }
  }, [records])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#09090f] flex flex-col">
      {/* 顶栏 */}
      <div className="sticky top-0 z-10 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-[#0f0f15]/80 backdrop-blur-md">
        <div className="px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate('/chat')} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 flex-1" style={{ fontFamily: "'Outfit',system-ui,sans-serif" }}>
            <Logo size={24} />
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">心理日记</h1>
          </div>
          <button onClick={toggleTheme} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors">
            {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>
        </div>
      </div>

      {/* 统计条 */}
      {!loading && records.length > 0 && (
        <div className="px-6 pt-5 pb-0 flex justify-center">
          <div className="flex items-center gap-6 px-6 py-3 rounded-2xl bg-white dark:bg-white/[0.02] border border-gray-100 dark:border-gray-800/60" style={{ maxWidth: 1440, width: '100%' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-rose-400" />
              </div>
              <div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-50 tabular-nums leading-none" style={{ fontFamily: "'Outfit',system-ui,sans-serif" }}>{records.length}</div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500">篇日记</div>
              </div>
            </div>
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-800" />
            <div className="text-center">
              <div className="text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums" style={{ fontFamily: "'Outfit',system-ui,sans-serif" }}>{stats.uniqueDays}</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500">记录天数</div>
            </div>
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-800" />
            <div className="text-center">
              <div className="text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums" style={{ fontFamily: "'Outfit',system-ui,sans-serif" }}>
                <span className="text-rose-400">{stats.bodyCount}</span>
                <span className="text-gray-300 dark:text-gray-600 mx-1">/</span>
                <span className="text-indigo-400">{stats.emotionCount}</span>
              </div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500">身体 / 情绪</div>
            </div>
            {stats.topEmotion && (
              <>
                <div className="w-px h-8 bg-gray-200 dark:bg-gray-800" />
                <div className="text-center">
                  <div className="text-base">
                    {EMOTIONS.find(e => e.label === stats.topEmotion![0])?.emoji || '😶'}
                  </div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500">最常记录</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 书本 */}
      <div className="flex-1 flex items-stretch justify-center px-6 pb-6 pt-5">
        <div className="notebook-shadow rounded-2xl overflow-hidden flex w-full" style={{ maxWidth: 1440 }}>

          {/* ══ 左页：目录 ══ */}
          <div className="notebook-page notebook-left w-1/2 relative flex flex-col" style={{ paddingRight: 14 }}>
            {/* 装订孔 */}
            <div className="absolute right-[4px] top-0 bottom-0 flex flex-col justify-evenly pointer-events-none z-10">
              {[0,1,2,3,4,5].map(i => (
                <div key={i} className="w-2.5 h-2.5 rounded-full bg-gray-50 dark:bg-[#09090f] border-2 border-[#d4c4b0] dark:border-gray-700" />
              ))}
            </div>

            <div className="px-8">
              <p className="text-xs text-gray-400 dark:text-gray-500 tracking-wider uppercase">Journal Index</p>
              <div className="flex items-center justify-between h-8">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">历史记录</h2>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setSortOrder('newest'); setPage(0) }}
                    className={`flex items-center gap-1 px-2 h-6 rounded-full text-xs transition-all ${
                      sortOrder === 'newest' ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                    }`}
                  ><ArrowDownWideNarrow className="w-3 h-3" /> 最新</button>
                  <button
                    onClick={() => { setSortOrder('oldest'); setPage(0) }}
                    className={`flex items-center gap-1 px-2 h-6 rounded-full text-xs transition-all ${
                      sortOrder === 'oldest' ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                    }`}
                  ><ArrowUpNarrowWide className="w-3 h-3" /> 最早</button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-8 pb-4 flex flex-col">
              {loading ? (
                <p className="text-sm text-gray-400">加载中...</p>
              ) : records.length === 0 ? (
                <div className="text-center" style={{ paddingTop: 96 }}>
                  <div className="mx-auto mb-4 opacity-15"><Logo size={40} /></div>
                  <p className="text-sm text-gray-400 dark:text-gray-500">还没有日记</p>
                  <p className="text-xs text-gray-300 dark:text-gray-600">在右边写下今天的心情吧</p>
                </div>
              ) : (
                <div className="flex-1">
                  {Object.entries(pagedGrouped).map(([date, items]) => (
                    <div key={date}>
                      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500">{date}</p>
                      {items.map((r, idx) => {
                        const isBody = r.record_type === 'body'
                        const emotionObj = EMOTIONS.find(e => e.label === r.emotion)
                        const isActive = selectedId === r.record_id
                        const summary = isBody
                          ? (r.symptoms || r.notes || '无详细描述')
                          : (r.trigger || r.notes || '无详细描述')
                        return (
                          <div key={r.record_id}>
                            {idx > 0 && <div className="h-8" />}
                            <div
                              onClick={() => setSelectedId(isActive ? null : r.record_id)}
                              className={`group flex flex-col justify-center px-3 rounded-lg cursor-pointer transition-all h-16 ${
                                isActive ? 'bg-gray-100/70 dark:bg-white/[0.04]' : 'hover:bg-gray-100/50 dark:hover:bg-white/[0.02]'
                              }`}
                            >
                              <div className="flex items-center gap-2 h-8">
                                <span className="flex-shrink-0">
                                  {isBody ? <Heart className="w-3.5 h-3.5 text-rose-400" /> : <span className="text-sm">{emotionObj?.emoji || '😶'}</span>}
                                </span>
                                <span className="flex-1 text-sm text-gray-900 dark:text-gray-100 truncate">
                                  {isBody ? `${r.body_part}不适` : r.emotion}
                                </span>
                                <span className="text-xs text-gray-300 dark:text-gray-600 flex-shrink-0">{formatTime(r.created_at)}</span>
                                <button
                                  onClick={(e) => handleDelete(r.record_id, e)}
                                  className="flex-shrink-0 p-0.5 text-gray-300 dark:text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              <p className="text-xs text-gray-400 dark:text-gray-500 truncate pl-5 h-8 leading-8">
                                {summary}
                              </p>
                            </div>
                            {isActive && (
                              <div className="px-3 py-3 bg-gray-100/60 dark:bg-white/[0.03] rounded-lg text-sm diary-card-enter">
                                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                                  {parseUTC(r.created_at).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} {formatTime(r.created_at)}
                                </p>
                                {isBody ? (
                                  <>
                                    <p className="text-gray-700 dark:text-gray-200"><span className="text-gray-400">部位：</span>{r.body_part}</p>
                                    {r.symptoms && <p className="text-gray-700 dark:text-gray-200"><span className="text-gray-400">症状：</span>{r.symptoms}</p>}
                                  </>
                                ) : (
                                  <>
                                    <p className="text-gray-700 dark:text-gray-200"><span className="text-gray-400">情绪：</span>{emotionObj?.emoji} {r.emotion}</p>
                                    {r.trigger && <p className="text-gray-700 dark:text-gray-200"><span className="text-gray-400">触发：</span>{r.trigger}</p>}
                                  </>
                                )}
                                {r.notes && <p className="text-gray-700 dark:text-gray-200"><span className="text-gray-400">备注：</span>{r.notes}</p>}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}

              {/* 翻页控制 */}
              <div className="flex-shrink-0 flex items-center justify-center gap-4 h-8">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-400 dark:text-gray-500">{page + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* ══ 书脊 ══ */}
          <div className="book-spine w-4 flex-shrink-0 relative">
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-[#d4c4b0] dark:bg-gray-700" />
          </div>

          {/* ══ 右页：写日记 ══ */}
          <div className="notebook-page notebook-right w-1/2 flex flex-col" style={{ paddingLeft: 20 }}>
            <div className="px-8">
              <p className="text-xs text-gray-400 dark:text-gray-500">{getTodayStr()}</p>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">今天想记录些什么？</h2>
            </div>

            <div className="flex-1 overflow-y-auto px-8 pb-6">
              {/* Tab */}
              <div className="flex gap-2 h-8">
                <button
                  onClick={() => setTab('body')}
                  className={`flex items-center gap-1.5 px-3 rounded-full text-sm font-medium transition-all ${
                    tab === 'body' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                  }`}
                ><Heart className="w-3.5 h-3.5" /> 身体不适</button>
                <button
                  onClick={() => setTab('emotion')}
                  className={`flex items-center gap-1.5 px-3 rounded-full text-sm font-medium transition-all ${
                    tab === 'emotion' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                  }`}
                ><Brain className="w-3.5 h-3.5" /> 情绪记录</button>
              </div>

              {tab === 'body' ? (
                <>
                  <div className="h-8" />
                  <div className="h-8" />
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">哪里不舒服？</p>
                  <div className="flex flex-wrap gap-1.5 h-8 items-center">
                    {BODY_PARTS.map(p => (
                      <button key={p} onClick={() => setBodyPart(bodyPart === p ? '' : p)}
                        className={`px-3 h-[26px] rounded-full text-sm transition-all ${
                          bodyPart === p ? 'bg-rose-500 text-white shadow-sm' : 'bg-gray-100 dark:bg-white/[0.04] text-gray-500 dark:text-gray-400 hover:bg-rose-50 dark:hover:bg-rose-900/30'
                        }`}
                      >{p}</button>
                    ))}
                  </div>
                  <div className="h-8" />
                  <div className="h-8" />
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">具体感受</p>
                  <textarea value={symptoms} onChange={e => setSymptoms(e.target.value)}
                    placeholder="描述一下具体是什么样的感觉..."
                    className="w-full px-0 text-sm text-gray-900 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600" style={{ height: 96 }} />
                </>
              ) : (
                <>
                  <div className="h-8" />
                  <div className="h-8" />
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">此刻的心情</p>
                  <div className="flex flex-wrap gap-1.5 h-8 items-center">
                    {EMOTIONS.map(e => (
                      <button key={e.label} onClick={() => setEmotion(emotion === e.label ? '' : e.label)}
                        className={`px-3 h-[26px] rounded-full text-sm transition-all ${
                          emotion === e.label ? 'bg-indigo-500 text-white shadow-sm' : 'bg-gray-100 dark:bg-white/[0.04] text-gray-500 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
                        }`}
                      >{e.emoji} {e.label}</button>
                    ))}
                  </div>
                  <div className="h-8" />
                  <div className="h-8" />
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">是什么引起的？</p>
                  <textarea value={trigger} onChange={e => setTrigger(e.target.value)}
                    placeholder="发生了什么事让你有这样的感觉..."
                    className="w-full px-0 text-sm text-gray-900 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600" style={{ height: 96 }} />
                </>
              )}

              <div className="h-8" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">备注</p>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="还有什么想写下来的..."
                className="w-full px-0 text-sm text-gray-900 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600" style={{ height: 96 }} />

              <div className="h-8" />
              <button
                onClick={handleSubmit}
                disabled={submitting || (tab === 'body' ? !bodyPart : !emotion)}
                className="mx-auto w-2/3 h-16 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 dark:disabled:text-gray-500 text-white dark:text-gray-900 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                {submitting ? '记录中...' : '写入日记'}
              </button>
            </div>
          </div>

        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        title="删除记录"
        message="确定删除这条记录吗？此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => { setDeleteDialogOpen(false); setDeletingRecordId(null) }}
      />
    </div>
  )
}
