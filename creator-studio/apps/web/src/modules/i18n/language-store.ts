import { creatorProfileResponseSchema, type LocalePreference } from '@creator-studio/contracts'
import { create } from 'zustand'

import { apiRequest } from '../../shared/api'
import { useSessionStore } from '../session'
import i18n, { LOCALE_STORAGE_KEY, readStoredLocale, setDocumentLocale } from './i18n'

interface LanguageState {
  locale: LocalePreference
  saving: boolean
  error: string | undefined
  initializeFromProfile: (locale: LocalePreference) => void
  changeLocale: (locale: LocalePreference) => Promise<void>
}

let initialized = false
let syncVersion = 0

function applyLocale(locale: LocalePreference, persist: boolean): void {
  void i18n.changeLanguage(locale)
  setDocumentLocale(locale)
  if (!persist) return
  try { globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale) } catch { /* Local storage is optional. */ }
}

const initialLocale = readStoredLocale() ?? 'zh-CN'

export const useLanguageStore = create<LanguageState>((set) => ({
  locale: initialLocale,
  saving: false,
  error: undefined,
  initializeFromProfile: (profileLocale) => {
    if (initialized) return
    initialized = true
    const locale = readStoredLocale() ?? profileLocale
    applyLocale(locale, false)
    set({ locale })
  },
  changeLocale: async (locale) => {
    const version = ++syncVersion
    applyLocale(locale, true)
    set({ locale, saving: true, error: undefined })
    try {
      const response = await apiRequest('/creator-profile/preferences', creatorProfileResponseSchema, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale }),
      })
      if (version === syncVersion) {
        useSessionStore.getState().applyCreatorProfile(response.data)
        set({ saving: false })
      }
    } catch (error) {
      if (version !== syncVersion) return
      set({ saving: false, error: error instanceof Error ? error.message : 'Language preference sync failed.' })
      throw error
    }
  },
}))

export function resetLanguageStoreForTests(): void {
  initialized = false
  syncVersion = 0
  const locale = readStoredLocale() ?? 'zh-CN'
  applyLocale(locale, false)
  useLanguageStore.setState({ locale, saving: false, error: undefined })
}
