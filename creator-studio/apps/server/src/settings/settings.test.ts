import { connectionCheckResponseSchema, errorEnvelopeSchema, settingsResponseSchema } from '@creator-studio/contracts'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createApiApp } from '../http/app.js'
import { withTestDatabase } from '../db/test-database.js'
import { ConfigRepository, WorkspaceRepository } from '../repositories/index.js'
import { SecretStore } from './secret-store.js'
import { configureSettingsRoutes } from './settings-routes.js'
import { SettingsService } from './settings-service.js'

const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'
const REQUEST_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/
async function harness(run: (value: { app: ReturnType<typeof createApiApp>; dataDirectory: string }) => Promise<void>) {
  await withTestDatabase(async ({ db, dataDirectory }) => {
    await new WorkspaceRepository(db).createWithProfile({ workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 }, profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 } })
    const service = new SettingsService(new ConfigRepository(db), new SecretStore(dataDirectory), () => 1_700_000_000_000)
    const app = createApiApp({ configure(api) { api.use('*', async (context, next) => { context.set('workspaceId', WORKSPACE_ID); context.set('creatorProfileId', PROFILE_ID); await next() }); configureSettingsRoutes(api, service) } })
    await run({ app, dataDirectory })
  })
}
const patch = (app: ReturnType<typeof createApiApp>, path: string, body: unknown) => app.request(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('Provider and Connector settings boundary', () => {
  it('stores credentials in a 0600 server file and never returns their values', async () => {
    await harness(async ({ app, dataDirectory }) => {
      const providerSecret = 'sk-provider-super-secret'
      const larkSecret = 'lark-super-secret'
      expect((await patch(app, '/providers/seed', { displayName: 'Seed', enabled: true, model: 'seed-v1', credential: providerSecret })).status).toBe(200)
      expect((await patch(app, '/connectors/lark_cli', { enabled: true, command: 'seed-lark', args: ['--tenant', 'redacted'], credential: larkSecret })).status).toBe(200)
      const body = settingsResponseSchema.parse(await (await app.request('/settings')).json())
      expect(body.meta.requestId).toMatch(REQUEST_ID_PATTERN)
      expect(body.data.providers[0]).toMatchObject({ configured: true, config: { model: 'seed-v1' } })
      expect(body.data.connectors[0]).toMatchObject({ configured: true, availability: 'stub_only' })
      expect(JSON.stringify(body)).not.toContain(providerSecret)
      expect(JSON.stringify(body)).not.toContain(larkSecret)
      expect((await stat(join(dataDirectory, 'secrets.json'))).mode & 0o777).toBe(0o600)
      const checked = connectionCheckResponseSchema.parse(await (await app.request('/connectors/lark_cli/test', { method: 'POST' })).json())
      expect(checked.data).toMatchObject({ ok: true, mode: 'stub' })
    })
  })

  it('rejects missing Lark CLI and invalid Vault roots with actionable redacted errors', async () => {
    await harness(async ({ app, dataDirectory }) => {
      await patch(app, '/connectors/lark_cli', { enabled: true, command: 'creator-studio-command-that-does-not-exist', args: [] })
      const lark = await app.request('/connectors/lark_cli/test', { method: 'POST' })
      expect(lark.status).toBe(503)
      expect(errorEnvelopeSchema.parse(await lark.json()).error.message).toContain('未安装或命令不可执行')

      const relative = await patch(app, '/connectors/obsidian', { enabled: true, vaultRoot: '../escape' })
      expect(relative.status).toBe(403)
      const file = join(dataDirectory, 'not-a-vault.txt')
      await writeFile(file, 'x')
      const nonDirectory = await patch(app, '/connectors/obsidian', { enabled: true, vaultRoot: file })
      const error = errorEnvelopeSchema.parse(await nonDirectory.json())
      expect(nonDirectory.status).toBe(403)
      expect(JSON.stringify(error)).not.toContain(dataDirectory)

      const vault = join(dataDirectory, 'vault')
      await mkdir(vault)
      expect((await patch(app, '/connectors/obsidian', { enabled: true, vaultRoot: vault })).status).toBe(200)
      expect(connectionCheckResponseSchema.parse(await (await app.request('/connectors/obsidian/test', { method: 'POST' })).json()).data.ok).toBe(true)
    })
  })
})
