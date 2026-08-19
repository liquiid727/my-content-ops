import {
  artifactDetailResponseSchema,
  artifactVersionListResponseSchema,
  artifactVersionResponseSchema,
  canvasNodeResponseSchema,
  createNodeResponseSchema,
  edgeResponseSchema,
  errorEnvelopeSchema,
  graphResponseSchema,
  projectResponseSchema,
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
import { ArtifactRepository, ArtifactService } from '../artifacts/index.js'
import { CanvasRepository, CanvasService } from '../canvas/index.js'
import { configureArtifactRoutes } from '../artifacts/artifact-routes.js'
import { configureCanvasRoutes } from '../canvas/canvas-routes.js'
import { configureProjectRoutes } from '../projects/project-routes.js'
import { ProjectService } from '../projects/project-service.js'

const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'
const KEY_A = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

async function createHarness(run: (app: ReturnType<typeof createApiApp>, projectId: () => string) => Promise<void>) {
  await withTestDatabase(async ({ db }) => {
    await new WorkspaceRepository(db).createWithProfile({
      workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 },
      profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 },
    })
    let now = 1_700_000_000_000
    const projectRepository = new ProjectRepository(db)
    const artifactRepository = new ArtifactRepository(db)
    const artifactService = new ArtifactService(artifactRepository, projectRepository, () => now++)
    const canvasService = new CanvasService(new CanvasRepository(db), artifactRepository, artifactService, projectRepository, () => now++)
    const projectService = new ProjectService(projectRepository, new TaskRepository(db), new AssetRepository(db), new VersionRepository(db), () => now++)
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
      },
    })
    const created = await app.request('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': KEY_A },
      body: JSON.stringify({ title: 'Canvas project', contentType: 'short_video' }),
    })
    projectId = projectResponseSchema.parse(await created.json()).data.id
    await run(app, () => projectId)
  })
}

describe('Canvas & Artifact CRUD API', () => {
  it('creates nodes with new artifacts, returns graph, moves and deletes nodes with orphan semantics', async () => {
    await createHarness(async (app, projectId) => {
      const create = createNodeResponseSchema.parse(await (await app.request(`/projects/${projectId()}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'text', role: 'topic', x: 0, y: 0 }),
      })).json())
      expect(create.data.node.renderer).toBe('TextNode')
      expect(create.data.artifact).toMatchObject({ kind: 'text', role: 'topic' })
      const topicNodeId = create.data.node.id
      const topicArtifactId = create.data.artifact!.id

      const emptyGraph = graphResponseSchema.parse(await (await app.request(`/projects/${projectId()}/graph`)).json())
      expect(emptyGraph.data.nodes).toHaveLength(1)
      expect(emptyGraph.data.edges).toEqual([])

      const moved = canvasNodeResponseSchema.parse(await (await app.request(`/nodes/${topicNodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 120, y: -40, width: 320, collapsed: true }),
      })).json())
      expect(moved.data).toMatchObject({ x: 120, y: -40, width: 320, collapsed: true })

      const outline = createNodeResponseSchema.parse(await (await app.request(`/projects/${projectId()}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'text', role: 'outline', x: 400, y: 0 }),
      })).json())
      const outlineArtifactId = outline.data.artifact!.id

      const edge = edgeResponseSchema.parse(await (await app.request('/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceArtifactId: topicArtifactId, targetArtifactId: outlineArtifactId, inputSlot: 'outline' }),
      })).json())
      expect(edge.data.inputSlot).toBe('outline')

      const fullGraph = graphResponseSchema.parse(await (await app.request(`/projects/${projectId()}/graph`)).json())
      expect(fullGraph.data.nodes).toHaveLength(2)
      expect(fullGraph.data.edges).toHaveLength(1)

      // 删除 topic node → topic artifact 无引用 → orphan（deleted_at）
      const del = await app.request(`/nodes/${topicNodeId}`, { method: 'DELETE' })
      expect(del.status).toBe(204)
      const after = graphResponseSchema.parse(await (await app.request(`/projects/${projectId()}/graph`)).json())
      expect(after.data.nodes).toHaveLength(1)
      const orphaned = await app.request(`/artifacts/${topicArtifactId}`)
      expect(orphaned.status).toBe(404)

      // 显式删除 outline artifact → 软删
      const delArtifact = await app.request(`/artifacts/${outlineArtifactId}`, { method: 'DELETE' })
      expect(delArtifact.status).toBe(204)
      expect((await app.request(`/artifacts/${outlineArtifactId}`)).status).toBe(404)
    })
  })

  it('edits artifact content into a user version, lists versions, restores and conflicts on stale revision', async () => {
    await createHarness(async (app, projectId) => {
      const create = createNodeResponseSchema.parse(await (await app.request(`/projects/${projectId()}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'text', role: 'script', x: 0, y: 0 }),
      })).json())
      const artifactId = create.data.artifact!.id

      const edited = artifactDetailResponseSchema.parse(await (await app.request(`/artifacts/${artifactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 1, patch: { text: '第一版脚本' } }),
      })).json())
      expect(edited.data.currentVersion).toMatchObject({ versionNumber: 1, source: 'user' })
      expect(edited.data.currentVersion!.contentRef).toEqual({ type: 'inline', text: '第一版脚本' })
      expect(edited.data.revision).toBe(2)

      const stale = await app.request(`/artifacts/${artifactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 1, patch: { text: '过期的写入' } }),
      })
      expect(stale.status).toBe(409)
      expect(errorEnvelopeSchema.parse(await stale.json()).error.code).toBe('REVISION_CONFLICT')

      const edited2 = artifactDetailResponseSchema.parse(await (await app.request(`/artifacts/${artifactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 2, patch: { text: '第二版脚本' } }),
      })).json())
      expect(edited2.data.currentVersion!.versionNumber).toBe(2)

      const versions = artifactVersionListResponseSchema.parse(await (await app.request(`/artifacts/${artifactId}/versions`)).json())
      expect(versions.data).toHaveLength(2)
      expect(versions.data[0]!.versionNumber).toBe(2)

      const v1 = versions.data[1]!
      const detail = artifactVersionResponseSchema.parse(await (await app.request(`/artifact-versions/${v1.id}`)).json())
      expect(detail.data.contentRef).toEqual({ type: 'inline', text: '第一版脚本' })

      const restored = artifactVersionResponseSchema.parse(await (await app.request(`/artifacts/${artifactId}/versions/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: v1.id }),
      })).json())
      expect(restored.data).toMatchObject({ versionNumber: 3, source: 'system' })
      expect(restored.data.parentVersionId).toBe(v1.id)

      const afterRestore = artifactDetailResponseSchema.parse(await (await app.request(`/artifacts/${artifactId}`)).json())
      expect(afterRestore.data.currentVersion!.versionNumber).toBe(3)
      expect(afterRestore.data.currentVersion!.contentRef).toEqual({ type: 'inline', text: '第一版脚本' })
      expect(afterRestore.data.revision).toBe(4)
    })
  })

  it('enforces shared-project edges, cycle detection and not-found errors', async () => {
    await createHarness(async (app, projectId) => {
      const a = createNodeResponseSchema.parse(await (await app.request(`/projects/${projectId()}/nodes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'text', role: 'topic', x: 0, y: 0 }),
      })).json())
      const b = createNodeResponseSchema.parse(await (await app.request(`/projects/${projectId()}/nodes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'text', role: 'outline', x: 300, y: 0 }),
      })).json())
      const c = createNodeResponseSchema.parse(await (await app.request(`/projects/${projectId()}/nodes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'text', role: 'script', x: 600, y: 0 }),
      })).json())
      const aId = a.data.artifact!.id
      const bId = b.data.artifact!.id
      const cId = c.data.artifact!.id

      // 合法链 a→b→c
      expect((await app.request('/edges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceArtifactId: aId, targetArtifactId: bId, inputSlot: 'outline' }) })).status).toBe(201)
      expect((await app.request('/edges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceArtifactId: bId, targetArtifactId: cId, inputSlot: 'script' }) })).status).toBe(201)

      // 反向 c→a 会成环
      const cycle = await app.request('/edges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceArtifactId: cId, targetArtifactId: aId, inputSlot: 'topic' }) })
      expect(cycle.status).toBe(400)
      expect(errorEnvelopeSchema.parse(await cycle.json()).error.code).toBe('EDGE_CYCLE')

      // 不存在的 artifact 建边
      const missing = await app.request('/edges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceArtifactId: '01ARZ3NDEKTSV4RRFFQ69G5FAY', targetArtifactId: bId, inputSlot: 'outline' }) })
      expect(missing.status).toBe(404)

      // 删除边的 404
      expect((await app.request('/edges/01ARZ3NDEKTSV4RRFFQ69G5FAZ', { method: 'DELETE' })).status).toBe(404)
      expect((await app.request('/nodes/01ARZ3NDEKTSV4RRFFQ69G5FAZ', { method: 'DELETE' })).status).toBe(404)
    })
  })
})
