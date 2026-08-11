import type { Run } from '@creator-studio/contracts'
import { beforeEach, describe, expect, it } from 'vitest'

import { useRunStore } from './run-store'

const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAC'

function run(overrides: Partial<Run> = {}): Run {
  return {
    id: '01ARZ3NDEKTSV4RRFFQ69G5F01',
    projectId: PROJECT_ID,
    taskId: '01ARZ3NDEKTSV4RRFFQ69G5F02',
    operationId: 'generate_outline',
    sourceArtifactId: null,
    inputVersionIds: [],
    outputVersionIds: null,
    outputArtifactIds: null,
    status: 'queued',
    progress: 0,
    config: {},
    error: null,
    createdAt: '2026-08-10T09:00:00.000Z',
    updatedAt: '2026-08-10T09:00:00.000Z',
    ...overrides,
  }
}

function event(type: string, data: Record<string, unknown>) {
  useRunStore.getState().applyRunEvent(type as 'run.created', { projectId: PROJECT_ID, occurredAt: '2026-08-10T09:01:00.000Z', ...data })
}

beforeEach(() => {
  useRunStore.setState({ byId: {}, activeByProject: {}, runByArtifact: {} })
})

describe('run store', () => {
  it('hydrates runs and tracks active ids', () => {
    const done = run({ id: '01ARZ3NDEKTSV4RRFFQ69G5F10', status: 'completed', progress: 100 })
    const active = run({ id: '01ARZ3NDEKTSV4RRFFQ69G5F11', status: 'running', progress: 30 })

    useRunStore.getState().hydrateRuns(PROJECT_ID, [done, active])

    const state = useRunStore.getState()
    expect(state.byId[done.id]!.status).toBe('completed')
    expect(state.byId[active.id]!.status).toBe('running')
    expect(state.activeByProject[PROJECT_ID]).toEqual([active.id])
  })

  it('tracks run lifecycle from created to completed via SSE', () => {
    const runId = '01ARZ3NDEKTSV4RRFFQ69G5F20'
    event('run.created', { runId, operationId: 'generate_outline', taskId: '01ARZ3NDEKTSV4RRFFQ69G5F21' })
    expect(useRunStore.getState().byId[runId]!.status).toBe('queued')
    expect(useRunStore.getState().activeByProject[PROJECT_ID]).toEqual([runId])

    event('run.started', { runId, operationId: 'generate_outline' })
    expect(useRunStore.getState().byId[runId]!.status).toBe('running')

    event('run.progress', { runId, progress: 42 })
    expect(useRunStore.getState().byId[runId]!.progress).toBe(42)

    event('run.completed', { runId, operationId: 'generate_outline', output: '大纲文本', outputArtifactIds: ['01ARZ3NDEKTSV4RRFFQ69G5F22'], outputVersionIds: ['01ARZ3NDEKTSV4RRFFQ69G5F23'] })
    const done = useRunStore.getState().byId[runId]!
    expect(done.status).toBe('completed')
    expect(done.progress).toBe(100)
    expect(done.output).toBe('大纲文本')
    expect(done.outputArtifactIds).toEqual(['01ARZ3NDEKTSV4RRFFQ69G5F22'])
    expect(useRunStore.getState().activeByProject[PROJECT_ID]).toEqual([])
  })

  it('captures failure error and removes from active list', () => {
    const runId = '01ARZ3NDEKTSV4RRFFQ69G5F30'
    event('run.started', { runId, operationId: 'generate_script' })
    event('run.failed', { runId, operationId: 'generate_script', error: { code: 'LLM_RATE_LIMIT', message: '请求过于频繁。' } })

    const failed = useRunStore.getState().byId[runId]!
    expect(failed.status).toBe('failed')
    expect(failed.error).toEqual({ code: 'LLM_RATE_LIMIT', message: '请求过于频繁。' })
    expect(useRunStore.getState().activeByProject[PROJECT_ID]).toEqual([])
  })

  it('drops unknown runs and handles cancel', () => {
    const runId = '01ARZ3NDEKTSV4RRFFQ69G5F40'
    event('run.cancelled', { runId, operationId: 'publish', taskId: '01ARZ3NDEKTSV4RRFFQ69G5F41' })
    expect(useRunStore.getState().byId[runId]!.status).toBe('cancelled')
  })

  it('clears project active state on project switch', () => {
    const runId = '01ARZ3NDEKTSV4RRFFQ69G5F50'
    event('run.created', { runId, operationId: 'generate_outline' })
    useRunStore.getState().clearProject(PROJECT_ID)
    expect(useRunStore.getState().activeByProject[PROJECT_ID]).toBeUndefined()
  })

  it('tracks the latest run per source artifact for the Inspector', () => {
    const artifactId = '01ARZ3NDEKTSV4RRFFQ69G5F60'
    const runA = run({ id: '01ARZ3NDEKTSV4RRFFQ69G5F61', sourceArtifactId: artifactId, status: 'completed', progress: 100 })
    const runB = run({ id: '01ARZ3NDEKTSV4RRFFQ69G5F62', sourceArtifactId: artifactId, status: 'running' })

    useRunStore.getState().hydrateRuns(PROJECT_ID, [runA, runB])

    expect(useRunStore.getState().runByArtifact[artifactId]).toBe(runB.id)

    const runC = run({ id: '01ARZ3NDEKTSV4RRFFQ69G5F63', sourceArtifactId: artifactId, status: 'queued' })
    useRunStore.getState().hydrateRuns(PROJECT_ID, [runC])
    expect(useRunStore.getState().runByArtifact[artifactId]).toBe(runC.id)
  })
})
