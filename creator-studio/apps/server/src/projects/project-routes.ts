import {
  archiveProjectSchema,
  createProjectSchema,
  idSchema,
  projectListQuerySchema,
  projectListResponseSchema,
  projectOverviewResponseSchema,
  projectResponseSchema,
  updateProjectSchema,
} from '@creator-studio/contracts'
import type { Hono } from 'hono'

import { HttpError } from '../http/errors.js'
import { parseIdempotencyKey } from '../http/idempotency.js'
import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import type { ProjectService, ProjectServiceIdentity } from './project-service.js'

async function readJson(context: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await context.req.json()
  } catch {
    throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '请求正文必须是有效的 JSON。' })
  }
}

function identity(context: { get: (key: 'workspaceId' | 'creatorProfileId') => string }): ProjectServiceIdentity {
  return {
    workspaceId: context.get('workspaceId'),
    creatorProfileId: context.get('creatorProfileId'),
  }
}

export function configureProjectRoutes(app: Hono<HttpBindings>, service: ProjectService): void {
  app.get('/projects', async (context) => {
    const query = parseWithSchema(projectListQuerySchema, {
      cursor: context.req.query('cursor'),
      limit: context.req.query('limit'),
      status: context.req.query('status'),
    })
    const page = await service.list(identity(context), query)
    return context.json(projectListResponseSchema.parse({
      data: page.items,
      meta: {
        requestId: context.get('requestId'),
        hasMore: page.hasMore,
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      },
    }))
  })

  app.post('/projects', async (context) => {
    const idempotencyKey = parseIdempotencyKey(context.req.header('Idempotency-Key'), true)!
    const input = parseWithSchema(createProjectSchema, await readJson(context))
    const project = service.create(identity(context), input, idempotencyKey)
    return context.json(projectResponseSchema.parse({
      data: project,
      meta: { requestId: context.get('requestId') },
    }), 201)
  })

  app.get('/projects/:projectId', async (context) => {
    const projectId = parseWithSchema(idSchema, context.req.param('projectId'))
    const project = await service.get(identity(context), projectId)
    return context.json(projectResponseSchema.parse({ data: project, meta: { requestId: context.get('requestId') } }))
  })

  app.patch('/projects/:projectId', async (context) => {
    const projectId = parseWithSchema(idSchema, context.req.param('projectId'))
    const input = parseWithSchema(updateProjectSchema, await readJson(context))
    const project = await service.update(identity(context), projectId, input.revision, input.patch)
    return context.json(projectResponseSchema.parse({ data: project, meta: { requestId: context.get('requestId') } }))
  })

  app.post('/projects/:projectId/archive', async (context) => {
    const projectId = parseWithSchema(idSchema, context.req.param('projectId'))
    const input = parseWithSchema(archiveProjectSchema, await readJson(context))
    const project = await service.archive(identity(context), projectId, input.revision)
    return context.json(projectResponseSchema.parse({ data: project, meta: { requestId: context.get('requestId') } }))
  })

  app.get('/projects/:projectId/overview', async (context) => {
    const projectId = parseWithSchema(idSchema, context.req.param('projectId'))
    const overview = await service.overview(identity(context), projectId)
    return context.json(projectOverviewResponseSchema.parse({ data: overview, meta: { requestId: context.get('requestId') } }))
  })
}

