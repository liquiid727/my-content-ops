// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import { AppProviders } from './providers'
import { useToastStore } from '../shared/ui'
import { resetSessionStoreForTests } from '../modules/session'
import { resetLanguageStoreForTests } from '../modules/i18n'

const systemThemeListeners = new Set<(event: MediaQueryListEvent) => void>()
const themeStorage = new Map<string, string>()
let systemPrefersDark = false
const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'

function bootstrapEnvelope() {
  return { data: { workspace: { id: '01ARZ3NDEKTSV4RRFFQ69G5FAA', name: 'Studio' }, creatorProfile: { id: PROFILE_ID, displayName: 'Creator', preferences: { theme: 'dark', locale: 'zh-CN' } }, activeTasks: [], capabilities: { connectors: false, providers: false }, settings: { providers: [], connectors: [] } }, meta: { requestId: REQUEST_ID } }
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      clear: () => themeStorage.clear(),
      getItem: (key: string) => themeStorage.get(key) ?? null,
      key: (index: number) => [...themeStorage.keys()][index] ?? null,
      get length() {
        return themeStorage.size
      },
      removeItem: (key: string) => themeStorage.delete(key),
      setItem: (key: string, value: string) => themeStorage.set(key, value),
    } satisfies Storage,
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return systemPrefersDark
      },
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => systemThemeListeners.add(listener)),
      removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => systemThemeListeners.delete(listener)),
      dispatchEvent: vi.fn(),
    })),
  })
})

beforeEach(() => {
  resetSessionStoreForTests()
  localStorage.clear()
  localStorage.setItem('creator-studio-locale', 'en-US')
  resetLanguageStoreForTests()
  document.documentElement.className = ''
  systemPrefersDark = false
  systemThemeListeners.clear()
  window.history.replaceState({}, '', '/')
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/bootstrap')) return new Response(JSON.stringify(bootstrapEnvelope()), { status: 200 })
    if (url.endsWith('/creator-profile/preferences') && init?.method === 'PATCH') {
      const theme = JSON.parse(String(init.body)) as { theme: 'dark' | 'light' | 'system' }
      return new Response(JSON.stringify({ data: { id: PROFILE_ID, displayName: 'Creator', preferences: theme }, meta: { requestId: REQUEST_ID } }), { status: 200 })
    }
    return new Response(JSON.stringify({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Test route not configured.', retryable: false }, meta: { requestId: REQUEST_ID } }), { status: 404 })
  })
})

afterEach(() => {
  cleanup()
  useToastStore.setState({ messages: [] })
  vi.restoreAllMocks()
})

function renderApp() {
  return render(
    <AppProviders>
      <App />
    </AppProviders>,
  )
}

describe('Creator Studio routing shell', () => {
  it('renders all shell regions and the Dashboard route', async () => {
    renderApp()

    expect(await screen.findByRole('heading', { name: 'Your studio, clearly routed.' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeTruthy()
    expect(screen.getByText('Current context')).toBeTruthy()
    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getByTestId('notification-region')).toBeTruthy()
  })

  it('marks the current primary route and navigates every main destination', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Your studio, clearly routed.' })

    const expectations = [
      ['Projects', 'Projects'],
      ['Assets', 'Assets'],
      ['Tasks', 'Tasks'],
      ['Settings', 'Settings'],
      ['Dashboard', 'Your studio, clearly routed.'],
    ] as const

    for (const [linkName, heading] of expectations) {
      const link = screen.getByRole('link', { name: linkName })
      fireEvent.click(link)
      await screen.findByRole('heading', { name: heading })
      expect(link.getAttribute('aria-current')).toBe('page')
    }
  })

  it('opens the mobile navigation, moves focus in, and restores it when closed', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Your studio, clearly routed.' })
    const openButton = screen.getByRole('button', { name: 'Open navigation' })
    const sidebar = screen.getByLabelText('Workspace sidebar')

    expect(sidebar.classList.contains('invisible')).toBe(true)
    fireEvent.click(openButton)
    const closeButton = within(sidebar).getByRole('button', { name: 'Close navigation' })
    await waitFor(() => expect(document.activeElement).toBe(closeButton))
    expect(openButton.getAttribute('aria-expanded')).toBe('true')
    expect(sidebar.classList.contains('visible')).toBe(true)

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(within(sidebar).getByRole('link', { name: 'Settings' }))
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(closeButton)

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(openButton))
    expect(openButton.getAttribute('aria-expanded')).toBe('false')
    expect(sidebar.classList.contains('invisible')).toBe(true)
  })

  it('shows a recoverable Not Found route', async () => {
    window.history.replaceState({}, '', '/missing-route')
    renderApp()

    expect(await screen.findByRole('heading', { name: 'This route does not exist.' })).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Return to Dashboard' }))
    expect(await screen.findByRole('heading', { name: 'Your studio, clearly routed.' })).toBeTruthy()
  })

  it('exposes every Project Detail section and labels P1 placeholders honestly', async () => {
    window.history.replaceState({}, '', '/projects/preview/ideas')
    renderApp()

    expect(await screen.findByRole('heading', { level: 1, name: 'Ideas' })).toBeTruthy()
    expect(screen.getByText('Planned · P1')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Return to Project Overview' }).getAttribute('href')).toBe('/projects/preview/overview')
    expect(within(screen.getByRole('navigation', { name: 'Project sections' })).getAllByRole('link')).toHaveLength(8)
    expect(screen.getByRole('link', { name: 'Ideas' }).getAttribute('aria-current')).toBe('page')
  })

  it('redirects a bare Project Detail route to Overview', async () => {
    window.history.replaceState({}, '', '/projects/preview')
    renderApp()

    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeTruthy()
    expect(window.location.pathname).toBe('/projects/preview/overview')
  })

  it('uses dark as the default and supports all theme selections', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Your studio, clearly routed.' })
    const themeSelect = screen.getByRole('combobox', { name: 'Theme' })

    expect(themeSelect.textContent).toContain('Dark')
    fireEvent.click(themeSelect)
    fireEvent.click(await screen.findByRole('option', { name: 'System' }))
    expect(themeSelect.textContent).toContain('System')
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url, init]) => String(url).endsWith('/creator-profile/preferences') && init?.method === 'PATCH')).toBe(true))
  })

  it('keeps an immediately applied local theme and warns when profile sync fails', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).endsWith('/bootstrap')) return new Response(JSON.stringify(bootstrapEnvelope()), { status: 200 })
      return new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '偏好保存失败。', retryable: false }, meta: { requestId: REQUEST_ID } }), { status: 500 })
    })
    renderApp()
    await screen.findByRole('heading', { name: 'Your studio, clearly routed.' })
    const themeSelect = screen.getByRole('combobox', { name: 'Theme' })
    fireEvent.click(themeSelect)
    fireEvent.click(await screen.findByRole('option', { name: 'Light' }))
    expect(themeSelect.textContent).toContain('Light')
    expect(await screen.findByText('Theme applied locally')).toBeTruthy()
    expect(screen.getByText(/CreatorProfile sync failed/)).toBeTruthy()
  })

  it('updates the active class while following the system theme', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Your studio, clearly routed.' })
    const themeSelect = screen.getByRole('combobox', { name: 'Theme' })

    fireEvent.click(themeSelect)
    fireEvent.click(await screen.findByRole('option', { name: 'System' }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    act(() => {
      systemPrefersDark = true
      systemThemeListeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent))
    })

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('publishes and dismisses a global notification from Dashboard', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Your studio, clearly routed.' })
    fireEvent.click(screen.getByRole('button', { name: 'Preview notification' }))

    expect(screen.getByText('Workspace ready')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByText('Workspace ready')).toBeNull()
  })

  it('defaults to Chinese and switches the full interface to English', async () => {
    localStorage.removeItem('creator-studio-locale')
    resetLanguageStoreForTests()
    renderApp()

    expect(await screen.findByRole('heading', { name: '清晰掌控你的创作工作台。' })).toBeTruthy()
    expect(document.documentElement.lang).toBe('zh-CN')
    fireEvent.click(screen.getByRole('combobox', { name: '语言' }))
    fireEvent.click(await screen.findByRole('option', { name: 'English' }))
    expect(await screen.findByRole('heading', { name: 'Your studio, clearly routed.' })).toBeTruthy()
    expect(document.documentElement.lang).toBe('en-US')
    expect(localStorage.getItem('creator-studio-locale')).toBe('en-US')
  })
})
