// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
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
  it('restores saved connector fields after loading settings', async () => {
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

    expect((await screen.findByRole('textbox', { name: 'Lark 命令' }) as HTMLInputElement).value).toBe('/opt/bin/lark')
    expect((screen.getByRole('textbox', { name: 'Vault 根目录' }) as HTMLInputElement).value).toBe('/vault/content')
  })
})
