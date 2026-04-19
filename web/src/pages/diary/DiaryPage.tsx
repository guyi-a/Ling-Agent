import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Heart, Brain, Pencil, Trash2, BookOpen, ChevronLeft, ChevronRight, ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react'
import { healthApi, type HealthRecord, type HealthRecordCreate } from '@/api/health'
import ConfirmDialog from '@/components/ConfirmDialog'

const BODY_PARTS = ['头', '胸', '胃', '背', '全身', '其他']
const EMOTIONS = [
  { label: '焦虑', emoji: '😰' },
  { label: '低落', emoji: '😞' },
  { label: '烦躁', emoji: '😤' },
  { label: '平静', emoji: '😌' },
  { label: '开心', emoji: '😊' },
  { label: '疲惫', emoji: '😩' },
]

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function getTodayStr() {
  const d = new Date()
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
}

export default function DiaryPage() {
  const navigate = useNavigate()
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
    const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    return sortOrder === 'newest' ? diff : -diff
  })
  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / PAGE_SIZE))
  const pagedRecords = sortedRecords.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const pagedGrouped = pagedRecords.reduce<Record<string, HealthRecord[]>>((acc, r) => {
    const date = new Date(r.created_at).toLocaleDateString('zh-CN')
    if (!acc[date]) acc[date] = []
    acc[date].push(r)
    return acc
  }, {})


  return (
    <div className="min-h-screen bg-[#f5f0e8] dark:bg-gray-900 flex flex-col">
      {/* 顶栏 */}
      <div className="sticky top-0 z-10 bg-[#f5f0e8]/80 dark:bg-gray-900/80 backdrop-blur border-b border-[#e0d5c3] dark:border-gray-700">
        <div className="px-6 py-4 flex items-center gap-3">
          <button onClick={() => navigate('/chat')} className="p-1.5 hover:bg-[#e8dcc8] dark:hover:bg-gray-700 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-[#8b7355] dark:text-gray-400" />
          </button>
          <BookOpen className="w-5 h-5 text-[#8b7355] dark:text-gray-400" />
          <h1 className="text-lg font-semibold text-[#5a4a3a] dark:text-gray-100">心理日记</h1>
        </div>
      </div>

      {/* 书本 */}
      <div className="flex-1 flex items-stretch justify-center px-6 pb-6">
        <div className="notebook-shadow rounded-2xl overflow-hidden flex w-full" style={{ maxWidth: 1440 }}>

          {/* ══ 左页：目录 ══ */}
          <div className="notebook-page notebook-left w-1/2 relative flex flex-col" style={{ paddingRight: 14 }}>
            {/* 装订孔 */}
            <div className="absolute right-[4px] top-0 bottom-0 flex flex-col justify-evenly pointer-events-none z-10">
              {[0,1,2,3,4,5].map(i => (
                <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#f5f0e8] dark:bg-[#1a1614] border-2 border-[#d4c4a8] dark:border-[#5a4f45]" />
              ))}
            </div>

            <div className="px-8">
              <p className="text-xs text-[#b8a080] dark:text-gray-500 tracking-wider uppercase">Journal Index</p>
              <div className="flex items-center justify-between h-8">
                <h2 className="text-lg font-semibold text-[#5a4a3a] dark:text-[#e8dcc8]">历史记录</h2>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setSortOrder('newest'); setPage(0) }}
                    className={`flex items-center gap-1 px-2 h-6 rounded-full text-xs transition-all ${
                      sortOrder === 'newest' ? 'bg-[#e8dcc8] text-[#5a4a3a]' : 'text-[#b8a080] hover:bg-[#f0e6d3]/50'
                    }`}
                  ><ArrowDownWideNarrow className="w-3 h-3" /> 最新</button>
                  <button
                    onClick={() => { setSortOrder('oldest'); setPage(0) }}
                    className={`flex items-center gap-1 px-2 h-6 rounded-full text-xs transition-all ${
                      sortOrder === 'oldest' ? 'bg-[#e8dcc8] text-[#5a4a3a]' : 'text-[#b8a080] hover:bg-[#f0e6d3]/50'
                    }`}
                  ><ArrowUpNarrowWide className="w-3 h-3" /> 最早</button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-8 pb-4 flex flex-col">
              {loading ? (
                <p className="text-sm text-[#b8a080]">加载中...</p>
              ) : records.length === 0 ? (
                <div className="text-center" style={{ paddingTop: 96 }}>
                  <BookOpen className="w-10 h-10 mx-auto text-[#d4c4a8] dark:text-gray-600" />
                  <p className="text-sm text-[#b8a080] mt-4">还没有日记</p>
                  <p className="text-xs text-[#d4c4a8]">在右边写下今天的心情吧</p>
                </div>
              ) : (
                <div className="flex-1">
                  {Object.entries(pagedGrouped).map(([date, items]) => (
                    <div key={date}>
                      <p className="text-xs font-semibold text-[#b8a080] dark:text-gray-500">{date}</p>
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
                                isActive ? 'bg-[#e8dcc8]/60 dark:bg-gray-700/50' : 'hover:bg-[#f0e6d3]/50 dark:hover:bg-gray-700/30'
                              }`}
                            >
                              <div className="flex items-center gap-2 h-8">
                                <span className="flex-shrink-0">
                                  {isBody ? <Heart className="w-3.5 h-3.5 text-rose-400" /> : <span className="text-sm">{emotionObj?.emoji || '😶'}</span>}
                                </span>
                                <span className="flex-1 text-sm text-[#5a4a3a] dark:text-gray-200 truncate">
                                  {isBody ? `${r.body_part}不适` : r.emotion}
                                </span>
                                <span className="text-xs text-[#c9b896] dark:text-gray-500 flex-shrink-0">{formatTime(r.created_at)}</span>
                                <button
                                  onClick={(e) => handleDelete(r.record_id, e)}
                                  className="flex-shrink-0 p-0.5 text-[#d4c4a8] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              <p className="text-xs text-[#c9b896] dark:text-gray-500 truncate pl-5 h-8 leading-8">
                                {summary}
                              </p>
                            </div>
                            {isActive && (
                              <div className="px-3 py-3 bg-[#f0e6d3]/60 dark:bg-gray-700/40 rounded-lg text-sm diary-card-enter">
                                <p className="text-xs text-[#b8a080] mb-1">
                                  {new Date(r.created_at).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} {formatTime(r.created_at)}
                                </p>
                                {isBody ? (
                                  <>
                                    <p className="text-[#5a4a3a] dark:text-gray-200"><span className="text-[#b8a080]">部位：</span>{r.body_part}</p>
                                    {r.symptoms && <p className="text-[#5a4a3a] dark:text-gray-200"><span className="text-[#b8a080]">症状：</span>{r.symptoms}</p>}
                                  </>
                                ) : (
                                  <>
                                    <p className="text-[#5a4a3a] dark:text-gray-200"><span className="text-[#b8a080]">情绪：</span>{emotionObj?.emoji} {r.emotion}</p>
                                    {r.trigger && <p className="text-[#5a4a3a] dark:text-gray-200"><span className="text-[#b8a080]">触发：</span>{r.trigger}</p>}
                                  </>
                                )}
                                {r.notes && <p className="text-[#5a4a3a] dark:text-gray-200"><span className="text-[#b8a080]">备注：</span>{r.notes}</p>}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}

              {/* 翻页控制 — 始终显示，像笔记本页脚 */}
              <div className="flex-shrink-0 flex items-center justify-center gap-4 h-8">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="p-1 text-[#b8a080] hover:text-[#8b7355] disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-[#b8a080]">{page + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1 text-[#b8a080] hover:text-[#8b7355] disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* ══ 书脊 ══ */}
          <div className="book-spine w-4 flex-shrink-0 relative">
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-[#d4c4a8] dark:bg-gray-600" />
          </div>

          {/* ══ 右页：写日记 ══ */}
          <div className="notebook-page notebook-right w-1/2 flex flex-col" style={{ paddingLeft: 20 }}>
            <div className="px-8">
              <p className="text-xs text-[#b8a080] dark:text-gray-500">{getTodayStr()}</p>
              <h2 className="text-lg font-semibold text-[#5a4a3a] dark:text-[#e8dcc8]">今天想记录些什么？</h2>
            </div>

            <div className="flex-1 overflow-y-auto px-8 pb-6">
              {/* Tab */}
              <div className="flex gap-2 h-8">
                <button
                  onClick={() => setTab('body')}
                  className={`flex items-center gap-1.5 px-3 rounded-full text-sm font-medium transition-all ${
                    tab === 'body' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : 'text-[#8b7355] hover:bg-[#f0e6d3]'
                  }`}
                ><Heart className="w-3.5 h-3.5" /> 身体不适</button>
                <button
                  onClick={() => setTab('emotion')}
                  className={`flex items-center gap-1.5 px-3 rounded-full text-sm font-medium transition-all ${
                    tab === 'emotion' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-[#8b7355] hover:bg-[#f0e6d3]'
                  }`}
                ><Brain className="w-3.5 h-3.5" /> 情绪记录</button>
              </div>

              {tab === 'body' ? (
                <>
                  <div className="h-8" />
                  <div className="h-8" />
                  <p className="text-sm font-medium text-[#8b7355]">哪里不舒服？</p>
                  <div className="flex flex-wrap gap-1.5 h-8 items-center">
                    {BODY_PARTS.map(p => (
                      <button key={p} onClick={() => setBodyPart(bodyPart === p ? '' : p)}
                        className={`px-3 h-[26px] rounded-full text-sm transition-all ${
                          bodyPart === p ? 'bg-rose-500 text-white shadow-sm' : 'bg-[#f0e6d3] dark:bg-[#4a3f36] text-[#8b7355] dark:text-[#c9b896] hover:bg-rose-50 dark:hover:bg-rose-900/30'
                        }`}
                      >{p}</button>
                    ))}
                  </div>
                  <div className="h-8" />
                  <div className="h-8" />
                  <p className="text-sm font-medium text-[#8b7355]">具体感受</p>
                  <textarea value={symptoms} onChange={e => setSymptoms(e.target.value)}
                    placeholder="描述一下具体是什么样的感觉..."
                    className="w-full px-0 text-sm text-[#5a4a3a] dark:text-gray-200 placeholder-[#c9b896]" style={{ height: 96 }} />
                </>
              ) : (
                <>
                  <div className="h-8" />
                  <div className="h-8" />
                  <p className="text-sm font-medium text-[#8b7355]">此刻的心情</p>
                  <div className="flex flex-wrap gap-1.5 h-8 items-center">
                    {EMOTIONS.map(e => (
                      <button key={e.label} onClick={() => setEmotion(emotion === e.label ? '' : e.label)}
                        className={`px-3 h-[26px] rounded-full text-sm transition-all ${
                          emotion === e.label ? 'bg-indigo-500 text-white shadow-sm' : 'bg-[#f0e6d3] dark:bg-[#4a3f36] text-[#8b7355] dark:text-[#c9b896] hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
                        }`}
                      >{e.emoji} {e.label}</button>
                    ))}
                  </div>
                  <div className="h-8" />
                  <div className="h-8" />
                  <p className="text-sm font-medium text-[#8b7355]">是什么引起的？</p>
                  <textarea value={trigger} onChange={e => setTrigger(e.target.value)}
                    placeholder="发生了什么事让你有这样的感觉..."
                    className="w-full px-0 text-sm text-[#5a4a3a] dark:text-gray-200 placeholder-[#c9b896]" style={{ height: 96 }} />
                </>
              )}

              <div className="h-8" />
              <p className="text-sm font-medium text-[#8b7355]">备注</p>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="还有什么想写下来的..."
                className="w-full px-0 text-sm text-[#5a4a3a] dark:text-gray-200 placeholder-[#c9b896]" style={{ height: 96 }} />

              {/* 空一行再放按钮 */}
              <div className="h-8" />
              <button
                onClick={handleSubmit}
                disabled={submitting || (tab === 'body' ? !bodyPart : !emotion)}
                className="mx-auto w-2/3 h-16 bg-gradient-to-r from-[#c9a87c] to-[#b8886e] hover:from-[#b8986c] hover:to-[#a8785e] disabled:from-gray-300 disabled:to-gray-300 dark:disabled:from-gray-600 dark:disabled:to-gray-600 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm"
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
