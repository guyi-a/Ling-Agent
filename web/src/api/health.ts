import apiClient from './client'

export interface HealthRecord {
  id: number
  record_id: string
  user_id: string
  record_type: 'body' | 'emotion'
  body_part?: string
  discomfort_level?: number
  symptoms?: string
  emotion?: string
  emotion_level?: number
  trigger?: string
  notes?: string
  created_at: string
}

export interface HealthRecordCreate {
  record_type: 'body' | 'emotion'
  body_part?: string
  discomfort_level?: number
  symptoms?: string
  emotion?: string
  emotion_level?: number
  trigger?: string
  notes?: string
}

export interface HealthStats {
  total_records: number
  body_records: number
  emotion_records: number
  emotion_trend: { date: string; emotion: string; level: number }[]
  body_part_stats: { part: string; count: number }[]
}

export interface Assessment {
  id: number
  assessment_id: string
  user_id: string
  scale_type: string
  answers?: string
  total_score: number
  severity: string
  result_type?: string
  result_detail?: string
  ai_suggestion?: string
  created_at: string
}

export interface ScaleSummary {
  name: string
  category: string
  title: string
  description: string
  question_count: number
  estimated_minutes: number
  scoring_type?: string
}

export interface ScaleData {
  name: string
  title: string
  description: string
  instruction: string
  scoring_type?: string
  questions: {
    id: number
    text: string
    options: { label: string; score: number }[]
    show_condition?: { q: number; score: number }
  }[]
  scoring: Record<string, unknown>
}

export const healthApi = {
  // 健康日记
  createRecord: async (data: HealthRecordCreate) => {
    const { data: res } = await apiClient.post<HealthRecord>('/api/health/records', data)
    return res
  },
  getRecords: async (params?: { record_type?: string; days?: number; skip?: number; limit?: number }) => {
    const { data } = await apiClient.get<HealthRecord[]>('/api/health/records', { params })
    return data
  },
  getRecord: async (recordId: string) => {
    const { data } = await apiClient.get<HealthRecord>(`/api/health/records/${recordId}`)
    return data
  },
  deleteRecord: async (recordId: string) => {
    await apiClient.delete(`/api/health/records/${recordId}`)
  },
  getStats: async (days?: number) => {
    const { data } = await apiClient.get<HealthStats>('/api/health/stats', { params: { days } })
    return data
  },

  // 心理测评
  submitAssessment: async (data: { scale_type: string; answers: { q: number; score: number }[] }) => {
    const { data: res } = await apiClient.post<Assessment>('/api/health/assessment/submit', data)
    return res
  },
  getScales: async () => {
    const { data } = await apiClient.get<ScaleSummary[]>('/api/health/assessment/scales')
    return data
  },
  getScaleQuestions: async (scaleType: string) => {
    const { data } = await apiClient.get<ScaleData>(`/api/health/assessment/scales/${scaleType}`)
    return data
  },
  getAssessmentHistory: async (params?: { scale_type?: string; skip?: number; limit?: number }) => {
    const { data } = await apiClient.get<Assessment[]>('/api/health/assessment/history', { params })
    return data
  },
}
