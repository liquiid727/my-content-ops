// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionGate } from './session-gate'
import { resetSessionStoreForTests, useSessionStore } from './session-store'

const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY'

export function bootstrapEnvelope(theme: 'dark' | 'light' | 'system' = 'dark') {
  return {
    data: {
      workspace: { id: '01ARZ3NDEKTSV4RRFFQ69G5FAA', name: '个人创作空间' },
      creatorProfile: { id: '01ARZ3NDEKTSV4RRFFQ69G5FAB', displayName: '创作者', preferences: { theme, locale: 'zh-CN' } },
      activeTasks: [], capabilities: { connectors: false, providers: false }, settings: { providers: [], connectors: [] },
    },
    meta: { requestId: REQUEST_ID },
  }
}

beforeEach(() => resetSessionStoreForTests())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Session bootstrap gate', () => {
  it('does not render identity-dependent content until bootstrap succeeds', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { await gate; return new Response(JSON.stringify(bootstrapEnvelope()), { status: 200 }) })
    render(<SessionGate><h1>Workspace ready</h1></SessionGate>)
    expect(screen.getByRole('status', { name: '正在初始化 Creator Studio' })).toBeTruthy()
    expect(screen.queryByText('Workspace ready')).toBeNull()
    release()
    expect(await screen.findByText('Workspace ready')).toBeTruthy()
    expect(useSessionStore.getState().status).toBe('ready')
  })

  it('shows request diagnostics and retries a failed bootstrap', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '初始化失败。', retryable: false }, meta: { requestId: REQUEST_ID } }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(bootstrapEnvelope('light')), { status: 200 }))
    render(<SessionGate><h1>Workspace ready</h1></SessionGate>)
    expect(await screen.findByText('无法连接本地服务。')).toBeTruthy()
    expect(screen.getByText(`INTERNAL_ERROR · 请求 ${REQUEST_ID}`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试初始化' }))
    expect(await screen.findByText('Workspace ready')).toBeTruthy()
    expect(useSessionStore.getState().data?.creatorProfile.preferences.theme).toBe('light')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
