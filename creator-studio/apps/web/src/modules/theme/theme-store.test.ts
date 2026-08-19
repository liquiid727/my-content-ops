// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionStoreForTests, useSessionStore } from '../session'
import { resetThemeStoreForTests, useThemeStore } from './theme-store'

const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'

function response(theme: 'light' | 'dark') {
  return new Response(JSON.stringify({ data: { id: PROFILE_ID, displayName: 'Creator', preferences: { theme, locale: 'zh-CN' } }, meta: { requestId: REQUEST_ID } }), { status: 200 })
}

beforeEach(() => {
  resetSessionStoreForTests()
  resetThemeStoreForTests()
  useSessionStore.setState({ status: 'ready', data: { workspace: { id: '01ARZ3NDEKTSV4RRFFQ69G5FAA', name: 'Studio' }, creatorProfile: { id: PROFILE_ID, displayName: 'Creator', preferences: { theme: 'dark', locale: 'zh-CN' } }, activeTasks: [], capabilities: { connectors: false, providers: false }, settings: { providers: [], connectors: [] } } })
})
afterEach(() => vi.restoreAllMocks())

describe('theme preference store', () => {
  it('ignores an older response that arrives after the latest selection', async () => {
    let releaseLight!: () => void
    let releaseDark!: () => void
    const lightGate = new Promise<void>((resolve) => { releaseLight = resolve })
    const darkGate = new Promise<void>((resolve) => { releaseDark = resolve })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const theme = (JSON.parse(String(init?.body)) as { theme: 'light' | 'dark' }).theme
      await (theme === 'light' ? lightGate : darkGate)
      return response(theme)
    })
    const light = useThemeStore.getState().syncPreference('light')
    const dark = useThemeStore.getState().syncPreference('dark')
    releaseDark()
    await dark
    releaseLight()
    await light
    expect(useSessionStore.getState().data?.creatorProfile.preferences.theme).toBe('dark')
    expect(useThemeStore.getState()).toMatchObject({ saving: false, error: undefined })
  })
})
