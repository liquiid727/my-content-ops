import { randomBytes, timingSafeEqual } from 'node:crypto'

import { getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'

import type { LocalIdentity } from '../bootstrap/identity.js'
import { HttpError } from './errors.js'
import type { HttpBindings } from './types.js'

export const LOCAL_SESSION_COOKIE = 'creator_studio_session'

export interface LocalSecurityContext {
  sessionToken: string
  workspaceId: string
  creatorProfileId: string
  allowedHosts: ReadonlySet<string>
  allowedOrigins: ReadonlySet<string>
}

export interface CreateLocalSecurityOptions {
  port: number
  identity: LocalIdentity
  sessionToken?: string
}

export function createLocalSecurityContext({ port, identity, sessionToken = randomBytes(32).toString('base64url') }: CreateLocalSecurityOptions): LocalSecurityContext {
  return {
    sessionToken,
    workspaceId: identity.workspace.id,
    creatorProfileId: identity.creatorProfile.id,
    allowedHosts: new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]),
    allowedOrigins: new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`]),
  }
}

function tokensMatch(received: string | undefined, expected: string): boolean {
  if (received === undefined) return false
  const receivedBytes = Buffer.from(received)
  const expectedBytes = Buffer.from(expected)
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes)
}

function isWriteMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
}

export function localSecurityMiddleware(security: LocalSecurityContext) {
  return createMiddleware<HttpBindings>(async (context, next) => {
    const host = (context.req.header('Host') ?? new URL(context.req.url).host).toLowerCase()
    if (!host || !security.allowedHosts.has(host)) {
      throw new HttpError({ status: 403, code: 'HOST_NOT_ALLOWED', message: '请求 Host 不在本地服务允许范围内。' })
    }

    const pathname = new URL(context.req.url).pathname
    const isHealth = pathname.endsWith('/health')
    const isBootstrap = pathname.endsWith('/bootstrap') && context.req.method === 'GET'
    if (isHealth) {
      await next()
      return
    }

    const session = getCookie(context, LOCAL_SESSION_COOKIE)
    if (isBootstrap && !tokensMatch(session, security.sessionToken)) {
      setCookie(context, LOCAL_SESSION_COOKIE, security.sessionToken, {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/',
        secure: new URL(context.req.url).protocol === 'https:',
      })
    } else if (!tokensMatch(session, security.sessionToken)) {
      throw new HttpError({ status: 401, code: 'SESSION_REQUIRED', message: '本地会话无效，请重新载入 Creator Studio。' })
    }

    if (isWriteMethod(context.req.method)) {
      const origin = context.req.header('Origin')
      if (!origin || !security.allowedOrigins.has(origin)) {
        throw new HttpError({ status: 403, code: 'ORIGIN_NOT_ALLOWED', message: '写请求 Origin 不符合本地同源策略。' })
      }
    }

    context.set('workspaceId', security.workspaceId)
    context.set('creatorProfileId', security.creatorProfileId)
    await next()
  })
}
