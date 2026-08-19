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

    expect(await screen.findByRole('heading', { name: 'Workbench' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'HelloAlro' })).toBeTruthy()
    expect(screen.getByRole('tablist', { name: 'Open projects' })).toBeTruthy()
    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getByTestId('notification-region')).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Theme' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Language' })).toBeNull()
  })

  it('marks the current primary route and navigates every main destination', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Workbench' })

    const expectations = [
      ['Projects', 'Projects'],
      ['Assets', 'Assets'],
      ['Personal style', 'Creator profile'],
      ['Settings', 'Settings'],
      ['HelloAlro', 'Workbench'],
    ] as const

    for (const [linkName, heading] of expectations) {
      const link = screen.getByRole('link', { name: linkName })
      fireEvent.click(link)
      await screen.findByRole('heading', { name: heading })
      expect(link.getAttribute('aria-current')).toBe('page')
    }
  })

  it('keeps sidebar collapse at the top and Settings as the bottom utility', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Workbench' })

    const sidebar = screen.getByLabelText('Workspace sidebar')
    const collapse = within(sidebar).getByRole('button', { name: 'Collapse sidebar' })
    const primaryNavigation = within(sidebar).getByRole('navigation', { name: 'Primary navigation' })
    const settings = within(sidebar).getByRole('link', { name: 'Settings' })

    expect(collapse.compareDocumentPosition(primaryNavigation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(primaryNavigation.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(collapse)
    expect(sidebar.classList.contains('lg:w-[4.75rem]')).toBe(true)
    expect(settings.className).toContain('lg:justify-center')
  })

  it('opens the mobile navigation, moves focus in, and restores it when closed', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Workbench' })
    const openButton = screen.getByRole('button', { name: 'Open navigation' })
    const sidebar = screen.getByLabelText('Workspace sidebar')

    expect(sidebar.classList.contains('-translate-x-full')).toBe(true)
    fireEvent.click(openButton)
    const closeButton = within(sidebar).getByRole('button', { name: 'Close navigation' })
    await waitFor(() => expect(document.activeElement).toBe(closeButton))
    expect(openButton.getAttribute('aria-expanded')).toBe('true')
    expect(sidebar.classList.contains('translate-x-0')).toBe(true)

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(sidebar.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(closeButton)

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(openButton))
    expect(openButton.getAttribute('aria-expanded')).toBe('false')
    expect(sidebar.classList.contains('-translate-x-full')).toBe(true)
  })

  it('shows a recoverable Not Found route', async () => {
    window.history.replaceState({}, '', '/missing-route')
    renderApp()

    expect(await screen.findByRole('heading', { name: 'This route does not exist.' })).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Return to Dashboard' }))
    expect(await screen.findByRole('heading', { name: 'Workbench' })).toBeTruthy()
  })

  it('exposes every Project Detail section and labels P1 placeholders honestly', async () => {
    window.history.replaceState({}, '', '/projects/preview/ideas')
    renderApp()

    expect(await screen.findByRole('heading', { level: 1, name: 'Ideas' })).toBeTruthy()
    expect(screen.getByText('Planned · P1')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Return to Project Overview' }).getAttribute('href')).toBe('/projects/preview/overview')
    expect(within(screen.getByRole('navigation', { name: 'Project sections' })).getAllByRole('link')).toHaveLength(10)
    expect(screen.getByRole('link', { name: 'Ideas' }).getAttribute('aria-current')).toBe('page')
  })

  it('redirects a bare Project Detail route to Overview', async () => {
    window.history.replaceState({}, '', '/projects/preview')
    renderApp()

    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeTruthy()
    expect(window.location.pathname).toBe('/projects/preview/overview')
  })

  it('renders the canvas route inside the unified workbench chrome', async () => {
    window.history.replaceState({}, '', '/projects/preview/canvas')
    renderApp()

    expect(await screen.findByTestId('canvas-host')).toBeTruthy()
    expect(screen.queryByTestId('canvas-shell')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Overview' })).toBeNull()
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy()
  })

  it('honors an existing dark profile preference and supports all theme selections', async () => {
    window.history.replaceState({}, '', '/settings')
    renderApp()
    await screen.findByRole('heading', { name: 'Settings' })
    fireEvent.click(screen.getByRole('button', { name: 'Appearance and language' }))
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
    window.history.replaceState({}, '', '/settings')
    renderApp()
    await screen.findByRole('heading', { name: 'Settings' })
    fireEvent.click(screen.getByRole('button', { name: 'Appearance and language' }))
    const themeSelect = screen.getByRole('combobox', { name: 'Theme' })
    fireEvent.click(themeSelect)
    fireEvent.click(await screen.findByRole('option', { name: 'Light' }))
    expect(themeSelect.textContent).toContain('Light')
    expect(await screen.findByText('Theme applied locally')).toBeTruthy()
    expect(screen.getByText(/CreatorProfile sync failed/)).toBeTruthy()
  })

  it('updates the active class while following the system theme', async () => {
    window.history.replaceState({}, '', '/settings')
    renderApp()
    await screen.findByRole('heading', { name: 'Settings' })
    fireEvent.click(screen.getByRole('button', { name: 'Appearance and language' }))
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

  it('opens directly on creation objects without management KPI cards', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Workbench' })
    expect(screen.getByRole('heading', { name: 'Recent projects' })).toBeTruthy()
    expect(screen.queryByText('Current projects')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Preview notification' })).toBeNull()
  })

  it('defaults to Chinese and switches the full interface to English', async () => {
    localStorage.removeItem('creator-studio-locale')
    resetLanguageStoreForTests()
    renderApp()

    expect(await screen.findByRole('heading', { name: '创作台' })).toBeTruthy()
    expect(document.documentElement.lang).toBe('zh-CN')
    fireEvent.click(screen.getByRole('link', { name: '设置' }))
    await screen.findByRole('heading', { name: '设置' })
    fireEvent.click(screen.getByRole('button', { name: '外观与语言' }))
    fireEvent.click(screen.getByRole('combobox', { name: '语言' }))
    fireEvent.click(await screen.findByRole('option', { name: 'English' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy()
    expect(document.documentElement.lang).toBe('en-US')
    expect(localStorage.getItem('creator-studio-locale')).toBe('en-US')
  })
})
