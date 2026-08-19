import {
  creatorProfileEntityResponseSchema,
  idSchema,
  importProfileRequestSchema,
  importProfileResponseSchema,
  renderRequestSchema,
  renderResponseSchema,
  updateCreatorProfileSchema,
} from '@creator-studio/contracts'
import type { Hono } from 'hono'

import { HttpError } from '../http/errors.js'
import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import type { CreatorProfileService, CreatorProfileServiceIdentity } from './creator-profile-service.js'

async function readJson(context: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await context.req.json()
  } catch {
    throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '请求正文必须是有效的 JSON。' })
  }
}

function identity(context: { get: (key: 'workspaceId' | 'creatorProfileId') => string }): CreatorProfileServiceIdentity {
  return {
    workspaceId: context.get('workspaceId'),
    creatorProfileId: context.get('creatorProfileId'),
  }
}

export function configureCreatorProfileRoutes(app: Hono<HttpBindings>, service: CreatorProfileService): void {
  app.get('/creator-profile', async (context) => {
    const profile = await service.get(identity(context))
    return context.json(creatorProfileEntityResponseSchema.parse({
      data: profile,
      meta: { requestId: context.get('requestId') },
    }))
  })

  app.get('/creator-profile/default', async (context) => {
    const profile = service.getDefault(identity(context))
    return context.json(creatorProfileEntityResponseSchema.parse({
      data: profile,
      meta: { requestId: context.get('requestId') },
    }))
  })

  app.post('/creator-profile/render', async (context) => {
    const input = parseWithSchema(renderRequestSchema, await readJson(context))
    const result = await service.render(identity(context), input)
    return context.json(renderResponseSchema.parse({
      data: { text: result.text },
      meta: { requestId: context.get('requestId') },
    }))
  })

  app.post('/creator-profile/import', async (context) => {
    const input = parseWithSchema(importProfileRequestSchema, await readJson(context))
    const result = await service.importVault(identity(context), input)
    return context.json(importProfileResponseSchema.parse({
      data: { profile: result.profile, imported: result.imported },
      meta: { requestId: context.get('requestId') },
    }))
  })

  app.patch('/creator-profile/:id', async (context) => {
    const profileId = parseWithSchema(idSchema, context.req.param('id'))
    const input = parseWithSchema(updateCreatorProfileSchema, await readJson(context))
    const profile = await service.update(identity(context), profileId, input.revision, input.patch)
    return context.json(creatorProfileEntityResponseSchema.parse({
      data: profile,
      meta: { requestId: context.get('requestId') },
    }))
  })
}
