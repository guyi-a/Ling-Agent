import { create } from 'zustand'
import apiClient from '@/api/client'

type ApprovalMode = 'default' | 'auto' | 'custom'

interface SettingsState {
  approvalMode: ApprovalMode
  toolAllowlist: string[]
  toolDenylist: string[]
  loaded: boolean
  load: () => Promise<void>
  setApprovalMode: (mode: ApprovalMode) => Promise<void>
  addToAllowlist: (tool: string) => Promise<void>
  removeFromAllowlist: (tool: string) => Promise<void>
  addToDenylist: (tool: string) => Promise<void>
  removeFromDenylist: (tool: string) => Promise<void>
  setToolStatus: (tool: string, status: 'ask' | 'allow' | 'deny') => Promise<void>
}

async function savePrefs(state: { approvalMode: ApprovalMode; toolAllowlist: string[]; toolDenylist: string[] }) {
  await apiClient.put('/api/users/me/preferences', {
    approval_mode: state.approvalMode,
    tool_allowlist: state.toolAllowlist,
    tool_denylist: state.toolDenylist,
  })
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  approvalMode: 'default',
  toolAllowlist: [],
  toolDenylist: [],
  loaded: false,

  load: async () => {
    try {
      const { data } = await apiClient.get('/api/users/me/preferences')
      set({
        approvalMode: data.approval_mode || 'default',
        toolAllowlist: data.tool_allowlist || [],
        toolDenylist: data.tool_denylist || [],
        loaded: true,
      })
    } catch {
      set({ loaded: true })
    }
  },

  setApprovalMode: async (mode) => {
    set({ approvalMode: mode })
    const s = get()
    await savePrefs(s)
  },

  addToAllowlist: async (tool) => {
    const s = get()
    if (s.toolAllowlist.includes(tool)) return
    const newAllow = [...s.toolAllowlist, tool]
    const newDeny = s.toolDenylist.filter(t => t !== tool)
    set({ toolAllowlist: newAllow, toolDenylist: newDeny })
    await savePrefs({ ...get() })
  },

  removeFromAllowlist: async (tool) => {
    const s = get()
    set({ toolAllowlist: s.toolAllowlist.filter(t => t !== tool) })
    await savePrefs({ ...get() })
  },

  addToDenylist: async (tool) => {
    const s = get()
    if (s.toolDenylist.includes(tool)) return
    const newDeny = [...s.toolDenylist, tool]
    const newAllow = s.toolAllowlist.filter(t => t !== tool)
    set({ toolDenylist: newDeny, toolAllowlist: newAllow })
    await savePrefs({ ...get() })
  },

  removeFromDenylist: async (tool) => {
    const s = get()
    set({ toolDenylist: s.toolDenylist.filter(t => t !== tool) })
    await savePrefs({ ...get() })
  },

  setToolStatus: async (tool, status) => {
    const s = get()
    let newAllow = s.toolAllowlist.filter(t => t !== tool)
    let newDeny = s.toolDenylist.filter(t => t !== tool)
    if (status === 'allow') newAllow.push(tool)
    if (status === 'deny') newDeny.push(tool)
    set({ toolAllowlist: newAllow, toolDenylist: newDeny })
    await savePrefs({ ...get() })
  },
}))
