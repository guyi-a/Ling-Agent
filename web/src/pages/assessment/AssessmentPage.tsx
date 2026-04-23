import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ClipboardList, ChevronLeft, ChevronRight, CheckCircle, Clock, AlertTriangle, Play } from 'lucide-react'
import { healthApi, type ScaleSummary, type ScaleData, type Assessment } from '@/api/health'

const SEVERITY_COLORS: Record<string, string> = {
  '正常': 'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40',
  '压力较低': 'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40',
  '轻度抑郁': 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40',
  '轻度焦虑': 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40',
  '中等压力': 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40',
  '中度抑郁': 'text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/40',
  '中度焦虑': 'text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/40',
  '重度抑郁': 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/40',
  '重度焦虑': 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/40',
  '压力较高': 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/40',
}

// 分类标签颜色
// ── 草稿持久化 ──
const DRAFT_PREFIX = 'assessment_draft_'
const DRAFT_EXPIRE_MS = 7 * 24 * 3600 * 1000

interface AssessmentDraft {
  scaleName: string
  answers: Record<number, number>
  currentQ: number
  savedAt: number
}

function saveDraft(scaleName: string, answers: Record<number, number>, currentQ: number) {
  localStorage.setItem(DRAFT_PREFIX + scaleName, JSON.stringify({ scaleName, answers, currentQ, savedAt: Date.now() }))
}

function loadDraft(scaleName: string): AssessmentDraft | null {
  const raw = localStorage.getItem(DRAFT_PREFIX + scaleName)
  if (!raw) return null
  try {
    const draft: AssessmentDraft = JSON.parse(raw)
    if (Date.now() - draft.savedAt > DRAFT_EXPIRE_MS) {
      localStorage.removeItem(DRAFT_PREFIX + scaleName)
      return null
    }
    return draft
  } catch {
    localStorage.removeItem(DRAFT_PREFIX + scaleName)
    return null
  }
}

function clearDraft(scaleName: string) {
  localStorage.removeItem(DRAFT_PREFIX + scaleName)
}

function cleanExpiredDrafts() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(DRAFT_PREFIX)) {
      try {
        const draft = JSON.parse(localStorage.getItem(key)!)
        if (Date.now() - draft.savedAt > DRAFT_EXPIRE_MS) {
          localStorage.removeItem(key)
        }
      } catch {
        localStorage.removeItem(key!)
      }
    }
  }
}

const TAG_COLORS: Record<string, string> = {
  '焦虑': 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40',
  '抑郁': 'text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/40',
  '压力': 'text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-900/40',
  '人格': 'text-teal-700 bg-teal-100 dark:text-teal-300 dark:bg-teal-900/40',
  '趣味': 'text-pink-700 bg-pink-100 dark:text-pink-300 dark:bg-pink-900/40',
}

export default function AssessmentPage() {
  const navigate = useNavigate()
  const [scales, setScales] = useState<ScaleSummary[]>([])
  const [history, setHistory] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)

  const [activeScale, setActiveScale] = useState<ScaleData | null>(null)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [result, setResult] = useState<Assessment | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, AssessmentDraft>>({})

  // 扫描 localStorage 中所有草稿
  const refreshDrafts = () => {
    const map: Record<string, AssessmentDraft> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(DRAFT_PREFIX)) {
        const draft = loadDraft(key.slice(DRAFT_PREFIX.length))
        if (draft) map[draft.scaleName] = draft
      }
    }
    setDrafts(map)
  }

  useEffect(() => {
    cleanExpiredDrafts()
    refreshDrafts()
    Promise.all([healthApi.getScales(), healthApi.getAssessmentHistory()])
      .then(([s, h]) => { setScales(s); setHistory(h) })
      .catch(e => console.error('加载失败:', e))
      .finally(() => setLoading(false))
  }, [])

  const startAssessment = async (scaleName: string) => {
    try {
      const data = await healthApi.getScaleQuestions(scaleName)
      setActiveScale(data)
      setResult(null)
      // 检查草稿
      const draft = loadDraft(scaleName)
      if (draft && Object.keys(draft.answers).length > 0) {
        setAnswers(draft.answers)
        setCurrentQ(draft.currentQ)
        setDraftRestored(true)
      } else {
        setCurrentQ(0)
        setAnswers({})
        setDraftRestored(false)
      }
    } catch (e) {
      console.error('加载量表失败:', e)
    }
  }

  const restartAssessment = () => {
    if (activeScale) {
      clearDraft(activeScale.name)
      setAnswers({})
      setCurrentQ(0)
      setDraftRestored(false)
      refreshDrafts()
    }
  }

  const selectAnswer = (qId: number, score: number) => {
    const newAnswers = { ...answers, [qId]: score }
    setAnswers(newAnswers)
    if (activeScale) {
      saveDraft(activeScale.name, newAnswers, currentQ)
    }
  }

  const handleSubmit = async () => {
    if (!activeScale) return
    const answerList = activeQuestions.map(q => ({ q: q.id, score: answers[q.id] ?? 0 }))
    try {
      setSubmitting(true)
      const res = await healthApi.submitAssessment({ scale_type: activeScale.name, answers: answerList })
      setResult(res)
      setHistory([res, ...history])
      clearDraft(activeScale.name)
      refreshDrafts()
    } catch (e) {
      console.error('提交失败:', e)
    } finally {
      setSubmitting(false)
    }
  }

  const exitAssessment = () => {
    setActiveScale(null)
    setResult(null)
    setAnswers({})
    setDraftRestored(false)
    refreshDrafts()
  }

  // 条件题过滤（CSTI Q32/Q33 等）
  const activeQuestions = activeScale
    ? activeScale.questions.filter(q => {
        if (!q.show_condition) return true
        return answers[q.show_condition.q] === q.show_condition.score
      })
    : []
  const question = activeQuestions[currentQ]
  const allAnswered = activeQuestions.every(q => answers[q.id] !== undefined)
  const resultDetail = result?.result_detail ? (() => { try { return JSON.parse(result.result_detail!) } catch { return null } })() : null
  const resultType = result?.result_type || 'severity'


  return (
    <div className="flex h-screen bg-[#f5f0e8] dark:bg-gray-900">
      <div className="flex-1 overflow-y-auto">
        {/* 顶栏 */}
        <div className="sticky top-0 bg-[#f5f0e8]/80 dark:bg-gray-900/80 backdrop-blur border-b border-[#e0d5c3] dark:border-gray-700 px-6 py-4 flex items-center gap-3 z-10">
          <button onClick={() => activeScale ? exitAssessment() : navigate('/chat')} className="p-1.5 hover:bg-[#e8dcc8] dark:hover:bg-gray-700 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-[#8b7355] dark:text-gray-400" />
          </button>
          <ClipboardList className="w-5 h-5 text-[#8b7355] dark:text-gray-400" />
          <h1 className="text-lg font-semibold text-[#5a4a3a] dark:text-gray-100">
            {activeScale ? activeScale.title : '心理测评'}
          </h1>
        </div>

        <div className="max-w-4xl mx-auto p-6">
          {/* ══ 量表选择（首页） ══ */}
          {!activeScale && !result && (
            <>
              {loading ? (
                <div className="text-[#b8a080] text-center py-16">加载中...</div>
              ) : (
                <div className="space-y-10">
                  {/* 按分类分组显示 */}
                  {[
                    { key: 'clinical', title: '标准心理量表', subtitle: '国际通用的标准化心理健康评估工具', filter: (s: ScaleSummary) => !['人格', '趣味'].includes(s.category) },
                    { key: 'personality', title: '人格测试', subtitle: '探索你的人格特质与性格偏好', filter: (s: ScaleSummary) => s.category === '人格' },
                    { key: 'fun', title: '趣味测试', subtitle: '轻松有趣的自我探索，纯娱乐', filter: (s: ScaleSummary) => s.category === '趣味' },
                  ].map(group => {
                    const groupScales = scales.filter(group.filter)
                    if (groupScales.length === 0) return null
                    return (
                      <div key={group.key}>
                        <div className="flex items-center gap-3 mb-6">
                          <ClipboardList className="w-5 h-5 text-[#8b7355] dark:text-gray-400" />
                          <div>
                            <h2 className="text-lg font-semibold text-[#5a4a3a] dark:text-gray-100">{group.title}</h2>
                            <p className="text-xs text-[#b8a080] dark:text-gray-500">{group.subtitle}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {groupScales.map(s => {
                      const tagColor = TAG_COLORS[s.category] || 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-700'
                      const latest = history.find(h => h.scale_type === s.name)
                      return (
                        <div
                          key={s.name}
                          className="bg-white/90 dark:bg-gray-800/80 rounded-xl border border-[#e0d5c3] dark:border-gray-700 p-5 flex flex-col hover:-translate-y-0.5 hover:shadow-md transition-all"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-[#5a4a3a] dark:text-gray-100">{s.title}</h3>
                            {s.category && (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${tagColor}`}>{s.category}</span>
                            )}
                          </div>
                          <p className="text-xs text-[#8b7355] dark:text-gray-400 mb-3 flex-1">{s.description}</p>
                          {latest && (
                            <div className="flex items-center gap-2 mb-3 text-xs flex-wrap">
                              <span className="text-[#b8a080] dark:text-gray-500">上次:</span>
                              {(!latest.result_type || latest.result_type === 'severity') ? (
                                <>
                                  <span className="font-medium text-[#5a4a3a] dark:text-gray-300">{latest.total_score}分</span>
                                  <span className={`px-1.5 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[latest.severity] || 'text-gray-500 bg-gray-100'}`}>
                                    {latest.severity}
                                  </span>
                                </>
                              ) : latest.result_type === 'personality' ? (
                                <span className="font-medium text-teal-700 dark:text-teal-300">
                                  {(() => { try { const d = JSON.parse(latest.result_detail || '{}'); return `${d.emoji || ''} ${latest.severity} ${d.title || ''}`; } catch { return latest.severity; } })()}
                                </span>
                              ) : (
                                <span className="font-medium text-pink-700 dark:text-pink-300">
                                  {(() => { try { const d = JSON.parse(latest.result_detail || '{}'); return `${d.title || latest.severity} ${d.similarity != null ? d.similarity + '%' : ''}`; } catch { return latest.severity; } })()}
                                </span>
                              )}
                              <span className="text-[#c9b896] dark:text-gray-600">{new Date(latest.created_at.endsWith('Z') || latest.created_at.includes('+') ? latest.created_at : latest.created_at + 'Z').toLocaleDateString('zh-CN')}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-xs text-[#b8a080] dark:text-gray-500">
                              <span>{s.question_count} 题</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> ~{s.estimated_minutes} 分钟</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {drafts[s.name] && (
                                <span className="text-xs text-amber-600 dark:text-amber-400">
                                  已答 {Object.keys(drafts[s.name].answers).length}/{s.question_count}
                                </span>
                              )}
                              <button
                                onClick={() => startAssessment(s.name)}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-[#c9a87c] hover:bg-[#b8986c] text-white transition-colors"
                              >
                                <Play className="w-3.5 h-3.5" />
                                {drafts[s.name] ? '继续' : latest ? '重测' : '开始'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ══ 答题中 ══ */}
          {activeScale && !result && question && (
            <div className="mt-4">
              {/* 恢复提示 */}
              {draftRestored && (
                <div className="mb-4 flex items-center justify-between px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm">
                  <span className="text-amber-700 dark:text-amber-300">
                    已恢复上次进度（第 {currentQ + 1}/{activeQuestions.length} 题）
                  </span>
                  <button
                    onClick={restartAssessment}
                    className="text-xs px-3 py-1 rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                  >
                    重新开始
                  </button>
                </div>
              )}
              {/* 进度条 */}
              <div className="mb-6">
                <div className="flex justify-between text-xs text-[#b8a080] dark:text-gray-500 mb-1.5">
                  <span>第 {currentQ + 1} / {activeQuestions.length} 题</span>
                  <span>{Math.round(((currentQ + 1) / activeQuestions.length) * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-[#e8dcc8] dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-2 bg-[#c9a87c] rounded-full transition-all"
                    style={{ width: `${((currentQ + 1) / activeQuestions.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* 题目 */}
              <div className="bg-white/90 dark:bg-gray-800/80 rounded-2xl border border-[#e0d5c3] dark:border-gray-700 p-6">
                <p className="text-base text-[#5a4a3a] dark:text-gray-100 mb-6 font-medium">{question.text}</p>
                <div className="space-y-2.5">
                  {question.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => selectAnswer(question.id, opt.score)}
                      className={`w-full text-left px-5 py-3.5 rounded-xl border text-sm transition-all ${
                        answers[question.id] === opt.score
                          ? 'border-[#c9a87c] bg-[#c9a87c]/10 text-[#8b7355] dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-600 font-medium'
                          : 'border-[#e0d5c3] dark:border-gray-600 text-[#5a4a3a] dark:text-gray-300 hover:bg-[#f5f0e8] dark:hover:bg-gray-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 导航 */}
              <div className="flex justify-between mt-6">
                <button
                  onClick={() => { const q = Math.max(0, currentQ - 1); setCurrentQ(q); if (activeScale) saveDraft(activeScale.name, answers, q) }}
                  disabled={currentQ === 0}
                  className="flex items-center gap-1 px-4 py-2 text-sm text-[#8b7355] dark:text-gray-400 hover:bg-[#e8dcc8] dark:hover:bg-gray-700 rounded-lg disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> 上一题
                </button>

                {currentQ < activeQuestions.length - 1 ? (
                  <button
                    onClick={() => { const q = currentQ + 1; setCurrentQ(q); if (activeScale) saveDraft(activeScale.name, answers, q) }}
                    disabled={answers[question.id] === undefined}
                    className="flex items-center gap-1 px-4 py-2 text-sm bg-[#c9a87c] hover:bg-[#b8986c] text-white rounded-lg disabled:opacity-30 transition-colors"
                  >
                    下一题 <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={!allAnswered || submitting}
                    className="flex items-center gap-1 px-5 py-2 text-sm bg-[#c9a87c] hover:bg-[#b8986c] text-white rounded-lg disabled:opacity-30 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {submitting ? '提交中...' : '提交'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ══ 结果 ══ */}
          {result && (
            <div className="mt-4">
              <div className="bg-white/90 dark:bg-gray-800/80 rounded-2xl border border-[#e0d5c3] dark:border-gray-700 p-8 text-center">

                {/* ── severity 类型结果（临床量表） ── */}
                {resultType === 'severity' && (
                  <>
                    <div className="mb-5">
                      <div className="text-5xl font-bold text-[#5a4a3a] dark:text-gray-100 mb-1">{result.total_score}</div>
                      <div className="text-sm text-[#b8a080] dark:text-gray-500">总分</div>
                    </div>
                    <div className={`inline-block px-5 py-1.5 rounded-full text-sm font-medium mb-5 ${SEVERITY_COLORS[result.severity] || ''}`}>
                      {result.severity}
                    </div>
                    {result.severity.includes('重度') && (
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 text-left max-w-md mx-auto">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-red-700 dark:text-red-300">
                            <p className="font-medium mb-1">建议尽快寻求专业帮助</p>
                            <p>全国24小时心理援助热线：<strong>400-161-9995</strong></p>
                            <p>生命热线：<strong>400-821-1215</strong></p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── personality 类型结果（MBTI） ── */}
                {resultType === 'personality' && resultDetail && (
                  <>
                    <div className="text-5xl mb-2">{resultDetail.emoji}</div>
                    <div className="text-4xl font-bold text-[#5a4a3a] dark:text-gray-100 mb-1 tracking-widest">{resultDetail.type}</div>
                    <div className="text-base font-medium text-teal-700 dark:text-teal-300 mb-3">{resultDetail.title}</div>
                    <p className="text-sm text-[#8b7355] dark:text-gray-400 mb-6 max-w-md mx-auto">{resultDetail.description}</p>

                    {/* 维度偏好条 */}
                    {resultDetail.dimensions && (
                      <div className="max-w-sm mx-auto space-y-3 mb-6">
                        {Object.entries(resultDetail.dimensions as Record<string, Record<string, number>>).map(([dim, counts]) => {
                          const keys = Object.keys(counts)
                          const left = keys[0], right = keys[1]
                          const lv = counts[left], rv = counts[right]
                          const total = lv + rv || 1
                          const leftPct = Math.round((lv / total) * 100)
                          return (
                            <div key={dim} className="flex items-center gap-2 text-xs">
                              <span className={`w-5 text-right font-bold ${lv >= rv ? 'text-teal-700 dark:text-teal-300' : 'text-[#b8a080] dark:text-gray-500'}`}>{left}</span>
                              <div className="flex-1 h-3.5 bg-[#e8dcc8] dark:bg-gray-700 rounded-full overflow-hidden relative">
                                <div className="absolute inset-0 flex">
                                  <div className="h-full bg-teal-400 dark:bg-teal-500 rounded-l-full transition-all" style={{ width: `${leftPct}%` }} />
                                </div>
                              </div>
                              <span className={`w-5 font-bold ${rv > lv ? 'text-teal-700 dark:text-teal-300' : 'text-[#b8a080] dark:text-gray-500'}`}>{right}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}

                {/* ── label 类型结果（SBTI） ── */}
                {resultType === 'label' && resultDetail && (
                  <>
                    <div className="text-lg font-bold text-pink-600 dark:text-pink-400 mb-1 tracking-widest">{resultDetail.label}</div>
                    <div className="text-3xl font-bold text-[#5a4a3a] dark:text-gray-100 mb-2">{resultDetail.title}</div>
                    {resultDetail.subtitle && (
                      <div className="text-sm text-[#8b7355] dark:text-gray-400 mb-3">{resultDetail.subtitle}</div>
                    )}
                    {resultDetail.similarity != null && (
                      <div className="text-sm text-[#b8a080] dark:text-gray-500 mb-4">
                        匹配度 <span className="font-bold text-pink-600 dark:text-pink-400">{resultDetail.similarity}%</span>
                      </div>
                    )}
                    {resultDetail.pattern && (
                      <div className="inline-block px-4 py-1.5 rounded-lg bg-[#f5f0e8] dark:bg-gray-700 text-xs font-mono text-[#8b7355] dark:text-gray-400 mb-4 tracking-wider">
                        {resultDetail.pattern}
                      </div>
                    )}
                    {resultDetail.dimensions && (
                      <div className="max-w-md mx-auto grid grid-cols-3 gap-2 mb-6 text-xs">
                        {Object.entries(resultDetail.dimensions as Record<string, { raw: number; level: string }>).map(([dim, info]) => (
                          <div key={dim} className={`px-2.5 py-1.5 rounded-lg border ${
                            info.level === 'H' ? 'border-pink-300 bg-pink-50 text-pink-700 dark:border-pink-700 dark:bg-pink-900/20 dark:text-pink-300' :
                            info.level === 'L' ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300' :
                            'border-[#e0d5c3] bg-[#f5f0e8] text-[#8b7355] dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400'
                          }`}>
                            <div className="font-medium">{dim}</div>
                            <div className="font-bold">{info.level}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <button
                  onClick={exitAssessment}
                  className="px-8 py-2.5 bg-[#c9a87c] hover:bg-[#b8986c] text-white rounded-lg text-sm font-medium transition-colors"
                >
                  返回
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
