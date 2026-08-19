import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useRunStore } from '../runtime/run-store'
import { executeOperation } from './run-operation'

const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAC'
const ARTIFACT_ID = '01ARZ3NDEKTSV4RRFFQ69G5F02'
const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  useRunStore.setState({ byId: {}, activeByProject: {}, runByArtifact: {} })
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('executeOperation', () => {
  it('creates a run and optimistically writes run.created to RunStore', async () => {
    const runId = '01ARZ3NDEKTSV4RRFFQ69G5F10'
    const taskId = '01ARZ3NDEKTSV4RRFFQ69G5F11'
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/operations/generate_outline/runs') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        expect(body.projectId).toBe(PROJECT_ID)
        expect(body.sourceArtifactId).toBe(ARTIFACT_ID)
        expect(body.idempotencyKey).toMatch(/^[0-9A-Z]{26}$/)
        return json({ data: { runId, taskId, status: 'queued' }, meta: { requestId: REQUEST_ID } }, 202)
      }
      throw new Error(`Unexpected fetch ${url}`)
    })

    const created = await executeOperation({ operationId: 'generate_outline', projectId: PROJECT_ID, sourceArtifactId: ARTIFACT_ID })

    expect(created).toBe(runId)
    const run = useRunStore.getState().byId[runId]!
    expect(run.status).toBe('queued')
    expect(run.sourceArtifactId).toBe(ARTIFACT_ID)
    expect(useRunStore.getState().runByArtifact[ARTIFACT_ID]).toBe(runId)
    expect(useRunStore.getState().activeByProject[PROJECT_ID]).toEqual([runId])
  })
})
