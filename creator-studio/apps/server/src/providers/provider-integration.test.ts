import { createRunResponseSchema, graphResponseSchema, projectResponseSchema, runResponseSchema } from '@creator-studio/contracts'
import { ulid } from 'ulid'
import { describe, expect, it } from 'vitest'

import { ArtifactRepository, ArtifactService } from '../artifacts/index.js'
import { CanvasRepository, CanvasService } from '../canvas/index.js'
import { configureArtifactRoutes } from '../artifacts/artifact-routes.js'
import { configureCanvasRoutes } from '../canvas/canvas-routes.js'
import { configureProjectRoutes } from '../projects/project-routes.js'
import { ProjectService } from '../projects/project-service.js'
import { ContextService } from '../context/index.js'
import { CreatorProfileRepository } from '../creator-profile/index.js'
import { withTestDatabase } from '../db/test-database.js'
import { ProjectEventEmitter, ProjectEventRepository } from '../events/index.js'
import { createApiApp } from '../http/app.js'
import { OperationRegistry } from '../operations/registry.js'
import { operationDefinitions } from '../operations/definitions.js'
import { OperationTaskHandler } from '../operations/operation-task-handler.js'
import { RunRepository } from '../operations/run-repository.js'
import { RunService } from '../operations/run-service.js'
import { configureRunRoutes } from '../operations/run-routes.js'
import { GenerationProviderRegistry, ProviderService, SeedGenerationProvider } from './index.js'
import type { HttpJsonClient } from './openai-text-provider.js'
import { ConfigRepository, AssetRepository, GenerationRepository, ProjectRepository, TaskRepository, VersionRepository, WorkspaceRepository } from '../repositories/index.js'
import { SecretStore } from '../settings/secret-store.js'
import { SeedTaskHandler, TaskHandlerRegistry } from '../tasks/index.js'
import { TaskRunner } from '../tasks/task-runner.js'

const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'

describe('Provider integration', () => {
  it('runs generate_outline through a configured real provider and records generation with latency', async () => {
    await withTestDatabase(async ({ db, dataDirectory }) => {
      await new WorkspaceRepository(db).createWithProfile({
        workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 },
        profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 },
      })
      const configs = new ConfigRepository(db)
      const secrets = new SecretStore(dataDirectory)
      const now0 = 1_700_000_000_000
      await configs.saveProvider({
        id: ulid(now0), workspaceId: WORKSPACE_ID, providerKey: 'openai', displayName: 'OpenAI',
        configJson: JSON.stringify({ model: 'gpt-4o-mini' }), secretRef: 'provider:ws:openai', enabled: true, createdAt: now0, updatedAt: now0,
      })
      await secrets.set('provider:ws:openai', 'sk-test')
      const http: HttpJsonClient = {
        post: async () => ({
          status: 200,
          json: async () => ({ model: 'gpt-4o-mini', choices: [{ message: { content: '这是一个 mock 大纲。\n- 要点一\n- 要点二' } }], usage: { prompt_tokens: 20, completion_tokens: 9 } }),
        }),
      }

      let now = now0
      const projectRepository = new ProjectRepository(db)
      const artifactRepository = new ArtifactRepository(db)
      const artifactService = new ArtifactService(artifactRepository, projectRepository, () => now++)
      const canvasRepository = new CanvasRepository(db)
      const canvasService = new CanvasService(canvasRepository, artifactRepository, artifactService, projectRepository, () => now++)
      const projectService = new ProjectService(projectRepository, new TaskRepository(db), new AssetRepository(db), new VersionRepository(db), () => now++)

      const providerRegistry = new GenerationProviderRegistry([new SeedGenerationProvider()])
      const providerService = new ProviderService(configs, secrets, http)
      const taskRepository = new TaskRepository(db)
      const operationRegistry = new OperationRegistry(operationDefinitions)
      const runRepository = new RunRepository(db)
      const projectEventRepository = new ProjectEventRepository(db)
      const eventEmitter = new ProjectEventEmitter(projectEventRepository, () => now++)
      const generationRepository = new GenerationRepository(db)
      const contextService = new ContextService(projectRepository, artifactRepository, new CreatorProfileRepository(db))
      const operationTaskHandler = new OperationTaskHandler(
        operationRegistry, artifactRepository, canvasRepository, runRepository, projectRepository, taskRepository, providerService, eventEmitter, contextService, () => now++,
      )
      const handlers = new TaskHandlerRegistry().register(new SeedTaskHandler(providerRegistry)).register(operationTaskHandler)
      const runner = new TaskRunner(taskRepository, generationRepository, handlers, () => now++)
      const runService = new RunService(runRepository, operationRegistry, projectRepository, artifactRepository, canvasRepository, taskRepository, runner, eventEmitter, () => now++)

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
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
        body: JSON.stringify({ title: 'Provider project', contentType: 'short_video' }),
      })
      const projectId = projectResponseSchema.parse(await created.json()).data.id

      const node = await app.request(`/projects/${projectId}/nodes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'text', role: 'topic', x: 0, y: 0 }),
      })
      const topicArtifactId = (await node.json() as { data: { artifact: { id: string } } }).data.artifact.id

      const run = createRunResponseSchema.parse(await (await app.request('/operations/generate_outline/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sourceArtifactId: topicArtifactId, idempotencyKey: '01ARZ3NDEKTSV4RRFFQ69G5FAW' }),
      })).json()).data

      const done = await (async () => {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const current = runResponseSchema.parse(await (await app.request(`/runs/${run.runId}`)).json()).data
          if (['completed', 'failed', 'cancelled'].includes(current.status)) return current
          await new Promise((resolve) => setTimeout(resolve, 2))
        }
        throw new Error('Run did not reach terminal state')
      })()
      expect(done.status).toBe('completed')

      const generation = await generationRepository.getByTaskId(run.taskId)
      expect(generation).not.toBeNull()
      expect(generation!.providerKey).toBe('openai')
      expect(generation!.model).toBe('gpt-4o-mini')
      expect(generation!.status).toBe('completed')
      expect(typeof generation!.latencyMs).toBe('number')
      expect(generation!.latencyMs).toBeGreaterThanOrEqual(0)
      expect(JSON.parse(generation!.usageJson ?? '{}')).toEqual({ inputUnits: 20, outputUnits: 9 })

      const graph = graphResponseSchema.parse(await (await app.request(`/projects/${projectId}/graph`)).json()).data
      expect(graph.nodes).toHaveLength(2)
      expect(graph.edges).toHaveLength(1)
      const outlineId = done.outputArtifactIds![0]!
      const detail = await (await app.request(`/artifacts/${outlineId}`)).json() as { data: { currentVersion: { contentRef: { type: string; text: string } | null } | null } }
      expect(detail.data.currentVersion?.contentRef).toMatchObject({ type: 'inline', text: expect.stringContaining('mock 大纲') })
    })
  })
})
