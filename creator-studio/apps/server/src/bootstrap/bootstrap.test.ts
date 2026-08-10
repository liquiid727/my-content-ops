import { bootstrapResponseSchema } from '@creator-studio/contracts'
import { count } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createStaticApp } from '../app.js'
import { creatorProfiles, workspaces } from '../db/schema.js'
import { openDatabase } from '../db/database.js'
import { withTestDatabase } from '../db/test-database.js'
import type { RequestLogEntry } from '../http/logging.js'
import { createLocalSecurityContext, LOCAL_SESSION_COOKIE } from '../http/security.js'
import { ConfigRepository } from '../repositories/config-repository.js'
import { TaskRepository } from '../repositories/task-repository.js'
import { WorkspaceRepository } from '../repositories/workspace-repository.js'
import { BootstrapService } from './bootstrap-service.js'
import { ensureLocalIdentity } from './identity.js'

const TEST_PORT = 4310
const BASE_URL = `http://localhost:${TEST_PORT}`

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) throw new Error('Expected a session cookie')
  return setCookie.split(';', 1)[0]!
}

describe('local identity and bootstrap security boundary', () => {
  it('creates one Workspace/Profile across concurrent calls and a reopened database', async () => {
    await withTestDatabase(async (database) => {
      const identities = await Promise.all(Array.from({ length: 12 }, () => ensureLocalIdentity(new WorkspaceRepository(database.db))))
      expect(new Set(identities.map((identity) => identity.workspace.id)).size).toBe(1)
      expect(database.db.select({ count: count() }).from(workspaces).get()).toEqual({ count: 1 })
      expect(database.db.select({ count: count() }).from(creatorProfiles).get()).toEqual({ count: 1 })

      const originalId = identities[0]!.workspace.id
      database.close()
      const reopened = await openDatabase({ dataDirectory: database.dataDirectory })
      try {
        const identity = await ensureLocalIdentity(new WorkspaceRepository(reopened.db))
        expect(identity.workspace.id).toBe(originalId)
        expect(reopened.db.select({ count: count() }).from(workspaces).get()).toEqual({ count: 1 })
      } finally {
        reopened.close()
      }
    })
  })

  it('issues a strict HttpOnly session and returns a redacted bootstrap envelope', async () => {
    await withTestDatabase(async ({ db }) => {
      const identity = await ensureLocalIdentity(new WorkspaceRepository(db))
      const configs = new ConfigRepository(db)
      await configs.saveProvider({
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAN', workspaceId: identity.workspace.id, providerKey: 'openai', displayName: 'OpenAI',
        configJson: '{"apiKey":"must-not-leak","baseUrl":"/private/path"}', secretRef: 'secret://openai', enabled: true,
        createdAt: 1, updatedAt: 1,
      })
      const bootstrap = new BootstrapService(identity, new TaskRepository(db), configs)
      const app = createStaticApp({
        webRoot: '/tmp',
        healthCheck: async () => ({ database: 'ready', migrations: 'ready' }),
        loadBootstrap: () => bootstrap.load(),
        security: createLocalSecurityContext({ port: TEST_PORT, identity, sessionToken: 'test-session-token' }),
      })
      const response = await app.request(`${BASE_URL}/api/v1/bootstrap`)
      const body = bootstrapResponseSchema.parse(await response.json())
      const setCookie = response.headers.get('set-cookie') ?? ''

      expect(response.status).toBe(200)
      expect(setCookie).toContain(`${LOCAL_SESSION_COOKIE}=test-session-token`)
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('SameSite=Strict')
      expect(setCookie).toContain('Path=/')
      expect(JSON.stringify(body)).not.toContain('must-not-leak')
      expect(JSON.stringify(body)).not.toContain('/private/path')
      expect(JSON.stringify(body)).not.toContain('secret://openai')
      expect(body.data).toMatchObject({
        workspace: { id: identity.workspace.id },
        creatorProfile: { id: identity.creatorProfile.id, preferences: { theme: 'dark' } },
        capabilities: { providers: true, connectors: false },
        settings: { providers: [{ key: 'openai', configured: true, enabled: true }] },
      })
    })
  })

  it('rejects invalid Host, session, and write Origin while injecting server identity', async () => {
    await withTestDatabase(async ({ db }) => {
      const identity = await ensureLocalIdentity(new WorkspaceRepository(db))
      const bootstrap = new BootstrapService(identity, new TaskRepository(db), new ConfigRepository(db))
      const app = createStaticApp({
        webRoot: '/tmp',
        healthCheck: async () => ({ database: 'ready', migrations: 'ready' }),
        loadBootstrap: () => bootstrap.load(),
        security: createLocalSecurityContext({ port: TEST_PORT, identity, sessionToken: 'test-session-token' }),
        configure(api) {
          api.post('/context', async (context) => {
            await context.req.json()
            return context.json({
              workspaceId: context.get('workspaceId'),
              creatorProfileId: context.get('creatorProfileId'),
            })
          })
        },
      })

      const badHost = await app.request(`${BASE_URL}/api/v1/bootstrap`, { headers: { Host: 'evil.example' } })
      expect(badHost.status).toBe(403)
      const health = await app.request(`${BASE_URL}/api/v1/health`)
      expect(health.status).toBe(200)
      const bootstrapResponse = await app.request(`${BASE_URL}/api/v1/bootstrap`)
      const cookie = cookieFrom(bootstrapResponse)
      const staleSessionRecovery = await app.request(`${BASE_URL}/api/v1/bootstrap`, {
        headers: { Cookie: `${LOCAL_SESSION_COOKIE}=stale-session-token` },
      })
      expect(staleSessionRecovery.status).toBe(200)
      expect(staleSessionRecovery.headers.get('set-cookie')).toContain(`${LOCAL_SESSION_COOKIE}=test-session-token`)
      const missingSession = await app.request(`${BASE_URL}/api/v1/missing`)
      expect(missingSession.status).toBe(401)
      const badOrigin = await app.request(`${BASE_URL}/api/v1/context`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: 'https://evil.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: 'attacker-workspace' }),
      })
      expect(badOrigin.status).toBe(403)
      const accepted = await app.request(`${BASE_URL}/api/v1/context`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: BASE_URL, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: 'attacker-workspace' }),
      })

      expect(accepted.status).toBe(200)
      expect(await accepted.json()).toEqual({
        workspaceId: identity.workspace.id,
        creatorProfileId: identity.creatorProfile.id,
      })
    })
  })

  it('logs metadata without body or credentials and rejects JSON over 2 MB', async () => {
    await withTestDatabase(async ({ db }) => {
      const identity = await ensureLocalIdentity(new WorkspaceRepository(db))
      const bootstrap = new BootstrapService(identity, new TaskRepository(db), new ConfigRepository(db))
      const logs: RequestLogEntry[] = []
      const app = createStaticApp({
        webRoot: '/tmp',
        loadBootstrap: () => bootstrap.load(),
        requestLogger: (entry) => logs.push(entry),
        security: createLocalSecurityContext({ port: TEST_PORT, identity, sessionToken: 'test-session-token' }),
        configure(api) {
          api.post('/echo', async (context) => context.json(await context.req.json()))
        },
      })
      const bootstrapResponse = await app.request(`${BASE_URL}/api/v1/bootstrap`)
      const cookie = cookieFrom(bootstrapResponse)
      const secret = 'credential-that-must-never-be-logged'
      const accepted = await app.request(`${BASE_URL}/api/v1/echo`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: BASE_URL, 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      })
      const oversized = await app.request(`${BASE_URL}/api/v1/echo`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: BASE_URL, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'x'.repeat(2 * 1024 * 1024) }),
      })

      expect(accepted.status).toBe(200)
      expect(oversized.status).toBe(413)
      expect(logs).toHaveLength(3)
      expect(logs.map((entry) => entry.status)).toEqual([200, 200, 413])
      for (const entry of logs) {
        expect(entry.requestId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
        expect(entry.durationMs).toBeGreaterThanOrEqual(0)
      }
      const serializedLogs = JSON.stringify(logs)
      expect(serializedLogs).not.toContain(secret)
      expect(serializedLogs).not.toContain('/tmp/')
    })
  })
})
