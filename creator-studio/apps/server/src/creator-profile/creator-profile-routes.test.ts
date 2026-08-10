import {
  creatorProfileEntityResponseSchema,
  creatorProfileResponseSchema,
  errorEnvelopeSchema,
  renderResponseSchema,
} from '@creator-studio/contracts'
import { describe, expect, it } from 'vitest'

import { configurePreferenceRoutes } from '../bootstrap/preference-routes.js'
import { withTestDatabase } from '../db/test-database.js'
import { createApiApp } from '../http/app.js'
import { WorkspaceRepository } from '../repositories/index.js'
import { configureCreatorProfileRoutes } from './creator-profile-routes.js'
import { CreatorProfileRepository } from './creator-profile-repository.js'
import { CreatorProfileService } from './creator-profile-service.js'

const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'

async function createHarness(run: (app: ReturnType<typeof createApiApp>) => Promise<void>) {
  await withTestDatabase(async ({ db }) => {
    await new WorkspaceRepository(db).createWithProfile({
      workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 },
      profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 },
    })
    let now = 1_700_000_000_000
    const workspaces = new WorkspaceRepository(db)
    const service = new CreatorProfileService(new CreatorProfileRepository(db), () => now++)
    const app = createApiApp({
      configure(api) {
        api.use('*', async (context, next) => {
          context.set('workspaceId', WORKSPACE_ID)
          context.set('creatorProfileId', PROFILE_ID)
          await next()
        })
        configurePreferenceRoutes(api, workspaces, () => 42)
        configureCreatorProfileRoutes(api, service)
      },
    })
    await run(app)
  })
}

describe('Creator Profile API', () => {
  it('GET /creator-profile returns profile + injection + revision', async () => {
    await createHarness(async (app) => {
      const response = await app.request('/creator-profile')
      expect(response.status).toBe(200)
      const body = creatorProfileEntityResponseSchema.parse(await response.json())
      expect(body.data).toMatchObject({
        id: PROFILE_ID,
        workspaceId: WORKSPACE_ID,
        displayName: 'Creator',
        revision: 1,
      })
      expect(body.data.profile.identity.creatorName).toBe('')
      expect(body.data.profile.voice.tone.like).toEqual([])
      expect(body.data.injection.enabled).toBe(true)
      expect(body.data.injection.sections.identity).toBe(true)
    })
  })

  it('PATCH /creator-profile/:id updates fields and bumps revision', async () => {
    await createHarness(async (app) => {
      const response = await app.request(`/creator-profile/${PROFILE_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: 1,
          patch: {
            displayName: '阿篓的AI篓子',
            bio: 'AI 应用创作者',
            profile: {
              identity: { creatorName: '阿篓', nicknames: { 公众号: 'AI晚点' } },
              voice: { tone: { like: ['轻松'], avoid: ['营销感'] } },
            },
            injection: { enabled: true, sections: { voice: false } },
          },
        }),
      })
      expect(response.status).toBe(200)
      const body = creatorProfileEntityResponseSchema.parse(await response.json())
      expect(body.data).toMatchObject({ displayName: '阿篓的AI篓子', bio: 'AI 应用创作者', revision: 2 })
      expect(body.data.profile.identity.creatorName).toBe('阿篓')
      expect(body.data.profile.positioning.summary).toBe('')
      expect(body.data.injection.sections.voice).toBe(false)
      expect(body.data.injection.sections.identity).toBe(true)
    })
  })

  it('PATCH with a stale revision returns 409 REVISION_CONFLICT', async () => {
    await createHarness(async (app) => {
      await app.request(`/creator-profile/${PROFILE_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 1, patch: { displayName: 'First' } }),
      })
      const conflict = await app.request(`/creator-profile/${PROFILE_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 1, patch: { displayName: 'Stale' } }),
      })
      expect(conflict.status).toBe(409)
      const body = errorEnvelopeSchema.parse(await conflict.json())
      expect(body.error).toMatchObject({ code: 'REVISION_CONFLICT', details: { currentRevision: 2 } })
    })
  })

  it('PATCH with an unknown id returns 404 NOT_FOUND', async () => {
    await createHarness(async (app) => {
      const missing = await app.request('/creator-profile/01ARZ3NDEKTSV4RRFFQ69G5FAZ', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 1, patch: { displayName: 'Ghost' } }),
      })
      expect(missing.status).toBe(404)
      expect(errorEnvelopeSchema.parse(await missing.json()).error.code).toBe('NOT_FOUND')
    })
  })

  it('POST /creator-profile/render returns { text } for the current profile', async () => {
    await createHarness(async (app) => {
      await app.request(`/creator-profile/${PROFILE_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: 1,
          patch: { profile: { identity: { creatorName: '阿篓', nicknames: { 公众号: 'AI晚点' } } } },
        }),
      })
      const response = await app.request('/creator-profile/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'script' }),
      })
      expect(response.status).toBe(200)
      const body = renderResponseSchema.parse(await response.json())
      expect(body.data.text).toContain('阿篓')
      expect(body.data.text).toContain('创作场景：口播脚本撰写')
    })
  })

  it('GET /creator-profile/default returns the 阿篓 seed profile', async () => {
    await createHarness(async (app) => {
      const response = await app.request('/creator-profile/default')
      expect(response.status).toBe(200)
      const body = creatorProfileEntityResponseSchema.parse(await response.json())
      expect(body.data).toMatchObject({ displayName: '阿篓的AI篓子', revision: 1 })
      expect(body.data.profile.identity.creatorName).toBe('阿篓')
      expect(body.data.profile.positioning.nicheTags).toContain('AI Coding')
      expect(body.data.injection.sections.memory).toBe(false)
    })
  })

  it('keeps the existing preferences route working alongside the param route', async () => {
    await createHarness(async (app) => {
      const response = await app.request('/creator-profile/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: 'system' }),
      })
      expect(response.status).toBe(200)
      expect(creatorProfileResponseSchema.parse(await response.json()).data.preferences).toMatchObject({ theme: 'system' })
    })
  })
})
