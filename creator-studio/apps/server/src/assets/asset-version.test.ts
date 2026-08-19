import { assetListResponseSchema, assetResponseSchema, errorEnvelopeSchema, versionListResponseSchema, versionResponseSchema } from '@creator-studio/contracts'
import { count, eq } from 'drizzle-orm'
import { access, mkdir, readdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createApiApp } from '../http/app.js'
import { assets, versions } from '../db/schema.js'
import { withTestDatabase } from '../db/test-database.js'
import { ProjectRepository, AssetRepository, VersionRepository, WorkspaceRepository } from '../repositories/index.js'
import { configureVersionRoutes } from '../versions/version-routes.js'
import { VersionService } from '../versions/version-service.js'
import { configureAssetRoutes } from './asset-routes.js'
import { AssetService } from './asset-service.js'
import { AssetFileStore } from './file-store.js'

const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'
const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAC'
const SUBJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAD'
const KEY = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))

async function harness(run: (context: { app: ReturnType<typeof createApiApp>; db: Parameters<Parameters<typeof withTestDatabase>[0]>[0]['db']; filesDirectory: string }) => Promise<void>) {
  await withTestDatabase(async ({ db, filesDirectory }) => {
    await new WorkspaceRepository(db).createWithProfile({ workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 }, profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 } })
    await new ProjectRepository(db).create({ id: PROJECT_ID, workspaceId: WORKSPACE_ID, title: 'Project', status: 'draft', createdBy: PROFILE_ID, createdAt: 1, updatedAt: 1 })
    let now = 1_700_000_000_000
    const assetService = new AssetService(new AssetRepository(db), new ProjectRepository(db), new AssetFileStore(filesDirectory), 1024, () => now++)
    const versionService = new VersionService(new VersionRepository(db), new ProjectRepository(db), () => now++)
    const app = createApiApp({ configure(api) { api.use('*', async (context, next) => { context.set('workspaceId', WORKSPACE_ID); context.set('creatorProfileId', PROFILE_ID); await next() }); configureAssetRoutes(api, assetService, 1024); configureVersionRoutes(api, versionService) } })
    await run({ app, db, filesDirectory })
  })
}

async function upload(app: ReturnType<typeof createApiApp>, name = 'pixel.png', mime = 'image/png', bytes = PNG, projectId = PROJECT_ID) {
  const form = new FormData()
  form.set('file', new File([bytes], name, { type: mime }))
  form.set('projectId', projectId)
  return app.request('/assets/upload', { method: 'POST', body: form })
}

describe('Asset file storage and Version foundation', () => {
  it('uploads, hashes, extracts metadata, lists by filters, and serves safe content ranges', async () => {
    await harness(async ({ app, db, filesDirectory }) => {
      const response = await upload(app)
      const body = assetResponseSchema.parse(await response.json())
      expect(response.status).toBe(201)
      expect(body.data).toMatchObject({ projectId: PROJECT_ID, type: 'image', mimeType: 'image/png', width: 1, height: 1, size: PNG.byteLength })
      expect(JSON.stringify(body)).not.toContain(filesDirectory)
      const record = db.select().from(assets).where(eq(assets.id, body.data.id)).get()!
      await expect(access(join(filesDirectory, record.storagePath))).resolves.toBeUndefined()

      const list = assetListResponseSchema.parse(await (await app.request(`/assets?projectId=${PROJECT_ID}&type=image`)).json())
      expect(list.data.map((asset) => asset.id)).toEqual([body.data.id])
      expect(assetListResponseSchema.parse(await (await app.request('/assets?type=audio')).json()).data).toEqual([])
      const content = await app.request(`/assets/${body.data.id}/content`, { headers: { Range: 'bytes=0-7' } })
      expect(content.status).toBe(206)
      expect(content.headers.get('content-type')).toContain('image/png')
      expect(content.headers.get('content-range')).toBe(`bytes 0-7/${PNG.byteLength}`)
      expect(new Uint8Array(await content.arrayBuffer())).toEqual(PNG.slice(0, 8))
    })
  })

  it('rejects unsafe names, oversized content, unsupported MIME, and signature mismatch without temp or DB orphans', async () => {
    await harness(async ({ app, db, filesDirectory }) => {
      expect((await upload(app, '../escape.png')).status).toBe(400)
      expect((await upload(app, '/tmp/escape.png')).status).toBe(400)
      const oversized = await upload(app, 'large.txt', 'text/plain', new Uint8Array(1025))
      expect(oversized.status).toBe(413)
      expect(errorEnvelopeSchema.parse(await oversized.json()).error.code).toBe('FILE_TOO_LARGE')
      const unsupported = await upload(app, 'code.bin', 'application/octet-stream', Uint8Array.of(1, 2, 3))
      expect(unsupported.status).toBe(415)
      const mismatch = await upload(app, 'fake.png', 'image/png', new TextEncoder().encode('not a png'))
      expect(mismatch.status).toBe(415)
      expect(db.select({ count: count() }).from(assets).get()).toEqual({ count: 0 })
      expect(await readdir(join(filesDirectory, '.tmp'))).toEqual([])
    })
  })

  it('rejects a symlinked storage directory without writing outside the file root', async () => {
    await harness(async ({ app, db, filesDirectory }) => {
      const outside = join(filesDirectory, '..', 'escape-target')
      await mkdir(outside)
      await symlink(outside, join(filesDirectory, 'assets'))
      const response = await upload(app)
      expect(response.status).toBe(500)
      expect(db.select({ count: count() }).from(assets).get()).toEqual({ count: 0 })
      expect(await readdir(outside)).toEqual([])
      expect(await readdir(join(filesDirectory, '.tmp'))).toEqual([])
    })
  })

  it('restores an old Version by appending a new current version and replays idempotently', async () => {
    await harness(async ({ app, db }) => {
      const repository = new VersionRepository(db)
      const first = await repository.createCurrent({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAE', workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, subjectType: 'script', subjectId: SUBJECT_ID, snapshotJson: '{"text":"v1"}', createdBy: PROFILE_ID, createdAt: 10 })
      await repository.createCurrent({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAF', workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, subjectType: 'script', subjectId: SUBJECT_ID, snapshotJson: '{"text":"v2"}', createdBy: PROFILE_ID, createdAt: 11 })
      const restore = () => app.request(`/versions/${first.id}/restore`, { method: 'POST', headers: { 'Idempotency-Key': KEY } })
      const restored = versionResponseSchema.parse(await (await restore()).json()).data
      const replay = versionResponseSchema.parse(await (await restore()).json()).data
      expect(replay.id).toBe(restored.id)
      expect(restored).toMatchObject({ versionNumber: 3, snapshot: { text: 'v1' }, isCurrent: true })
      const history = versionListResponseSchema.parse(await (await app.request(`/projects/${PROJECT_ID}/versions?subjectType=script`)).json()).data
      expect(history).toHaveLength(3)
      expect(db.select({ count: count() }).from(versions).where(eq(versions.isCurrent, true)).get()).toEqual({ count: 1 })
      expect(await repository.getByWorkspaceAndId(WORKSPACE_ID, first.id)).toMatchObject({ snapshotJson: '{"text":"v1"}' })
    })
  })

  it('does not delete physical content when a Version still references the Asset', async () => {
    await harness(async ({ app, db, filesDirectory }) => {
      const asset = assetResponseSchema.parse(await (await upload(app)).json()).data
      const record = db.select().from(assets).where(eq(assets.id, asset.id)).get()!
      await new VersionRepository(db).createCurrent({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAG', workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, subjectType: 'asset', subjectId: asset.id, snapshotJson: '{}', createdBy: PROFILE_ID, createdAt: 12 })
      const response = await app.request(`/assets/${asset.id}`, { method: 'DELETE' })
      expect(response.status).toBe(409)
      expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('ASSET_IN_USE')
      await expect(access(join(filesDirectory, record.storagePath))).resolves.toBeUndefined()
    })
  })
})
