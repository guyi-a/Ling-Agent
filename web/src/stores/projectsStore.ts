import { create } from 'zustand'
import apiClient from '@/api/client'
import type { Project, AdhocSession } from '@/types'

interface ProjectsState {
  projects: Project[]
  adhocSessions: AdhocSession[]
  expandedProjectId: number | null
  isLoading: boolean

  loadProjects: () => Promise<void>
  loadAdhocSessions: () => Promise<void>
  loadAll: () => Promise<void>
  deleteProject: (projectId: number) => Promise<boolean>
  updateProject: (projectId: number, patch: { title?: string; description?: string; icon?: string }) => Promise<boolean>
  setExpandedProject: (projectId: number | null) => void
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  adhocSessions: [],
  expandedProjectId: null,
  isLoading: false,

  loadProjects: async () => {
    try {
      const { data } = await apiClient.get<Project[]>('/api/projects/')
      set({ projects: data })
    } catch (e) {
      console.error('加载项目列表失败:', e)
    }
  },

  loadAdhocSessions: async () => {
    try {
      const { data } = await apiClient.get<AdhocSession[]>('/api/projects/adhoc')
      set({ adhocSessions: data })
    } catch (e) {
      console.error('加载临时对话失败:', e)
    }
  },

  loadAll: async () => {
    set({ isLoading: true })
    await Promise.all([
      get().loadProjects(),
      get().loadAdhocSessions(),
    ])
    set({ isLoading: false })
  },

  deleteProject: async (projectId) => {
    try {
      await apiClient.delete(`/api/projects/${projectId}`)
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== projectId),
        adhocSessions: s.adhocSessions.filter((s) => s.project_id !== projectId),
      }))
      return true
    } catch (e) {
      console.error('删除项目失败:', e)
      return false
    }
  },

  updateProject: async (projectId, patch) => {
    try {
      await apiClient.patch(`/api/projects/${projectId}`, patch)
      set((s) => ({
        projects: s.projects.map((p) =>
          p.id === projectId ? { ...p, ...patch } : p
        ),
      }))
      return true
    } catch (e) {
      console.error('更新项目失败:', e)
      return false
    }
  },

  setExpandedProject: (projectId) => {
    set({ expandedProjectId: projectId })
  },
}))
