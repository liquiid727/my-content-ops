import { describe, expect, it } from 'vitest'
import { createApiApp } from '../http/app.js'
import { withTestDatabase } from '../db/test-database.js'
import { GenerationProviderRegistry, SeedGenerationProvider } from '../providers/index.js'
import { ProjectRepository, TaskRepository, WorkspaceRepository } from '../repositories/index.js'
import { configureTaskEventRoutes } from './task-event-routes.js'
import { SeedTaskHandler, TaskHandlerRegistry } from './task-handler.js'
import { TaskRecovery } from './task-recovery.js'

const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'
const PROJECT_A = '01ARZ3NDEKTSV4RRFFQ69G5FAC'
const PROJECT_B = '01ARZ3NDEKTSV4RRFFQ69G5FAD'

async function fixture(run: (value: { tasks: TaskRepository; app: ReturnType<typeof createApiApp>; connections: number[] }) => Promise<void>, options: { heartbeatMs?: number; pollMs?: number } = {}) {
  await withTestDatabase(async ({ db }) => {
    const workspaces = new WorkspaceRepository(db)
    await workspaces.createWithProfile({ workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 }, profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 } })
    const projects = new ProjectRepository(db)
    await projects.create({ id: PROJECT_A, workspaceId: WORKSPACE_ID, title: 'A', status: 'draft', createdBy: PROFILE_ID, createdAt: 1, updatedAt: 1 })
    await projects.create({ id: PROJECT_B, workspaceId: WORKSPACE_ID, title: 'B', status: 'draft', createdBy: PROFILE_ID, createdAt: 1, updatedAt: 1 })
    const tasks = new TaskRepository(db)
    const connections: number[] = []
    const app = createApiApp({ configure(api) {
      api.use('*', async (context, next) => { context.set('workspaceId', WORKSPACE_ID); context.set('creatorProfileId', PROFILE_ID); await next() })
      configureTaskEventRoutes(api, tasks, { ...options, onConnectionChange: (count) => connections.push(count) })
    } })
    await run({ tasks, app, connections })
  })
}

async function readUntil(response: Response, expected: string): Promise<{ text: string; reader: ReadableStreamDefaultReader<Uint8Array> }> {
  if (!response.body) throw new Error('Expected SSE response body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  for (let index = 0; index < 30 && !text.includes(expected); index += 1) {
    const next = await reader.read()
    if (next.done) break
    text += decoder.decode(next.value)
  }
  return { text, reader }
}

async function enqueue(tasks: TaskRepository, id: string, projectId: string, createdAt: number) {
  return tasks.enqueue({ id, workspaceId: WORKSPACE_ID, projectId, type: 'seed_generation', inputJson: '{"prompt":"seed"}', createdBy: PROFILE_ID, createdAt, event: { payloadJson: '{}', createdAt } })
}

describe('Task SSE and startup recovery', () => {
  it('replays database event IDs after Last-Event-ID and applies the project filter', async () => {
    await fixture(async ({ tasks, app }) => {
      const other = await enqueue(tasks, '01ARZ3NDEKTSV4RRFFQ69G5FAE', PROJECT_B, 2)
      const wanted = await enqueue(tasks, '01ARZ3NDEKTSV4RRFFQ69G5FAF', PROJECT_A, 3)
      const cursor = (await tasks.listEventsAfter(other.id, 0))[0]!.id
      const wantedEvent = (await tasks.listEventsAfter(wanted.id, 0))[0]!
      const response = await app.request(`/task-events?projectId=${PROJECT_A}`, { headers: { 'Last-Event-ID': String(cursor) } })
      const result = await readUntil(response, `id: ${wantedEvent.id}`)
      expect(response.headers.get('content-type')).toContain('text/event-stream')
      expect(result.text).toContain(`id: ${wantedEvent.id}`)
      expect(result.text).toContain('event: task.created')
      expect(result.text).toContain(`"taskId":"${wanted.id}"`)
      expect(result.text).not.toContain(other.id)
      await result.reader.cancel()
    }, { pollMs: 1 })
  })

  it('uses the query cursor when the header is absent and rejects malformed cursors', async () => {
    await fixture(async ({ tasks, app }) => {
      const first = await enqueue(tasks, '01ARZ3NDEKTSV4RRFFQ69G5FAG', PROJECT_A, 2)
      const second = await enqueue(tasks, '01ARZ3NDEKTSV4RRFFQ69G5FAH', PROJECT_A, 3)
      const cursor = (await tasks.listEventsAfter(first.id, 0))[0]!.id
      const response = await app.request(`/task-events?lastEventId=${cursor}`)
      const result = await readUntil(response, second.id)
      expect(result.text).toContain(second.id)
      expect(result.text).not.toContain(first.id)
      await result.reader.cancel()
      expect((await app.request('/task-events?lastEventId=bad')).status).toBe(400)
    }, { pollMs: 1 })
  })

  it('emits stream.reset instead of replaying from an unavailable cursor', async () => {
    await fixture(async ({ tasks, app }) => {
      const existing = await enqueue(tasks, '01ARZ3NDEKTSV4RRFFQ69G5FAM', PROJECT_A, 2)
      const response = await app.request('/task-events', { headers: { 'Last-Event-ID': '9999' } })
      const result = await readUntil(response, 'event: stream.reset')
      expect(result.text).toContain('event: stream.reset')
      expect(result.text).toContain('cursor_unavailable')
      expect(result.text).not.toContain(existing.id)
      await result.reader.cancel()
    }, { pollMs: 1 })
  })

  it('sends heartbeat comments and releases connection state after cancellation', async () => {
    await fixture(async ({ app, connections }) => {
      const response = await app.request('/task-events')
      const result = await readUntil(response, ': heartbeat')
      expect(result.text).toContain(': heartbeat\n\n')
      await result.reader.cancel()
      for (let attempt = 0; attempt < 30 && connections.at(-1) !== 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 1))
      expect(connections).toContain(1)
      expect(connections.at(-1)).toBe(0)
    }, { heartbeatMs: 2, pollMs: 1 })
  })

  it('requeues recoverable handlers and terminally fails unsupported recovery on restart', async () => {
    await fixture(async ({ tasks }) => {
      const recoverable = await enqueue(tasks, '01ARZ3NDEKTSV4RRFFQ69G5FAJ', PROJECT_A, 2)
      const unsupported = await tasks.enqueue({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAK', workspaceId: WORKSPACE_ID, projectId: PROJECT_A, type: 'removed_handler', inputJson: '{}', createdBy: PROFILE_ID, createdAt: 3, event: { payloadJson: '{}', createdAt: 3 } })
      for (const [task, now] of [[recoverable, 4], [unsupported, 5]] as const) {
        await tasks.transition({ taskId: task.id, status: 'running', progress: 0, eventType: 'started', payloadJson: '{}', updatedAt: now, startedAt: now, expectedStatus: 'queued' })
      }
      const handlers = new TaskHandlerRegistry().register(new SeedTaskHandler(new GenerationProviderRegistry([new SeedGenerationProvider()])))
      const result = await new TaskRecovery(tasks, handlers, () => 10).recover(WORKSPACE_ID)
      expect(result).toEqual({ requeued: 1, failed: 1 })
      expect(await tasks.getByWorkspaceAndId(WORKSPACE_ID, recoverable.id)).toMatchObject({ status: 'queued', startedAt: null })
      expect(await tasks.getByWorkspaceAndId(WORKSPACE_ID, unsupported.id)).toMatchObject({ status: 'failed', errorCode: 'TASK_RECOVERY_UNSUPPORTED', finishedAt: 10 })
      expect((await tasks.listEventsAfter(recoverable.id, 0)).at(-1)?.eventType).toBe('progress')
      expect((await tasks.listEventsAfter(unsupported.id, 0)).at(-1)?.eventType).toBe('failed')
    })
  })

  it('removes TaskEvents older than the workspace retention cutoff', async () => {
    await fixture(async ({ tasks }) => {
      const oldTask = await enqueue(tasks, '01ARZ3NDEKTSV4RRFFQ69G5FAN', PROJECT_A, 2)
      const recentTask = await enqueue(tasks, '01ARZ3NDEKTSV4RRFFQ69G5FAP', PROJECT_A, 20)
      expect(await tasks.deleteWorkspaceEventsBefore(WORKSPACE_ID, 10)).toBe(1)
      expect(await tasks.listEventsAfter(oldTask.id, 0)).toEqual([])
      expect(await tasks.listEventsAfter(recentTask.id, 0)).toHaveLength(1)
    })
  })
})
