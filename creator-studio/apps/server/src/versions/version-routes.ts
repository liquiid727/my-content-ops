import { idSchema, versionListQuerySchema, versionListResponseSchema, versionResponseSchema } from '@creator-studio/contracts'
import type { Hono } from 'hono'

import { parseIdempotencyKey } from '../http/idempotency.js'
import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import type { VersionService } from './version-service.js'

export function configureVersionRoutes(app: Hono<HttpBindings>, service: VersionService): void {
  app.get('/projects/:projectId/versions', async (context) => {
    const projectId = parseWithSchema(idSchema, context.req.param('projectId'))
    const query = parseWithSchema(versionListQuerySchema, { subjectType: context.req.query('subjectType') })
    const data = await service.list(context.get('workspaceId'), projectId, query.subjectType)
    return context.json(versionListResponseSchema.parse({ data, meta: { requestId: context.get('requestId'), hasMore: false } }))
  })

  app.get('/versions/:versionId', async (context) => {
    const id = parseWithSchema(idSchema, context.req.param('versionId'))
    const data = await service.get(context.get('workspaceId'), id)
    return context.json(versionResponseSchema.parse({ data, meta: { requestId: context.get('requestId') } }))
  })

  app.post('/versions/:versionId/restore', async (context) => {
    const id = parseWithSchema(idSchema, context.req.param('versionId'))
    const key = parseIdempotencyKey(context.req.header('Idempotency-Key'), true)!
    const data = await service.restore(context.get('workspaceId'), context.get('creatorProfileId'), id, key)
    return context.json(versionResponseSchema.parse({ data, meta: { requestId: context.get('requestId') } }), 201)
  })
}

