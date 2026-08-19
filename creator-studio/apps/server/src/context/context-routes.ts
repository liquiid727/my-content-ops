import { idSchema, projectContextResponseSchema, type InjectScope } from '@creator-studio/contracts'
import type { Hono } from 'hono'

import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import type { ContextIdentity, ContextService } from './context-service.js'

const INJECT_SCOPES: readonly InjectScope[] = ['project', 'topic', 'outline', 'script', 'cover', 'voice', 'video', 'publish']

function identity(context: { get: (key: 'workspaceId' | 'creatorProfileId') => string }): ContextIdentity {
  return { workspaceId: context.get('workspaceId'), creatorProfileId: context.get('creatorProfileId') }
}

function parseScope(raw: string | undefined): InjectScope {
  return raw && (INJECT_SCOPES as readonly string[]).includes(raw) ? raw as InjectScope : 'project'
}

export function configureContextRoutes(app: Hono<HttpBindings>, service: ContextService): void {
  app.get('/projects/:projectId/context', async (context) => {
    const projectId = parseWithSchema(idSchema, context.req.param('projectId'))
    const assembled = await service.assembleProject(identity(context), projectId, parseScope(context.req.query('scope')))
    return context.json(projectContextResponseSchema.parse({
      data: assembled,
      meta: { requestId: context.get('requestId') },
    }))
  })
}
