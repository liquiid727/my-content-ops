import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'

import type { HttpBindings } from './types.js'

export interface RequestLogEntry {
  requestId: string
  method: string
  path: string
  status: number
  durationMs: number
}

export type RequestLogger = (entry: RequestLogEntry) => void

export const consoleRequestLogger: RequestLogger = (entry) => {
  console.info(JSON.stringify(entry))
}

export function requestLoggingMiddleware(logger: RequestLogger) {
  return createMiddleware<HttpBindings>(async (context, next) => {
    const startedAt = performance.now()
    context.set('requestStartedAt', startedAt)
    context.set('requestLogger', logger)
    context.set('requestLogged', false)
    await next()
    if (context.get('requestLogged')) return
    context.set('requestLogged', true)
    logger({
      requestId: context.get('requestId'),
      method: context.req.method,
      path: new URL(context.req.url).pathname,
      status: context.res.status,
      durationMs: Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100),
    })
  })
}

export function logRequestError(context: Context<HttpBindings>, status: number) {
  const logger = context.get('requestLogger')
  const startedAt = context.get('requestStartedAt')
  if (!logger || startedAt === undefined || context.get('requestLogged')) return
  context.set('requestLogged', true)
  logger({
    requestId: context.get('requestId'),
    method: context.req.method,
    path: new URL(context.req.url).pathname,
    status,
    durationMs: Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100),
  })
}
