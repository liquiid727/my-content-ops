import { ulid } from 'ulid'
import { describe, expect, it, vi } from 'vitest'

import { withTestDatabase } from '../db/test-database.js'
import { ConfigRepository, WorkspaceRepository } from '../repositories/index.js'
import type { DatabaseClient } from '../repositories/types.js'
import { SecretStore } from '../settings/secret-store.js'
import type { HttpJsonClient } from './openai-text-provider.js'
import { OpenAITextProvider } from './openai-text-provider.js'
import { ProviderService } from './provider-service.js'

const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'

async function seedWorkspace(db: DatabaseClient): Promise<void> {
  await new WorkspaceRepository(db).createWithProfile({
    workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 },
    profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 },
  })
}

function mockHttp(status: number, body: unknown): HttpJsonClient {
  return {
    post: vi.fn(async () => ({ status, json: async () => body })),
  }
}

async function saveProvider(configs: ConfigRepository, options: { providerKey: string; model: string; baseUrl?: string; secretRef: string | null; enabled?: boolean }) {
  const now = 1_700_000_000_000
  return configs.saveProvider({
    id: ulid(now),
    workspaceId: WORKSPACE_ID,
    providerKey: options.providerKey,
    displayName: options.providerKey,
    configJson: JSON.stringify({ model: options.model, ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}) }),
    secretRef: options.secretRef,
    enabled: options.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  })
}

describe('ProviderService', () => {
  it('falls back to Seed when no text provider is configured', async () => {
    await withTestDatabase(async ({ db, dataDirectory }) => {
      const service = new ProviderService(new ConfigRepository(db), new SecretStore(dataDirectory), mockHttp(200, {}))
      const provider = await service.resolve(WORKSPACE_ID, 'text_generation')
      expect(provider).toBeDefined()
      expect(provider!.key).toBe('seed')
      const result = await provider!.generate({ prompt: 'hello' }, new AbortController().signal)
      expect(result.text).toContain('Seed result')
    })
  })

  it('returns undefined for media capabilities before real providers are wired', async () => {
    await withTestDatabase(async ({ db, dataDirectory }) => {
      const service = new ProviderService(new ConfigRepository(db), new SecretStore(dataDirectory), mockHttp(200, {}))
      expect(await service.resolve(WORKSPACE_ID, 'image_generation')).toBeUndefined()
      expect(await service.resolve(WORKSPACE_ID, 'audio_generation')).toBeUndefined()
      expect(await service.resolve(WORKSPACE_ID, 'video_generation')).toBeUndefined()
    })
  })

  it('resolves a real OpenAI-compatible provider from provider_configs + secret', async () => {
    await withTestDatabase(async ({ db, dataDirectory }) => {
      await seedWorkspace(db)
      const configs = new ConfigRepository(db)
      const secrets = new SecretStore(dataDirectory)
      await saveProvider(configs, { providerKey: 'openai', model: 'gpt-4o-mini', baseUrl: 'https://example.test/v1', secretRef: 'provider:ws:openai' })
      await secrets.set('provider:ws:openai', 'sk-test')

      const http = mockHttp(200, { model: 'gpt-4o-mini', choices: [{ message: { content: 'mocked text' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })
      const service = new ProviderService(configs, secrets, http)
      const provider = await service.resolve(WORKSPACE_ID, 'text_generation')
      expect(provider).toBeDefined()
      expect(provider!.key).toBe('openai')
      expect(provider).toBeInstanceOf(OpenAITextProvider)

      const result = await provider!.generate({ prompt: 'hello world' }, new AbortController().signal)
      expect(result.text).toBe('mocked text')
      expect(result.model).toBe('gpt-4o-mini')
      expect(result.usage).toEqual({ inputUnits: 10, outputUnits: 5 })

      const [url, init] = vi.mocked(http.post).mock.calls[0]!
      expect(url).toBe('https://example.test/v1/chat/completions')
      const parsed = JSON.parse(init.body as string) as { model: string; messages: Array<{ role: string; content: string }> }
      expect(parsed).toMatchObject({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hello world' }] })
    })
  })

  it('skips enabled-but-unconfigured configs and falls back to Seed', async () => {
    await withTestDatabase(async ({ db, dataDirectory }) => {
      await seedWorkspace(db)
      const configs = new ConfigRepository(db)
      await saveProvider(configs, { providerKey: 'openai', model: 'gpt-4o-mini', secretRef: null })
      const service = new ProviderService(configs, new SecretStore(dataDirectory), mockHttp(200, {}))
      const provider = await service.resolve(WORKSPACE_ID, 'text_generation')
      expect(provider!.key).toBe('seed')
    })
  })

  it('throws PROVIDER_HTTP_ERROR on non-2xx responses', async () => {
    await withTestDatabase(async ({ db, dataDirectory }) => {
      await seedWorkspace(db)
      const configs = new ConfigRepository(db)
      const secrets = new SecretStore(dataDirectory)
      await saveProvider(configs, { providerKey: 'openai', model: 'gpt-4o-mini', secretRef: 'r1' })
      await secrets.set('r1', 'sk-bad')
      const service = new ProviderService(configs, secrets, mockHttp(401, { error: { message: 'unauthorized' } }))
      const provider = await service.resolve(WORKSPACE_ID, 'text_generation')
      expect(provider).toBeDefined()
      await expect(provider!.generate({ prompt: 'x' }, new AbortController().signal)).rejects.toThrow('PROVIDER_HTTP_ERROR:status=401')
    })
  })
})
