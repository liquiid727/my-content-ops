import { creatorProfileResponseSchema, type ThemePreference } from '@creator-studio/contracts'
import { create } from 'zustand'
import { apiRequest } from '../../shared/api'
import { useSessionStore } from '../session'

interface ThemeState {
  saving: boolean
  error: string | undefined
  syncPreference: (theme: ThemePreference) => Promise<void>
}

let syncVersion = 0

export const useThemeStore = create<ThemeState>((set) => ({
  saving: false,
  error: undefined,
  syncPreference: async (theme) => {
    const version = ++syncVersion
    set({ saving: true, error: undefined })
    try {
      const response = await apiRequest('/creator-profile/preferences', creatorProfileResponseSchema, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme }),
      })
      if (version === syncVersion) {
        useSessionStore.getState().applyCreatorProfile(response.data)
        set({ saving: false })
      }
    } catch (error) {
      if (version !== syncVersion) return
      const message = error instanceof Error ? error.message : '主题偏好同步失败。'
      set({ saving: false, error: message })
      throw error
    }
  },
}))

export const themeSelectors = {
  saving: (state: ThemeState) => state.saving,
  error: (state: ThemeState) => state.error,
}

export function resetThemeStoreForTests(): void {
  syncVersion = 0
  useThemeStore.setState({ saving: false, error: undefined })
}
