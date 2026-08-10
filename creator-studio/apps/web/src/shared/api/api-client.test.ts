// @vitest-environment jsdom

import { errorEnvelopeSchema } from '@creator-studio/contracts'
import { z } from 'zod'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, configureApiSession, resetApiClientForTests } from './api-client'

const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY'
const successSchema = z.object({ data: z.object({ ok: z.boolean() }), meta: z.object({ requestId: z.string() }) })

beforeEach(() => { resetApiClientForTests(); configureApiSession(async () => undefined) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('shared API client', () => {
  it('parses shared success and error schemas while preserving request diagnostics', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { ok: true }, meta: { requestId: REQUEST_ID } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(errorEnvelopeSchema.parse({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'Provider 不可用。', retryable: true }, meta: { requestId: REQUEST_ID } })), { status: 503 }))
    expect((await apiRequest('/ok', successSchema)).data.ok).toBe(true)
    await expect(apiRequest('/fail', successSchema)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', status: 503, retryable: true, requestId: REQUEST_ID })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('distinguishes timeout from caller cancellation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      if (init?.signal?.aborted) throw init.signal.reason
      return new Response(JSON.stringify({ data: { ok: true }, meta: { requestId: REQUEST_ID } }), { status: 200 })
    })
    await expect(apiRequest('/slow', successSchema, { timeoutMs: 5 })).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', retryable: true })
    const controller = new AbortController()
    const cancelled = apiRequest('/cancelled', successSchema, { signal: controller.signal })
    const cancelledExpectation = expect(cancelled).rejects.toMatchObject({ code: 'REQUEST_CANCELLED', retryable: false })
    controller.abort()
    await cancelledExpectation
  })

  it('rejects responses that violate their shared schema', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: { ok: 'yes' }, meta: { requestId: REQUEST_ID } }), { status: 200, headers: { 'X-Request-Id': REQUEST_ID } }))
    await expect(apiRequest('/invalid', successSchema)).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE', requestId: REQUEST_ID })
  })
})
