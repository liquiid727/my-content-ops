// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import SettingsPage from './settings-page'

const { loadSettings } = vi.hoisted(() => ({ loadSettings: vi.fn() }))

vi.mock('../modules/settings', () => ({
  loadSettings,
  saveSetting: vi.fn(),
  testSetting: vi.fn(),
}))

vi.mock('../modules/theme', () => ({
  ThemeSwitcher: () => <label>Theme<select aria-label="Theme"><option>dark</option></select></label>,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SettingsPage', () => {
  it('uses the unified external-connections entry after loading legacy settings', async () => {
    loadSettings.mockResolvedValue({
      data: {
        providers: [],
        connectors: [
          { key: 'lark_cli', displayName: 'Lark CLI', enabled: true, configured: true, config: { command: '/opt/bin/lark' }, check: { status: null, checkedAt: null }, availability: 'stub_only' },
          { key: 'obsidian', displayName: 'Obsidian', enabled: true, configured: true, config: { vaultRoot: '/vault/content' }, check: { status: null, checkedAt: null }, availability: 'stub_only' },
        ],
      },
      meta: { requestId: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    })

    render(<SettingsPage />)

    await screen.findByRole('button', { name: '外部资料连接' })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lark CLI' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '外部资料连接' }))
    expect(await screen.findByRole('heading', { name: '添加连接' })).toBeTruthy()
  })
})
