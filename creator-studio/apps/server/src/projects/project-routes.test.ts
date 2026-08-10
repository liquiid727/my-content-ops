import {
  errorEnvelopeSchema,
  projectListResponseSchema,
  projectOverviewResponseSchema,
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
import { configureProjectRoutes } from './project-routes.js'
import { ProjectService } from './project-service.js'

const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'
const KEY_A = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const KEY_B = '01ARZ3NDEKTSV4RRFFQ69G5FAW'
const KEY_C = '01ARZ3NDEKTSV4RRFFQ69G5FAX'

async function createHarness(run: (app: ReturnType<typeof createApiApp>) => Promise<void>) {
  await withTestDatabase(async ({ db }) => {
    await new WorkspaceRepository(db).createWithProfile({
      workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 },
      profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 },
    })
    let now = 1_700_000_000_000
    const service = new ProjectService(
      new ProjectRepository(db),
      new TaskRepository(db),
      new AssetRepository(db),
      new VersionRepository(db),
      () => now++,
    )
    const app = createApiApp({
      configure(api) {
        api.use('*', async (context, next) => {
          context.set('workspaceId', WORKSPACE_ID)
          context.set('creatorProfileId', PROFILE_ID)
          await next()
        })
        configureProjectRoutes(api, service)
      },
    })
    await run(app)
  })
}

function postProject(app: ReturnType<typeof createApiApp>, key: string, title: string) {
  return app.request('/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ title, contentType: 'short_video', brief: `${title} brief` }),
  })
}

describe('Project lifecycle API', () => {
  it('validates shared fields and creates exactly one Project for duplicate submissions', async () => {
    await createHarness(async (app) => {
      const invalid = await app.request('/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': KEY_A },
        body: JSON.stringify({ title: '', contentType: '', targetDurationMs: 999 }),
      })
      expect(invalid.status).toBe(400)
      expect(errorEnvelopeSchema.parse(await invalid.json()).error.code).toBe('VALIDATION_FAILED')

      const created = await postProject(app, KEY_A, 'First project')
      const replayed = await postProject(app, KEY_A, 'First project')
      expect(created.status).toBe(201)
      expect(replayed.status).toBe(201)
      const createdBody = projectResponseSchema.parse(await created.json())
      const replayedBody = projectResponseSchema.parse(await replayed.json())
      expect(replayedBody.data.id).toBe(createdBody.data.id)

      const reused = await postProject(app, KEY_A, 'Different project')
      expect(reused.status).toBe(409)
      expect(errorEnvelopeSchema.parse(await reused.json()).error.code).toBe('IDEMPOTENCY_KEY_REUSED')
    })
  })

  it('lists by stable cursor and status, updates revisions, and archives without deletion', async () => {
    await createHarness(async (app) => {
      const first = projectResponseSchema.parse(await (await postProject(app, KEY_A, 'First')).json()).data
      const second = projectResponseSchema.parse(await (await postProject(app, KEY_B, 'Second')).json()).data
      const third = projectResponseSchema.parse(await (await postProject(app, KEY_C, 'Third')).json()).data

      const firstPage = projectListResponseSchema.parse(await (await app.request('/projects?limit=2')).json())
      expect(firstPage.data.map((project) => project.id)).toEqual([third.id, second.id])
      expect(firstPage.meta).toMatchObject({ hasMore: true })
      const secondPage = projectListResponseSchema.parse(await (await app.request(`/projects?limit=2&cursor=${encodeURIComponent(firstPage.meta.nextCursor!)}`)).json())
      expect(secondPage.data.map((project) => project.id)).toEqual([first.id])
      expect(secondPage.meta.hasMore).toBe(false)

      const updatedResponse = await app.request(`/projects/${second.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: second.revision, patch: { title: 'Second updated', status: 'active' } }),
      })
      const updated = projectResponseSchema.parse(await updatedResponse.json()).data
      expect(updated).toMatchObject({ title: 'Second updated', status: 'active', revision: 2 })

      const conflict = await app.request(`/projects/${second.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: second.revision, patch: { title: 'Stale overwrite' } }),
      })
      const conflictBody = errorEnvelopeSchema.parse(await conflict.json())
      expect(conflict.status).toBe(409)
      expect(conflictBody.error).toMatchObject({ code: 'PROJECT_REVISION_CONFLICT', details: { currentRevision: 2 } })

      const archivedResponse = await app.request(`/projects/${second.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: updated.revision }),
      })
      expect(projectResponseSchema.parse(await archivedResponse.json()).data).toMatchObject({ status: 'archived', revision: 3 })

      const defaultList = projectListResponseSchema.parse(await (await app.request('/projects')).json())
      expect(defaultList.data.map((project) => project.id)).not.toContain(second.id)
      const archivedList = projectListResponseSchema.parse(await (await app.request('/projects?status=archived')).json())
      expect(archivedList.data.map((project) => project.id)).toEqual([second.id])
      expect(projectResponseSchema.parse(await (await app.request(`/projects/${second.id}`)).json()).data.status).toBe('archived')
    })
  })

  it('returns computed Overview state with explicit Task and Asset empty states', async () => {
    await createHarness(async (app) => {
      const project = projectResponseSchema.parse(await (await postProject(app, KEY_A, 'Overview project')).json()).data
      const response = await app.request(`/projects/${project.id}/overview`)
      const overview = projectOverviewResponseSchema.parse(await response.json()).data

      expect(response.status).toBe(200)
      expect(overview.project).toMatchObject({ id: project.id, stage: 'idea' })
      expect(overview.pipeline).toEqual([
        { stage: 'idea', status: 'completed', resultRef: null },
        { stage: 'script', status: 'not_started', resultRef: null },
      ])
      expect(overview.activeTasks).toEqual([])
      expect(overview.latestAssets).toEqual([])
      expect(overview.latestVersions).toEqual([])
    })
  })

  it('keeps stage and progress derived instead of persisting writable columns', async () => {
    await withTestDatabase(async ({ sqlite }) => {
      const columns = sqlite.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>
      expect(columns.map((column) => column.name)).not.toContain('stage')
      expect(columns.map((column) => column.name)).not.toContain('progress')
    })
  })

  it('uses updatedAt and id together so equal timestamps do not skip cursor items', async () => {
    await withTestDatabase(async ({ db }) => {
      await new WorkspaceRepository(db).createWithProfile({
        workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 },
        profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 },
      })
      const repository = new ProjectRepository(db)
      const timestamp = 1_700_000_000_000
      const ids = ['01ARZ3NDEKTSV4RRFFQ69G5FAD', '01ARZ3NDEKTSV4RRFFQ69G5FAC']
      for (const [index, id] of ids.entries()) {
        await repository.create({
          id,
          workspaceId: WORKSPACE_ID,
          title: `Project ${index}`,
          status: 'draft',
          createdBy: PROFILE_ID,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      }

      const firstPage = await repository.list({ workspaceId: WORKSPACE_ID, limit: 1 })
      const secondPage = await repository.list({
        workspaceId: WORKSPACE_ID,
        limit: 1,
        cursor: { updatedAt: firstPage.items[0]!.updatedAt, id: firstPage.items[0]!.id },
      })
      expect([...firstPage.items, ...secondPage.items].map((project) => project.id)).toEqual(ids)
    })
  })
})
