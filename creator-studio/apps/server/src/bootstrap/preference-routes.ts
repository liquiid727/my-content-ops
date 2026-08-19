import { creatorPreferencesSchema, creatorProfileResponseSchema, updateCreatorPreferencesSchema } from '@creator-studio/contracts'
import type { Hono } from 'hono'
import { HttpError } from '../http/errors.js'
import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import type { WorkspaceRepository } from '../repositories/index.js'

async function json(context: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try { return await context.req.json() } catch { throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '请求正文必须是 JSON。' }) }
}

export function configurePreferenceRoutes(app: Hono<HttpBindings>, workspaces: WorkspaceRepository, now: () => number = Date.now): void {
  app.patch('/creator-profile/preferences', async (context) => {
    const input = parseWithSchema(updateCreatorPreferencesSchema, await json(context))
    const current = await workspaces.getProfile(context.get('workspaceId'))
    if (!current || current.id !== context.get('creatorProfileId')) {
      throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'CreatorProfile 不存在。' })
    }
    const preferences = creatorPreferencesSchema.parse({
      ...creatorPreferencesSchema.parse(JSON.parse(current.preferencesJson)),
      ...input,
    })
    const profile = await workspaces.updateProfilePreferences(
      context.get('workspaceId'),
      context.get('creatorProfileId'),
      JSON.stringify(preferences),
      now(),
    )
    if (!profile) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'CreatorProfile 不存在。' })
    return context.json(creatorProfileResponseSchema.parse({
      data: { id: profile.id, displayName: profile.displayName, preferences: creatorPreferencesSchema.parse(JSON.parse(profile.preferencesJson)) },
      meta: { requestId: context.get('requestId') },
    }))
  })
}
