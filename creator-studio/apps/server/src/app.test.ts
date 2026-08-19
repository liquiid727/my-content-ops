import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { errorEnvelopeSchema, healthResponseSchema, revisionedPatchSchema } from '@creator-studio/contracts'

import { createStaticApp } from './app.js'
import { createProjectRevisionConflictError, HttpError } from './http/errors.js'
import { parseIdempotencyKey, resolveIdempotency } from './http/idempotency.js'
import { parseWithSchema } from './http/validation.js'

describe('production static app', () => {
  let webRoot: string

  beforeEach(async () => {
    webRoot = await mkdtemp(join(tmpdir(), 'creator-studio-static-'))
    await mkdir(join(webRoot, 'assets'))
    await writeFile(join(webRoot, 'index.html'), '<!doctype html><h1>Creator Studio</h1>')
    await writeFile(join(webRoot, 'assets', 'app.js'), 'console.log("ready")')
  })

  afterEach(async () => {
    await rm(webRoot, { force: true, recursive: true })
  })

  it('serves built static assets', async () => {
    const response = await createStaticApp({ webRoot }).request('http://localhost/assets/app.js')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('console.log')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('falls back to index.html for a nested SPA route', async () => {
    const response = await createStaticApp({ webRoot }).request('http://localhost/projects/example/overview')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Creator Studio')
  })

  it('returns 404 instead of the SPA document for a missing static asset', async () => {
    const response = await createStaticApp({ webRoot }).request('http://localhost/assets/missing.js')

    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('Creator Studio')
  })

  it('does not turn an unknown API path into an HTML response', async () => {
    const response = await createStaticApp({ webRoot }).request('http://localhost/api/v1/missing')
    const body = errorEnvelopeSchema.parse(await response.json())

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(body.error.code).toBe('NOT_FOUND')
    expect(response.headers.get('X-Request-Id')).toBe(body.meta.requestId)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('reports ready and unhealthy health snapshots with the shared schema', async () => {
    const readyResponse = await createStaticApp({
      webRoot,
      healthCheck: async () => ({ database: 'ready', migrations: 'ready' }),
    }).request('http://localhost/api/v1/health')
    const unhealthyResponse = await createStaticApp({
      webRoot,
      healthCheck: async () => ({ database: 'ready', migrations: 'unhealthy' }),
    }).request('http://localhost/api/v1/health')
    const readyBody = healthResponseSchema.parse(await readyResponse.json())
    const unhealthyBody = healthResponseSchema.parse(await unhealthyResponse.json())

    expect(readyResponse.status).toBe(200)
    expect(readyBody.data.status).toBe('ok')
    expect(unhealthyResponse.status).toBe(503)
    expect(unhealthyBody.data).toMatchObject({ status: 'unhealthy', database: 'ready', migrations: 'unhealthy' })
  })

  it('returns field-level validation details', async () => {
    const app = createStaticApp({
      webRoot,
      configure(api) {
        api.post('/validate', async (context) => {
          const input = parseWithSchema(z.object({ title: z.string().min(1) }).strict(), await context.req.json())
          return context.json(input)
        })
      },
    })
    const response = await app.request('http://localhost/api/v1/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    })
    const body = errorEnvelopeSchema.parse(await response.json())

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_FAILED')
    expect(body.error.details).toMatchObject({ issues: [{ path: ['title'] }] })
  })

  it('maps known errors and redacts unexpected server errors', async () => {
    const app = createStaticApp({
      webRoot,
      configure(api) {
        api.get('/known-error', () => {
          throw new HttpError({ status: 503, code: 'PROVIDER_UNAVAILABLE', message: 'Provider is unavailable', retryable: true })
        })
        api.get('/unexpected-error', () => {
          throw new Error('secret-token-and-local-path')
        })
      },
    })
    const knownResponse = await app.request('http://localhost/api/v1/known-error')
    const unexpectedResponse = await app.request('http://localhost/api/v1/unexpected-error')
    const knownBody = errorEnvelopeSchema.parse(await knownResponse.json())
    const unexpectedBody = errorEnvelopeSchema.parse(await unexpectedResponse.json())

    expect(knownResponse.status).toBe(503)
    expect(knownBody.error).toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: true })
    expect(unexpectedResponse.status).toBe(500)
    expect(unexpectedBody.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(unexpectedBody)).not.toContain('secret-token-and-local-path')
  })

  it('maps a stale project revision to the domain conflict envelope', async () => {
    const currentRevision = 8
    const updateSchema = revisionedPatchSchema(z.object({ title: z.string().min(1) }).strict())
    const app = createStaticApp({
      webRoot,
      configure(api) {
        api.patch('/projects/:projectId', async (context) => {
          const input = parseWithSchema(updateSchema, await context.req.json())

          if (input.revision !== currentRevision) {
            throw createProjectRevisionConflictError(currentRevision)
          }

          return context.json({ revision: currentRevision + 1 })
        })
      },
    })
    const response = await app.request('http://localhost/api/v1/projects/project-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: 7, patch: { title: 'Updated elsewhere' } }),
    })
    const body = errorEnvelopeSchema.parse(await response.json())

    expect(response.status).toBe(409)
    expect(body.error).toMatchObject({
      code: 'PROJECT_REVISION_CONFLICT',
      retryable: false,
      details: { currentRevision },
    })
  })

  it('parses idempotency keys and resolves replay or conflicting reuse', () => {
    const key = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
    const stored = {
      requestHash: 'same-request',
      responseStatus: 201,
      responseBody: { projectId: 'project-1' },
    }

    expect(parseIdempotencyKey(key, true)).toBe(key)
    expect(resolveIdempotency(stored, 'same-request')).toEqual({
      kind: 'replay',
      responseStatus: 201,
      responseBody: { projectId: 'project-1' },
    })
    expect(resolveIdempotency(null, 'new-request')).toEqual({ kind: 'proceed' })

    try {
      resolveIdempotency(stored, 'different-request')
      throw new Error('Expected idempotency conflict')
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError)
      expect(error).toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' })
    }
  })

  it('applies idempotency protocol handling to a write route', async () => {
    const stored = {
      requestHash: 'same-request',
      responseStatus: 201,
      responseBody: { projectId: 'project-1' },
    }
    const app = createStaticApp({
      webRoot,
      configure(api) {
        api.post('/idempotent-write', async (context) => {
          parseIdempotencyKey(context.req.header('Idempotency-Key'), true)
          const input = parseWithSchema(z.object({ requestHash: z.string() }).strict(), await context.req.json())
          const resolution = resolveIdempotency(stored, input.requestHash)

          if (resolution.kind === 'replay') {
            return context.json(resolution.responseBody, 201)
          }

          return context.json({ projectId: 'new-project' }, 201)
        })
      },
    })
    const request = (requestHash: string, key?: string) =>
      app.request('http://localhost/api/v1/idempotent-write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key === undefined ? {} : { 'Idempotency-Key': key }),
        },
        body: JSON.stringify({ requestHash }),
      })
    const key = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
    const replayResponse = await request('same-request', key)
    const conflictResponse = await request('different-request', key)
    const missingKeyResponse = await request('same-request')
    const conflictBody = errorEnvelopeSchema.parse(await conflictResponse.json())
    const missingKeyBody = errorEnvelopeSchema.parse(await missingKeyResponse.json())

    expect(replayResponse.status).toBe(201)
    expect(await replayResponse.json()).toEqual({ projectId: 'project-1' })
    expect(conflictResponse.status).toBe(409)
    expect(conflictBody.error.code).toBe('IDEMPOTENCY_KEY_REUSED')
    expect(missingKeyResponse.status).toBe(400)
    expect(missingKeyBody.error.code).toBe('VALIDATION_FAILED')
  })
})
