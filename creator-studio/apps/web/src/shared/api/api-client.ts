import { errorEnvelopeSchema } from '@creator-studio/contracts'
import type { ZodType } from 'zod'

export class ApiClientError extends Error {
  readonly details: unknown | undefined
  readonly requestId: string | undefined

  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly retryable: boolean,
    options: { details?: unknown; requestId?: string | undefined } = {},
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.details = options.details
    this.requestId = options.requestId
  }
}

interface ApiRequestOptions extends Omit<RequestInit, 'signal'> {
  signal?: AbortSignal
  timeoutMs?: number
  session?: boolean
}

let initializeSession: () => Promise<void> = async () => undefined

export function configureApiSession(initializer: () => Promise<void>): void {
  initializeSession = initializer
}

function requestController(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort(signal?.reason)
  if (signal?.aborted) abortFromCaller()
  else signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort(new DOMException('Request timed out', 'TimeoutError')) }, timeoutMs)
  return {
    controller,
    timedOut: () => timedOut,
    cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', abortFromCaller) },
  }
}

async function responseError(response: Response): Promise<ApiClientError> {
  const body = await response.json().catch(() => undefined)
  const parsed = errorEnvelopeSchema.safeParse(body)
  if (parsed.success) return new ApiClientError(parsed.data.error.message, parsed.data.error.code, response.status, parsed.data.error.retryable, { details: parsed.data.error.details, requestId: parsed.data.meta.requestId })
  return new ApiClientError('服务返回了无法识别的错误。', 'UNEXPECTED_RESPONSE', response.status, false, { requestId: response.headers.get('X-Request-Id') ?? undefined })
}

export async function apiRequest<T>(path: string, schema: ZodType<T>, options: ApiRequestOptions = {}): Promise<T> {
  const { timeoutMs = 15_000, session = true, signal, ...init } = options
  if (session) await initializeSession()
  const request = requestController(signal, timeoutMs)
  try {
    const response = await fetch(`/api/v1${path}`, { credentials: 'same-origin', ...init, signal: request.controller.signal })
    if (!response.ok) throw await responseError(response)
    const body = await response.json().catch(() => undefined)
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new ApiClientError('服务响应不符合共享契约。', 'UNEXPECTED_RESPONSE', response.status, false, { requestId: response.headers.get('X-Request-Id') ?? undefined, details: parsed.error.issues })
    return parsed.data
  } catch (error) {
    if (error instanceof ApiClientError) throw error
    if (request.timedOut()) throw new ApiClientError('请求超时，请重试。', 'REQUEST_TIMEOUT', 0, true)
    if (signal?.aborted) throw new ApiClientError('请求已取消。', 'REQUEST_CANCELLED', 0, false)
    throw new ApiClientError('无法连接本地服务。', 'NETWORK_UNAVAILABLE', 0, true)
  } finally {
    request.cleanup()
  }
}

export function resetApiClientForTests(): void {
  initializeSession = async () => undefined
}
