import type { ArtifactDetail } from '@creator-studio/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useArtifactStore } from './artifact-store'

const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAC'
const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY'

function detail(overrides: Partial<ArtifactDetail> = {}): ArtifactDetail {
  return {
    id: '01ARZ3NDEKTSV4RRFFQ69G5F01',
    projectId: PROJECT_ID,
    kind: 'text',
    role: 'topic',
    currentVersionId: '01ARZ3NDEKTSV4RRFFQ69G5F02',
    revision: 1,
    createdAt: '2026-08-10T09:00:00.000Z',
    updatedAt: '2026-08-10T09:00:00.000Z',
    currentVersion: {
      id: '01ARZ3NDEKTSV4RRFFQ69G5F02',
      artifactId: '01ARZ3NDEKTSV4RRFFQ69G5F01',
      versionNumber: 1,
      parentVersionId: null,
      contentRef: { type: 'inline', text: 'AI 落地选题' },
      metadata: {},
      source: 'ai',
      operationRunId: null,
      createdBy: '01ARZ3NDEKTSV4RRFFQ69G5F03',
      createdAt: '2026-08-10T09:00:00.000Z',
    },
    ...overrides,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockArtifact(d: ArtifactDetail) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith(`/artifacts/${d.id}`)) return json({ data: d, meta: { requestId: REQUEST_ID } })
    throw new Error(`Unexpected fetch ${url}`)
  })
}

beforeEach(() => {
  useArtifactStore.setState({ byId: {}, versions: {}, loading: {} })
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('artifact store', () => {
  it('fetches on miss and caches on hit', async () => {
    const d = detail()
    const fetchMock = mockArtifact(d)

    const first = await useArtifactStore.getState().getArtifact(d.id)
    expect(first).toStrictEqual(d)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const second = await useArtifactStore.getState().getArtifact(d.id)
    expect(second).toStrictEqual(d)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('invalidate drops the cached summary so next read refetches', async () => {
    const d = detail()
    const fetchMock = mockArtifact(d)

    await useArtifactStore.getState().getArtifact(d.id)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    useArtifactStore.getState().invalidate(d.id)
    await useArtifactStore.getState().getArtifact(d.id)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refreshArtifact replaces the cached detail', async () => {
    const v1 = detail({ role: 'topic' })
    const v2 = detail({ role: 'outline', currentVersionId: '01ARZ3NDEKTSV4RRFFQ69G5F04', currentVersion: { ...v1.currentVersion!, id: '01ARZ3NDEKTSV4RRFFQ69G5F04', versionNumber: 2, contentRef: { type: 'inline', text: '大纲' } } })
    let first = true
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith(`/artifacts/${v1.id}`)) return json({ data: first ? v1 : v2, meta: { requestId: REQUEST_ID } })
      throw new Error(`Unexpected fetch ${url}`)
    })

    await useArtifactStore.getState().getArtifact(v1.id)
    first = false
    const refreshed = await useArtifactStore.getState().refreshArtifact(v1.id)
    expect(refreshed.role).toBe('outline')
    expect(useArtifactStore.getState().byId[v1.id]!.role).toBe('outline')
  })

  it('tracks loading state during fetch', async () => {
    const d = detail()
    let resolveFetch: (value: Response) => void
    const pending = new Promise<Response>((resolve) => { resolveFetch = resolve })
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => pending)

    const promise = useArtifactStore.getState().refreshArtifact(d.id)
    expect(useArtifactStore.getState().loading[d.id]!).toBe(true)
    resolveFetch!(json({ data: d, meta: { requestId: REQUEST_ID } }))
    await promise
    expect(useArtifactStore.getState().loading[d.id]!).toBe(false)
  })
})
