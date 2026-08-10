// @vitest-environment jsdom

import type { Project, ProjectOverview } from '@creator-studio/contracts'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '../../app/App'
import { AppProviders } from '../../app/providers'
import { useToastStore } from '../../shared/ui'
import { resetProjectApiSessionForTests } from './project-api'
import { useProjectStore } from './project-store'

const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAC'
const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY'

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    title: 'AI Agent 入门',
    brief: '面向第一次使用 Agent 的创作者',
    status: 'draft',
    stage: 'idea',
    contentType: 'short_video',
    targetPlatform: null,
    targetDurationMs: null,
    graphId: null,
    contextId: null,
    personalStyleId: null,
    revision: 1,
    createdAt: '2026-08-09T09:00:00.000Z',
    updatedAt: '2026-08-09T09:00:00.000Z',
    ...overrides,
  }
}

function overview(value: Project): ProjectOverview {
  return {
    project: value,
    pipeline: [
      { stage: 'idea', status: 'completed', resultRef: null },
      { stage: 'script', status: 'not_started', resultRef: null },
    ],
    activeTasks: [],
    latestAssets: [],
    latestVersions: [],
    nextAction: { type: 'generate_topics', label: '生成选题方向' },
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function bootstrap() {
  return { data: { workspace: { id: WORKSPACE_ID, name: 'Studio' }, creatorProfile: { id: PROJECT_ID, displayName: 'Creator', preferences: { theme: 'dark', locale: 'zh-CN' } }, activeTasks: [], capabilities: { connectors: false, providers: false }, settings: { providers: [], connectors: [] } }, meta: { requestId: REQUEST_ID } }
}

function renderApp() {
  return render(<AppProviders><App /></AppProviders>)
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

beforeEach(() => {
  resetProjectApiSessionForTests()
  useProjectStore.setState({ projects: [], overviews: {}, nextCursor: undefined, hasMore: false, loading: false, error: undefined })
  useToastStore.setState({ messages: [] })
  window.history.replaceState({}, '', '/projects')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Project lifecycle UI', () => {
  it('creates once on repeated submission and navigates directly to Overview', async () => {
    const created = project()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/bootstrap')) return json(bootstrap())
      if (url.endsWith('/projects') && (init?.method ?? 'GET') === 'GET') {
        return json({ data: [], meta: { requestId: REQUEST_ID, hasMore: false } })
      }
      if (url.endsWith('/projects') && init?.method === 'POST') {
        return json({ data: created, meta: { requestId: REQUEST_ID } }, 201)
      }
      if (url.endsWith(`/${PROJECT_ID}/overview`)) {
        return json({ data: overview(created), meta: { requestId: REQUEST_ID } })
      }
      throw new Error(`Unexpected fetch ${url}`)
    })

    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: '新建项目' }))
    fireEvent.change(screen.getByLabelText('项目标题'), { target: { value: created.title } })
    fireEvent.click(screen.getByRole('combobox', { name: '内容类型' }))
    fireEvent.click(await screen.findByRole('option', { name: '短视频' }))
    const form = screen.getByRole('button', { name: '创建项目' }).closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(await screen.findByRole('heading', { name: created.title })).toBeTruthy()
    expect(window.location.pathname).toBe(`/projects/${PROJECT_ID}/overview`)
    expect(fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/projects') && init?.method === 'POST')).toHaveLength(1)
    expect(await screen.findByText('没有活动任务')).toBeTruthy()
    expect(screen.getByText('还没有素材')).toBeTruthy()
  })

  it('reloads the latest revision and gives a recoverable edit prompt after conflict', async () => {
    window.history.replaceState({}, '', `/projects/${PROJECT_ID}/overview`)
    const original = project()
    const latest = project({ title: '远端更新后的标题', revision: 2, updatedAt: '2026-08-09T09:01:00.000Z' })
    let overviewRequests = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/bootstrap')) return json(bootstrap())
      if (url.endsWith(`/${PROJECT_ID}/overview`)) {
        overviewRequests += 1
        const value = overviewRequests === 1 ? original : latest
        return json({ data: overview(value), meta: { requestId: REQUEST_ID } })
      }
      if (url.endsWith(`/${PROJECT_ID}`) && init?.method === 'PATCH') {
        return json({
          error: {
            code: 'PROJECT_REVISION_CONFLICT',
            message: '项目已在其他位置更新，请刷新后重试。',
            retryable: false,
            details: { currentRevision: 2 },
          },
          meta: { requestId: REQUEST_ID },
        }, 409)
      }
      throw new Error(`Unexpected fetch ${url}`)
    })

    renderApp()
    expect(await screen.findByRole('heading', { name: original.title })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('项目标题'), { target: { value: '我的过期修改' } })
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))

    expect(await screen.findByText('项目已在其他位置更新，最新版本已载入。请重新确认后保存。')).toBeTruthy()
    await waitFor(() => expect((screen.getByLabelText('项目标题') as HTMLInputElement).value).toBe(latest.title))
    expect(screen.getByText('版本 2')).toBeTruthy()
  })
})
