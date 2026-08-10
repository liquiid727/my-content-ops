import { errorEnvelopeSchema, taskListResponseSchema, taskResponseSchema } from '@creator-studio/contracts'
import { describe, expect, it } from 'vitest'
import { ulid } from 'ulid'
import { createApiApp } from '../http/app.js'
import { withTestDatabase } from '../db/test-database.js'
import { GenerationProviderRegistry, SeedGenerationProvider } from '../providers/index.js'
import { GenerationRepository, ProjectRepository, TaskRepository, WorkspaceRepository } from '../repositories/index.js'
import { SeedTaskHandler, TaskHandlerRegistry, type TaskHandler } from './task-handler.js'
import { configureTaskRoutes } from './task-routes.js'
import { TaskRunner } from './task-runner.js'
import { TaskService } from './task-service.js'
import { assertTaskTransition } from './task-state-machine.js'

const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'
const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAC'

async function setup(run: (value: { app: ReturnType<typeof createApiApp>; tasks: TaskRepository; generations: GenerationRepository; runner: TaskRunner }) => Promise<void>, extraHandlers: TaskHandler[] = []) {
  await withTestDatabase(async ({ db }) => {
    await new WorkspaceRepository(db).createWithProfile({ workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 }, profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 } })
    await new ProjectRepository(db).create({ id: PROJECT_ID, workspaceId: WORKSPACE_ID, title: 'Project', status: 'draft', createdBy: PROFILE_ID, createdAt: 1, updatedAt: 1 })
    const taskRepository = new TaskRepository(db)
    const generationRepository = new GenerationRepository(db)
    const handlers = new TaskHandlerRegistry().register(new SeedTaskHandler(new GenerationProviderRegistry([new SeedGenerationProvider()])))
    extraHandlers.forEach((handler) => handlers.register(handler))
    let now = 1_700_000_000_000
    const runner = new TaskRunner(taskRepository, generationRepository, handlers, () => now++)
    const service = new TaskService(taskRepository, new ProjectRepository(db), handlers, runner, () => now++)
    const app = createApiApp({ configure(api) { api.use('*', async (context, next) => { context.set('workspaceId', WORKSPACE_ID); context.set('creatorProfileId', PROFILE_ID); await next() }); configureTaskRoutes(api, service) } })
    await run({ app, tasks: taskRepository, generations: generationRepository, runner })
  })
}

async function waitForTerminal(app: ReturnType<typeof createApiApp>, id: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = taskResponseSchema.parse(await (await app.request(`/tasks/${id}`)).json()).data
    if (['completed', 'failed', 'cancelled'].includes(response.status)) return response
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  throw new Error('Task did not reach terminal state')
}

describe('persistent Task Runtime and Seed Provider', () => {
  it('persists queued -> running -> completed with events and a redacted Generation', async () => {
    await setup(async ({ app, tasks, generations }) => {
      const secret = 'sk-secret-must-not-persist'
      const create = await app.request('/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: PROJECT_ID, type: 'seed_generation', input: { prompt: secret } }) })
      const queued = taskResponseSchema.parse(await create.json()).data
      expect(create.status).toBe(202)
      expect(queued.status).toBe('queued')
      const completed = await waitForTerminal(app, queued.id)
      expect(completed).toMatchObject({ status: 'completed', progress: 100, resultRef: { type: 'generation' } })
      expect((await tasks.listEventsAfter(queued.id, 0)).map((event) => event.eventType)).toEqual(['created', 'started', 'completed'])
      const generation = await generations.getByTaskId(queued.id)
      expect(generation).toMatchObject({ providerKey: 'seed', model: 'seed-text-v1', status: 'completed' })
      expect(JSON.stringify(generation)).not.toContain(secret)

      const afterReload = taskResponseSchema.parse(await (await app.request(`/tasks/${queued.id}`)).json()).data
      expect(afterReload).toEqual(completed)
      const list = taskListResponseSchema.parse(await (await app.request(`/tasks?projectId=${PROJECT_ID}&type=seed_generation`)).json())
      expect(list.data.map((task) => task.id)).toEqual([queued.id])
    })
  })

  it('rejects unregistered types and records handler exceptions as stable failures', async () => {
    const failing: TaskHandler = { type: 'failing', recoverable: false, parse: (input) => input, execute: async () => { throw new Error('controlled failure') } }
    await setup(async ({ app }) => {
      const unsupported = await app.request('/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'missing', input: {} }) })
      expect(unsupported.status).toBe(422)
      expect(errorEnvelopeSchema.parse(await unsupported.json()).error.code).toBe('TASK_TYPE_UNSUPPORTED')
      const created = taskResponseSchema.parse(await (await app.request('/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'failing', input: {} }) })).json()).data
      const failed = await waitForTerminal(app, created.id)
      expect(failed).toMatchObject({ status: 'failed', error: { code: 'TASK_HANDLER_FAILED', message: 'Task handler execution failed.' } })
      expect(JSON.stringify(failed)).not.toContain('controlled failure')
    }, [failing])
  })

  it('paginates the Task ledger with a stable cursor and enforces the shared limit', async () => {
    await setup(async ({ app, tasks }) => {
      for (let index = 0; index < 4; index += 1) {
        const createdAt = 1_700_000_100_000 + index
        await tasks.enqueue({ id: ulid(createdAt), workspaceId: WORKSPACE_ID, type: 'seed_generation', inputJson: '{"prompt":"page"}', createdBy: PROFILE_ID, createdAt, event: { payloadJson: '{}', createdAt } })
      }

      const first = taskListResponseSchema.parse(await (await app.request('/tasks?limit=2')).json())
      expect(first.data).toHaveLength(2)
      expect(first.meta).toMatchObject({ hasMore: true })
      const second = taskListResponseSchema.parse(await (await app.request(`/tasks?limit=2&cursor=${encodeURIComponent(first.meta.nextCursor!)}`)).json())
      expect(second.data).toHaveLength(2)
      expect(new Set([...first.data, ...second.data].map((task) => task.id)).size).toBe(4)
      expect((await app.request('/tasks?limit=101')).status).toBe(400)
    })
  })

  it('cancels queued and running tasks and rejects cancellation of a terminal task', async () => {
    let release!: () => void
    const slow: TaskHandler = { type: 'slow', recoverable: true, parse: (input) => input, execute: async (_input, signal) => new Promise((resolve, reject) => { release = () => resolve({ providerKey: 'seed', model: 'slow', requestSnapshot: {}, responseSnapshot: {}, usage: {}, output: {} }); signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }) }) }
    await setup(async ({ app, tasks }) => {
      const queuedRecord = await tasks.enqueue({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAD', workspaceId: WORKSPACE_ID, type: 'seed_generation', inputJson: '{"prompt":"queued"}', createdBy: PROFILE_ID, createdAt: 2, event: { payloadJson: '{}', createdAt: 2 } })
      const queuedCancel = await app.request(`/tasks/${queuedRecord.id}/cancel`, { method: 'POST' })
      expect(taskResponseSchema.parse(await queuedCancel.json()).data.status).toBe('cancelled')

      const running = taskResponseSchema.parse(await (await app.request('/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'slow', input: {} }) })).json()).data
      for (let attempt = 0; attempt < 50; attempt += 1) { const snapshot = await tasks.getByWorkspaceAndId(WORKSPACE_ID, running.id); if (snapshot?.status === 'running') break; await new Promise((resolve) => setTimeout(resolve, 1)) }
      const runningCancel = await app.request(`/tasks/${running.id}/cancel`, { method: 'POST' })
      expect(taskResponseSchema.parse(await runningCancel.json()).data.status).toBe('cancelled')
      release?.()

      const completedCreate = taskResponseSchema.parse(await (await app.request('/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'seed_generation', input: { prompt: 'finish' } }) })).json()).data
      await waitForTerminal(app, completedCreate.id)
      const terminalCancel = await app.request(`/tasks/${completedCreate.id}/cancel`, { method: 'POST' })
      expect(terminalCancel.status).toBe(409)
      expect(errorEnvelopeSchema.parse(await terminalCancel.json()).error.code).toBe('TASK_ALREADY_FINISHED')
    }, [slow])
  })

  it('defines every legal transition and rejects terminal or backwards transitions', () => {
    for (const [from, to] of [['queued', 'running'], ['running', 'waiting_review'], ['waiting_review', 'completed'], ['queued', 'failed'], ['running', 'cancelled']] as const) expect(() => assertTaskTransition(from, to)).not.toThrow()
    for (const [from, to] of [['completed', 'running'], ['failed', 'queued'], ['cancelled', 'running'], ['running', 'queued']] as const) expect(() => assertTaskTransition(from, to)).toThrow('Invalid Task transition')
  })
})
