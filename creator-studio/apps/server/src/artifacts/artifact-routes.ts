import {
  artifactDetailResponseSchema,
  artifactVersionListResponseSchema,
  artifactVersionResponseSchema,
  idSchema,
  restoreArtifactVersionSchema,
  updateArtifactSchema,
  collectionItemListResponseSchema,
  selectCollectionItemSchema,
} from '@creator-studio/contracts'
import type { Hono } from 'hono'

import { HttpError } from '../http/errors.js'
import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import type { ArtifactService } from './artifact-service.js'

async function readJson(context: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await context.req.json()
  } catch {
    throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '请求正文必须是有效的 JSON。' })
  }
}

function identity(context: { get: (key: 'workspaceId' | 'creatorProfileId') => string }) {
  return { workspaceId: context.get('workspaceId'), creatorProfileId: context.get('creatorProfileId') }
}

export function configureArtifactRoutes(app: Hono<HttpBindings>, service: ArtifactService): void {
  app.get('/artifacts/:artifactId', async (context) => {
    const artifactId = parseWithSchema(idSchema, context.req.param('artifactId'))
    const data = await service.get(identity(context), artifactId)
    return context.json(artifactDetailResponseSchema.parse({ data, meta: { requestId: context.get('requestId') } }))
  })

  app.get('/artifacts/:artifactId/versions', async (context) => {
    const artifactId = parseWithSchema(idSchema, context.req.param('artifactId'))
    const page = await service.listVersions(identity(context), artifactId, {
      cursor: context.req.query('cursor'),
      limit: context.req.query('limit') ? Number(context.req.query('limit')) : 30,
    })
    return context.json(artifactVersionListResponseSchema.parse({
      data: page.items,
      meta: { requestId: context.get('requestId'), hasMore: page.hasMore, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) },
    }))
  })

  app.get('/artifact-versions/:versionId', async (context) => {
    const versionId = parseWithSchema(idSchema, context.req.param('versionId'))
    const data = await service.getVersion(identity(context), versionId)
    return context.json(artifactVersionResponseSchema.parse({ data, meta: { requestId: context.get('requestId') } }))
  })

  app.post('/artifacts/:artifactId/versions/restore', async (context) => {
    const artifactId = parseWithSchema(idSchema, context.req.param('artifactId'))
    const input = parseWithSchema(restoreArtifactVersionSchema, await readJson(context))
    const data = await service.restore(identity(context), artifactId, input.versionId)
    return context.json(artifactVersionResponseSchema.parse({ data, meta: { requestId: context.get('requestId') } }), 201)
  })

  app.patch('/artifacts/:artifactId', async (context) => {
    const artifactId = parseWithSchema(idSchema, context.req.param('artifactId'))
    const input = parseWithSchema(updateArtifactSchema, await readJson(context))
    const data = await service.update(identity(context), artifactId, input)
    return context.json(artifactDetailResponseSchema.parse({ data, meta: { requestId: context.get('requestId') } }))
  })

  app.delete('/artifacts/:artifactId', async (context) => {
    const artifactId = parseWithSchema(idSchema, context.req.param('artifactId'))
    await service.remove(identity(context), artifactId)
    return context.body(null, 204)
  })

  app.get('/artifacts/:artifactId/collection-items', async (context) => {
    const artifactId = parseWithSchema(idSchema, context.req.param('artifactId'))
    const items = await service.listCollectionItems(identity(context), artifactId)
    return context.json(collectionItemListResponseSchema.parse({ data: { items }, meta: { requestId: context.get('requestId') } }))
  })

  app.post('/artifacts/:artifactId/collection-items/select', async (context) => {
    const artifactId = parseWithSchema(idSchema, context.req.param('artifactId'))
    const input = parseWithSchema(selectCollectionItemSchema, await readJson(context))
    const items = await service.selectCollectionItem(identity(context), artifactId, input.itemArtifactId)
    return context.json(collectionItemListResponseSchema.parse({ data: { items }, meta: { requestId: context.get('requestId') } }))
  })
}
