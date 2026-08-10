import { createMiddleware } from 'hono/factory'
import { ulid } from 'ulid'

import type { HttpBindings } from './types.js'

export const requestIdMiddleware = createMiddleware<HttpBindings>(async (context, next) => {
  const requestId = ulid()

  context.set('requestId', requestId)
  context.header('X-Request-Id', requestId)
  await next()
  context.header('X-Request-Id', requestId)
})
