// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetSessionStoreForTests, useSessionStore } from '../session'
import { resetLanguageStoreForTests, useLanguageStore } from './language-store'
import { enUS, zhCN } from './resources'

const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'
const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY'
const localeStorage = new Map<string, string>()

function keys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return child && typeof child === 'object' ? keys(child, path) : [path]
  }).sort()
}

function profile(locale: 'zh-CN' | 'en-US') {
  return new Response(JSON.stringify({
    data: { id: PROFILE_ID, displayName: 'Creator', preferences: { theme: 'dark', locale } },
    meta: { requestId: REQUEST_ID },
  }), { status: 200 })
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      clear: () => localeStorage.clear(),
      getItem: (key: string) => localeStorage.get(key) ?? null,
      key: (index: number) => [...localeStorage.keys()][index] ?? null,
      get length() { return localeStorage.size },
      removeItem: (key: string) => localeStorage.delete(key),
      setItem: (key: string, value: string) => localeStorage.set(key, value),
    } satisfies Storage,
  })
})

beforeEach(() => {
  localStorage.clear()
  resetSessionStoreForTests()
  resetLanguageStoreForTests()
  useSessionStore.setState({
    status: 'ready',
    data: {
      workspace: { id: '01ARZ3NDEKTSV4RRFFQ69G5FAA', name: 'Studio' },
      creatorProfile: { id: PROFILE_ID, displayName: 'Creator', preferences: { theme: 'dark', locale: 'zh-CN' } },
      activeTasks: [], capabilities: { connectors: false, providers: false }, settings: { providers: [], connectors: [] },
    },
  })
  vi.restoreAllMocks()
})

describe('Creator Studio i18n', () => {
  it('keeps the Chinese and English resource trees in parity', () => {
    expect(keys(enUS)).toEqual(keys(zhCN))
  })

  it('uses the local locale ahead of the profile locale', () => {
    localStorage.setItem('creator-studio-locale', 'zh-CN')
    resetLanguageStoreForTests()
    useLanguageStore.getState().initializeFromProfile('en-US')

    expect(useLanguageStore.getState().locale).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('ignores an older sync response that arrives after the latest locale selection', async () => {
    let releaseEnglish!: () => void
    let releaseChinese!: () => void
    const englishGate = new Promise<void>((resolve) => { releaseEnglish = resolve })
    const chineseGate = new Promise<void>((resolve) => { releaseChinese = resolve })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const locale = (JSON.parse(String(init?.body)) as { locale: 'zh-CN' | 'en-US' }).locale
      await (locale === 'en-US' ? englishGate : chineseGate)
      return profile(locale)
    })

    const english = useLanguageStore.getState().changeLocale('en-US')
    const chinese = useLanguageStore.getState().changeLocale('zh-CN')
    releaseChinese()
    await chinese
    releaseEnglish()
    await english

    expect(useLanguageStore.getState()).toMatchObject({ locale: 'zh-CN', saving: false, error: undefined })
    expect(useSessionStore.getState().data?.creatorProfile.preferences.locale).toBe('zh-CN')
  })

  it('keeps an immediately applied local locale when profile sync fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'INTERNAL_ERROR', message: 'sync failed', retryable: false },
      meta: { requestId: REQUEST_ID },
    }), { status: 500 }))

    await expect(useLanguageStore.getState().changeLocale('en-US')).rejects.toThrow()

    expect(useLanguageStore.getState()).toMatchObject({ locale: 'en-US', saving: false })
    expect(localStorage.getItem('creator-studio-locale')).toBe('en-US')
    expect(document.documentElement.lang).toBe('en-US')
  })
})
