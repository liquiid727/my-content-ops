import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import type { LocalePreference } from '@creator-studio/contracts'
import { resources } from './resources'

export const LOCALE_STORAGE_KEY = 'creator-studio-locale'

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === 'zh-CN' || value === 'en-US'
}

export function readStoredLocale(): LocalePreference | undefined {
  try {
    const value = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY)
    return isLocalePreference(value) ? value : undefined
  } catch {
    return undefined
  }
}

export function setDocumentLocale(locale: LocalePreference): void {
  if (globalThis.document) document.documentElement.lang = locale
}

const initialLocale = readStoredLocale() ?? 'zh-CN'

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: 'zh-CN',
  supportedLngs: ['zh-CN', 'en-US'],
  interpolation: { escapeValue: false },
  returnNull: false,
})

setDocumentLocale(initialLocale)

export default i18n
