import {
  bootstrapResponseSchema,
  type BootstrapData,
  healthResponseSchema,
  type HealthComponentStatus,
} from '@creator-studio/contracts'
import { CREATOR_STUDIO_METADATA } from '@creator-studio/contracts/metadata'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { createErrorEnvelope, HttpError, toSafeHttpError } from './errors.js'
import { logRequestError, requestLoggingMiddleware, type RequestLogger } from './logging.js'
import { requestIdMiddleware } from './request-id.js'
import { localSecurityMiddleware, type LocalSecurityContext } from './security.js'
import type { HttpBindings } from './types.js'

export interface HealthComponents {
  database: HealthComponentStatus
  migrations: HealthComponentStatus
}

export type HealthCheck = () => Promise<HealthComponents>
export type ConfigureApi = (app: Hono<HttpBindings>) => void

export interface ApiAppOptions {
  healthCheck?: HealthCheck
  configure?: ConfigureApi
  security?: LocalSecurityContext
  loadBootstrap?: () => Promise<BootstrapData>
  requestLogger?: RequestLogger
}

const unavailableHealthCheck: HealthCheck = async () => ({
  database: 'unhealthy',
  migrations: 'unhealthy',
})

export function createApiApp({ healthCheck = unavailableHealthCheck, configure, security, loadBootstrap, requestLogger }: ApiAppOptions = {}) {
  const app = new Hono<HttpBindings>()

  app.use('*', requestIdMiddleware)
  if (requestLogger) app.use('*', requestLoggingMiddleware(requestLogger))
  if (security) app.use('*', localSecurityMiddleware(security))

  const jsonBodyLimit = bodyLimit({
    maxSize: 2 * 1024 * 1024,
    onError: () => {
      throw new HttpError({ status: 413, code: 'FILE_TOO_LARGE', message: 'JSON 请求正文超过 2 MB 限制。' })
    },
  })
  app.use('*', async (context, next) => {
    if (context.req.header('Content-Type')?.toLowerCase().includes('application/json')) {
      return jsonBodyLimit(context, next)
    }
    await next()
  })

  app.get('/health', async (context) => {
    let components: HealthComponents

    try {
      components = await healthCheck()
    } catch {
      components = { database: 'unhealthy', migrations: 'unhealthy' }
    }

    const ready = components.database === 'ready' && components.migrations === 'ready'
    const response = healthResponseSchema.parse({
      data: {
        status: ready ? 'ok' : 'unhealthy',
        version: CREATOR_STUDIO_METADATA.version,
        ...components,
      },
      meta: { requestId: context.get('requestId') },
    })

    return context.json(response, ready ? 200 : 503)
  })

  if (loadBootstrap) {
    app.get('/bootstrap', async (context) => {
      const response = bootstrapResponseSchema.parse({
        data: await loadBootstrap(),
        meta: { requestId: context.get('requestId') },
      })
      return context.json(response)
    })
  }

  configure?.(app)

  app.all('*', () => {
    throw new HttpError({
      status: 404,
      code: 'NOT_FOUND',
      message: '请求的 API 路由不存在。',
    })
  })

  app.onError((error, context) => {
    const httpError = toSafeHttpError(error)
    logRequestError(context, httpError.status)
    return context.json(createErrorEnvelope(httpError, context.get('requestId')), httpError.status)
  })

  return app
}
