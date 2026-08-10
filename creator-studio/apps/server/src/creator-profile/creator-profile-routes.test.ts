import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  creatorProfileEntityResponseSchema,
  creatorProfileResponseSchema,
  errorEnvelopeSchema,
  importProfileResponseSchema,
  renderResponseSchema,
} from '@creator-studio/contracts'
import { afterEach, describe, expect, it } from 'vitest'

import { configurePreferenceRoutes } from '../bootstrap/preference-routes.js'
import { withTestDatabase } from '../db/test-database.js'
import { createApiApp } from '../http/app.js'
import { ConfigRepository, WorkspaceRepository } from '../repositories/index.js'
import { configureCreatorProfileRoutes } from './creator-profile-routes.js'
import { CreatorProfileRepository } from './creator-profile-repository.js'
import { CreatorProfileService } from './creator-profile-service.js'

const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

async function createHarness(run: (app: ReturnType<typeof createApiApp>) => Promise<void>, vaultRoot?: string) {
  await withTestDatabase(async ({ db }) => {
    await new WorkspaceRepository(db).createWithProfile({
      workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 },
      profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 },
    })
    const configs = new ConfigRepository(db)
    if (vaultRoot !== undefined) {
      await configs.saveConnector({
        workspaceId: WORKSPACE_ID,
        connectorKey: 'obsidian',
        displayName: 'Obsidian',
        configJson: JSON.stringify({ vaultRoot }),
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
      })
    }
    let now = 1_700_000_000_000
    const workspaces = new WorkspaceRepository(db)
    const service = new CreatorProfileService(new CreatorProfileRepository(db), configs, () => now++)
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

async function createVaultRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'creator-studio-vault-test-'))
  temporaryDirectories.push(root)
  return root
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

  it('POST /creator-profile/import imports a vault note into a section', async () => {
    const vaultRoot = await createVaultRoot()
    await mkdir(join(vaultRoot, '50_Channels', '阿篓的AI篓子'), { recursive: true })
    await writeFile(
      join(vaultRoot, '50_Channels', '阿篓的AI篓子', '00-账号定位.md'),
      '# 阿篓的AI篓子\n\n面向普通人的 AI 应用开发与工具测评。\n\n- AI Coding\n- AI 工具测评\n',
      'utf8',
    )
    await createHarness(async (app) => {
      const response = await app.request('/creator-profile/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultPath: '50_Channels/阿篓的AI篓子/00-账号定位.md', targetSection: 'positioning' }),
      })
      expect(response.status).toBe(200)
      const body = importProfileResponseSchema.parse(await response.json())
      expect(body.data.imported).toEqual(['positioning'])
      expect(body.data.profile.profile.positioning.summary).toBe('面向普通人的 AI 应用开发与工具测评。')
      expect(body.data.profile.profile.positioning.nicheTags).toEqual(['AI Coding', 'AI 工具测评'])
      expect(body.data.profile.revision).toBe(2)
    }, vaultRoot)
  })

  it('repeated import overwrites the same section idempotently', async () => {
    const vaultRoot = await createVaultRoot()
    await writeFile(join(vaultRoot, '定位.md'), '# 定位\n\n新定位一句话。\n- 标签A\n', 'utf8')
    await createHarness(async (app) => {
      const post = () =>
        app.request('/creator-profile/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vaultPath: '定位.md', targetSection: 'positioning' }),
        })
      expect((await post()).status).toBe(200)
      expect((await post()).status).toBe(200)
      const body = importProfileResponseSchema.parse(await (await post()).json())
      expect(body.data.imported).toEqual(['positioning'])
      expect(body.data.profile.profile.positioning.summary).toBe('新定位一句话。')
      expect(body.data.profile.profile.positioning.nicheTags).toEqual(['标签A'])
      expect(body.data.profile.revision).toBe(4)
    }, vaultRoot)
  })

  it('rejects a vault path escaping the root with 422 IMPORT_FAILED', async () => {
    const vaultRoot = await createVaultRoot()
    await createHarness(async (app) => {
      const response = await app.request('/creator-profile/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultPath: '../escape.md', targetSection: 'rules' }),
      })
      expect(response.status).toBe(422)
      expect(errorEnvelopeSchema.parse(await response.json()).error).toMatchObject({ code: 'IMPORT_FAILED' })
    }, vaultRoot)
  })

  it('rejects a missing vault note with 422 IMPORT_FAILED', async () => {
    const vaultRoot = await createVaultRoot()
    await createHarness(async (app) => {
      const response = await app.request('/creator-profile/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultPath: '不存在的笔记.md', targetSection: 'rules' }),
      })
      expect(response.status).toBe(422)
      expect(errorEnvelopeSchema.parse(await response.json()).error).toMatchObject({ code: 'IMPORT_FAILED' })
    }, vaultRoot)
  })

  it('returns 422 IMPORT_FAILED when no Obsidian vault is configured', async () => {
    await createHarness(async (app) => {
      const response = await app.request('/creator-profile/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultPath: 'note.md', targetSection: 'rules' }),
      })
      expect(response.status).toBe(422)
      expect(errorEnvelopeSchema.parse(await response.json()).error).toMatchObject({ code: 'IMPORT_FAILED' })
    })
  })
})
