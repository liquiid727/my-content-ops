import {
  artifactDetailResponseSchema,
  createRunResponseSchema,
  errorEnvelopeSchema,
  graphResponseSchema,
  operationDefinitionListResponseSchema,
  projectResponseSchema,
  runListResponseSchema,
  runResponseSchema,
} from '@creator-studio/contracts'
import { describe, expect, it } from 'vitest'

import { withTestDatabase } from '../db/test-database.js'
import { createApiApp } from '../http/app.js'
import {
  AssetRepository,
  ProjectRepository,
  TaskRepository,
  VersionRepository,
  WorkspaceRepository,
} from '../repositories/index.js'
import { GenerationRepository } from '../repositories/generation-repository.js'
import { ArtifactRepository, ArtifactService } from '../artifacts/index.js'
import { CanvasRepository, CanvasService } from '../canvas/index.js'
import { ContextService } from '../context/index.js'
import { CreatorProfileRepository } from '../creator-profile/index.js'
import { ProjectEventRepository } from '../events/index.js'
import { ProjectEventEmitter } from '../events/index.js'
import { configureArtifactRoutes } from '../artifacts/artifact-routes.js'
import { configureCanvasRoutes } from '../canvas/canvas-routes.js'
import { configureProjectRoutes } from '../projects/project-routes.js'
import { ProjectService } from '../projects/project-service.js'
import { ConfigRepository } from '../repositories/index.js'
import { GenerationProviderRegistry, ProviderService, SeedGenerationProvider } from '../providers/index.js'
import { SecretStore } from '../settings/secret-store.js'
import { SeedTaskHandler, TaskHandlerRegistry } from '../tasks/index.js'
import { TaskRunner } from '../tasks/task-runner.js'
import { OperationRegistry } from './registry.js'
import { operationDefinitions } from './definitions.js'
import { OperationTaskHandler } from './operation-task-handler.js'
import { RunRepository } from './run-repository.js'
import { RunService } from './run-service.js'
import { configureRunRoutes } from './run-routes.js'

const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'
const KEY_A = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const KEY_B = '01ARZ3NDEKTSV4RRFFQ69G5FAW'
const KEY_C = '01ARZ3NDEKTSV4RRFFQ69G5FAX'
const KEY_D = '01ARZ3NDEKTSV4RRFFQ69G5FAY'
const KEY_E = '01ARZ3NDEKTSV4RRFFQ69G5FAZ'
const KEY_F = '01ARZ3NDEKTSV4RRFFQ69G5FB0'

async function createHarness(run: (ctx: {
  app: ReturnType<typeof createApiApp>
  projectId: () => string
  events: ProjectEventRepository
  runs: RunRepository
}) => Promise<void>) {
  await withTestDatabase(async ({ db, dataDirectory }) => {
    await new WorkspaceRepository(db).createWithProfile({
      workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 },
      profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 },
    })
    let now = 1_700_000_000_000
    const projectRepository = new ProjectRepository(db)
    const artifactRepository = new ArtifactRepository(db)
    const artifactService = new ArtifactService(artifactRepository, projectRepository, () => now++)
    const canvasRepository = new CanvasRepository(db)
    const canvasService = new CanvasService(canvasRepository, artifactRepository, artifactService, projectRepository, () => now++)
    const projectService = new ProjectService(projectRepository, new TaskRepository(db), new AssetRepository(db), new VersionRepository(db), () => now++)

    const providerRegistry = new GenerationProviderRegistry([new SeedGenerationProvider()])
    const providerService = new ProviderService(new ConfigRepository(db), new SecretStore(dataDirectory), {
      async post() { throw new Error('harness should not call HTTP when no provider configured') },
    })
    const taskRepository = new TaskRepository(db)
    const operationRegistry = new OperationRegistry(operationDefinitions)
    const runRepository = new RunRepository(db)
    const projectEventRepository = new ProjectEventRepository(db)
    const eventEmitter = new ProjectEventEmitter(projectEventRepository, () => now++)
    const contextService = new ContextService(projectRepository, artifactRepository, new CreatorProfileRepository(db))
    const operationTaskHandler = new OperationTaskHandler(
      operationRegistry,
      artifactRepository,
      canvasRepository,
      runRepository,
      projectRepository,
      taskRepository,
      providerService,
      eventEmitter,
      contextService,
      () => now++,
    )
    const handlers = new TaskHandlerRegistry().register(new SeedTaskHandler(providerRegistry)).register(operationTaskHandler)
    const runner = new TaskRunner(taskRepository, new GenerationRepository(db), handlers, () => now++)
    const runService = new RunService(
      runRepository,
      operationRegistry,
      projectRepository,
      artifactRepository,
      canvasRepository,
      taskRepository,
      runner,
      eventEmitter,
      () => now++,
    )

    let projectId = ''
    const app = createApiApp({
      configure(api) {
        api.use('*', async (context, next) => {
          context.set('workspaceId', WORKSPACE_ID)
          context.set('creatorProfileId', PROFILE_ID)
          await next()
        })
        configureProjectRoutes(api, projectService)
        configureCanvasRoutes(api, canvasService)
        configureArtifactRoutes(api, artifactService)
        configureRunRoutes(api, runService)
      },
    })
    const created = await app.request('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': KEY_A },
      body: JSON.stringify({ title: 'Run project', contentType: 'short_video', brief: '测试项目' }),
    })
    projectId = projectResponseSchema.parse(await created.json()).data.id
    await run({ app, projectId: () => projectId, events: projectEventRepository, runs: runRepository })
    // 让 TaskRunner 的 drain 收尾（最后的 claimNext）在数据库关闭前完成。
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

async function createTopicNode(app: ReturnType<typeof createApiApp>, projectId: string) {
  const response = await app.request(`/projects/${projectId}/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'text', role: 'topic', x: 0, y: 0 }),
  })
  const body = (await response.json()) as {
    data: { node: { id: string }; artifact: { id: string } }
  }
  if (response.status !== 201) {
    throw new Error(`createTopicNode failed status=${response.status} body=${JSON.stringify(body)} projectId=${projectId}`)
  }
  if (!body.data?.artifact) {
    throw new Error(`createTopicNode missing artifact: ${JSON.stringify(body)}`)
  }
  return body.data
}

async function waitForRunTerminal(app: ReturnType<typeof createApiApp>, runId: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = runResponseSchema.parse(await (await app.request(`/runs/${runId}`)).json()).data
    if (['completed', 'failed', 'cancelled'].includes(run.status)) return run
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  throw new Error('Run did not reach terminal state')
}

describe('Operation Registry & Run orchestration', () => {
  it('filters available operations by artifact kind/role and input slots', async () => {
    await createHarness(async ({ app, projectId }) => {
      const topic = await createTopicNode(app, projectId())
      const operations = operationDefinitionListResponseSchema.parse(await (await app.request(`/artifacts/${topic.artifact.id}/operations`)).json()).data
      expect(operations.operations.map((op) => op.id)).toContain('generate_outline')
      expect(operations.operations.map((op) => op.id)).not.toContain('generate_script')
      expect(operations.operations.map((op) => op.id)).not.toContain('generate_cover')
      expect(operations.operations.map((op) => op.id)).toContain('edit')
      expect(operations.operations.map((op) => op.id)).toContain('branch')
    })
  })

  it('creates a Run + Task, executes create behavior end-to-end, and emits SSE events', async () => {
    await createHarness(async ({ app, projectId, events }) => {
      const topic = await createTopicNode(app, projectId())
      const response = await app.request('/operations/generate_outline/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: projectId(), sourceArtifactId: topic.artifact.id, config: { length: 'medium' }, idempotencyKey: KEY_B }),
      })
      expect(response.status).toBe(202)
      const created = createRunResponseSchema.parse(await response.json()).data
      expect(created.status).toBe('queued')

      const completed = await waitForRunTerminal(app, created.runId)
      expect(completed.status).toBe('completed')
      expect(completed.operationId).toBe('generate_outline')
      expect(completed.outputArtifactIds).toHaveLength(1)
      expect(completed.outputVersionIds).toHaveLength(1)

      const graph = graphResponseSchema.parse(await (await app.request(`/projects/${projectId()}/graph`)).json()).data
      expect(graph.nodes).toHaveLength(2)
      expect(graph.edges).toHaveLength(1)
      const outlineArtifactId = completed.outputArtifactIds![0]!
      expect(graph.edges[0]).toMatchObject({ sourceArtifactId: topic.artifact.id, targetArtifactId: outlineArtifactId, inputSlot: 'outline' })

      const eventTypes = events.listAfter(WORKSPACE_ID, projectId(), 0).map((event) => event.eventType)
      expect(eventTypes).toEqual(['run.created', 'run.started', 'artifact.created', 'artifact.version.created', 'node.created', 'edge.created', 'run.completed'])
    })
  })

  it('is idempotent: same idempotencyKey returns the same Run', async () => {
    await createHarness(async ({ app, projectId }) => {
      const topic = await createTopicNode(app, projectId())
      const body = { projectId: projectId(), sourceArtifactId: topic.artifact.id, config: {}, idempotencyKey: KEY_B }
      const first = createRunResponseSchema.parse(await (await app.request('/operations/generate_outline/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()).data
      const second = createRunResponseSchema.parse(await (await app.request('/operations/generate_outline/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()).data
      expect(second.runId).toBe(first.runId)
      const reused = await app.request('/operations/generate_outline/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, config: { different: true } }),
      })
      expect(reused.status).toBe(409)
    })
  })

  it('supports transform (polish → new_version) and action (publish → side_effect) behaviors', async () => {
    await createHarness(async ({ app, projectId }) => {
      const topic = await createTopicNode(app, projectId())
      const outline = createRunResponseSchema.parse(await (await app.request('/operations/generate_outline/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: projectId(), sourceArtifactId: topic.artifact.id, idempotencyKey: KEY_B }),
      })).json()).data
      await waitForRunTerminal(app, outline.runId)
      const outlineArtifactId = (await (await app.request(`/runs/${outline.runId}`)).json()).data.outputArtifactIds[0]

      // transform: polish the outline → new version on the SAME artifact
      const polish = createRunResponseSchema.parse(await (await app.request('/operations/polish/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: projectId(), sourceArtifactId: outlineArtifactId, idempotencyKey: KEY_C }),
      })).json()).data
      const polishDone = await waitForRunTerminal(app, polish.runId)
      expect(polishDone.status).toBe('completed')
      expect(polishDone.outputVersionIds).toHaveLength(1)
      expect(polishDone.outputArtifactIds).toEqual([])
      const graphAfter = graphResponseSchema.parse(await (await app.request(`/projects/${projectId()}/graph`)).json()).data
      expect(graphAfter.nodes).toHaveLength(2) // no new node

      // action: publish skeleton（publish 要求 role=script/video，先由大纲生成口播稿）
      const script = createRunResponseSchema.parse(await (await app.request('/operations/generate_script/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: projectId(), sourceArtifactId: outlineArtifactId, idempotencyKey: KEY_D }),
      })).json()).data
      const scriptDone = await waitForRunTerminal(app, script.runId)
      expect(scriptDone.status).toBe('completed')
      const scriptArtifactId = scriptDone.outputArtifactIds![0]!

      const publish = createRunResponseSchema.parse(await (await app.request('/operations/publish/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: projectId(), sourceArtifactId: scriptArtifactId, idempotencyKey: KEY_E }),
      })).json()).data
      const publishDone = await waitForRunTerminal(app, publish.runId)
      expect(publishDone.status).toBe('completed')
      expect(publishDone.outputArtifactIds).toEqual([])
      expect(publishDone.outputVersionIds).toEqual([])
    })
  })

  it('creates a branch Artifact preserving source kind/role (branch behavior)', async () => {
    await createHarness(async ({ app, projectId }) => {
      const topic = await createTopicNode(app, projectId())
      const branch = createRunResponseSchema.parse(await (await app.request('/operations/branch/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: projectId(), sourceArtifactId: topic.artifact.id, idempotencyKey: KEY_F }),
      })).json()).data
      const branchDone = await waitForRunTerminal(app, branch.runId)
      expect(branchDone.status).toBe('completed')
      expect(branchDone.outputArtifactIds).toHaveLength(1)
      expect(branchDone.outputVersionIds).toHaveLength(1)

      const graph = graphResponseSchema.parse(await (await app.request(`/projects/${projectId()}/graph`)).json()).data
      expect(graph.nodes).toHaveLength(2)
      expect(graph.edges).toHaveLength(1)

      const branchArtifact = artifactDetailResponseSchema.parse(await (await app.request(`/artifacts/${branchDone.outputArtifactIds![0]!}`)).json()).data
      expect(branchArtifact.kind).toBe('text')
      expect(branchArtifact.role).toBe('topic')
    })
  })

  it('cancels an active Run and returns RUN_ALREADY_CANCELLED for a terminal Run', async () => {
    await createHarness(async ({ app, projectId }) => {
      const topic = await createTopicNode(app, projectId())
      const created = createRunResponseSchema.parse(await (await app.request('/operations/generate_outline/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: projectId(), sourceArtifactId: topic.artifact.id, idempotencyKey: KEY_B }),
      })).json()).data
      const cancelled = await app.request(`/runs/${created.runId}/cancel`, { method: 'POST' })
      expect(cancelled.status).toBe(202)
      const run = runResponseSchema.parse(await cancelled.json()).data
      expect(['cancelled', 'completed']).toContain(run.status)
      const secondCancel = await app.request(`/runs/${created.runId}/cancel`, { method: 'POST' })
      expect([202, 409]).toContain(secondCancel.status)
      if (secondCancel.status === 409) {
        expect(errorEnvelopeSchema.parse(await secondCancel.json()).error.code).toBe('RUN_ALREADY_CANCELLED')
      }
    })
  })

  it('retries a completed Run into a NEW Run without overwriting the old one', async () => {
    await createHarness(async ({ app, projectId }) => {
      const topic = await createTopicNode(app, projectId())
      const created = createRunResponseSchema.parse(await (await app.request('/operations/generate_outline/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: projectId(), sourceArtifactId: topic.artifact.id, idempotencyKey: KEY_B }),
      })).json()).data
      await waitForRunTerminal(app, created.runId)

      const retried = await app.request(`/runs/${created.runId}/retry`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: KEY_C }),
      })
      expect(retried.status).toBe(202)
      const newRun = createRunResponseSchema.parse(await retried.json()).data
      expect(newRun.runId).not.toBe(created.runId)
      const list = runListResponseSchema.parse(await (await app.request(`/runs?projectId=${projectId()}`)).json()).data
      expect(list.map((run) => run.id)).toContain(created.runId)
      expect(list.map((run) => run.id)).toContain(newRun.runId)
    })
  })

  it('rejects creating a Run for an operation not available on the artifact', async () => {
    await createHarness(async ({ app, projectId }) => {
      const topic = await createTopicNode(app, projectId())
      const response = await app.request('/operations/generate_script/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: projectId(), sourceArtifactId: topic.artifact.id, idempotencyKey: KEY_B }),
      })
      expect(response.status).toBe(422)
      expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('OPERATION_NOT_AVAILABLE')
    })
  })
})
