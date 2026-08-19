import { bootstrapResponseSchema, creatorProfileResponseSchema } from '@creator-studio/contracts'
import { describe, expect, it } from 'vitest'
import { ConfigRepository, TaskRepository, WorkspaceRepository } from '../repositories/index.js'
import { createApiApp } from '../http/app.js'
import { withTestDatabase } from '../db/test-database.js'
import { BootstrapService } from './bootstrap-service.js'
import { ensureLocalIdentity } from './identity.js'
import { configurePreferenceRoutes } from './preference-routes.js'

describe('CreatorProfile preferences', () => {
  it('persists partial theme and locale updates without replacing the other preference', async () => {
    await withTestDatabase(async ({ db }) => {
      const workspaces = new WorkspaceRepository(db)
      const identity = await ensureLocalIdentity(workspaces)
      const bootstrap = new BootstrapService(identity, new TaskRepository(db), new ConfigRepository(db), workspaces)
      const app = createApiApp({
        loadBootstrap: () => bootstrap.load(),
        configure(api) {
          api.use('*', async (context, next) => { context.set('workspaceId', identity.workspace.id); context.set('creatorProfileId', identity.creatorProfile.id); await next() })
          configurePreferenceRoutes(api, workspaces, () => 42)
        },
      })
      const response = await app.request('/creator-profile/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: 'system' }) })
      expect(creatorProfileResponseSchema.parse(await response.json()).data.preferences).toMatchObject({ theme: 'system', locale: 'zh-CN' })
      const localeResponse = await app.request('/creator-profile/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'en-US' }) })
      expect(creatorProfileResponseSchema.parse(await localeResponse.json()).data.preferences).toMatchObject({ theme: 'system', locale: 'en-US' })
      const reloaded = bootstrapResponseSchema.parse(await (await app.request('/bootstrap')).json())
      expect(reloaded.data.creatorProfile.preferences).toMatchObject({ theme: 'system', locale: 'en-US' })
      expect((await workspaces.getProfile(identity.workspace.id))?.updatedAt).toBe(42)
      expect((await app.request('/creator-profile/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: 'neon' }) })).status).toBe(400)
      expect((await app.request('/creator-profile/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'fr-FR' }) })).status).toBe(400)
      expect((await app.request('/creator-profile/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })).status).toBe(400)
    })
  })
})
