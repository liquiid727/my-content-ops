import {
  bindProjectSourceSchema,
  idSchema,
  knowledgeSearchQuerySchema,
  knowledgeSearchResponseSchema,
  knowledgeSourceEntityResponseSchema,
  knowledgeSourceResponseSchema,
  projectSourceListResponseSchema,
  refreshKnowledgeSourceResponseSchema,
  unbindProjectSourceResponseSchema,
} from '@creator-studio/contracts'
import type { Hono } from 'hono'

import { HttpError } from '../http/errors.js'
import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import type { TaskService } from '../tasks/task-service.js'
import type { KnowledgeService } from './knowledge-service.js'

async function json(context: { req: { json: () => Promise<unknown> } }) { try { return await context.req.json() } catch { throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '请求正文必须是 JSON。' }) } }
const identity = (context: { get: (key: 'workspaceId' | 'creatorProfileId') => string }) => ({ workspaceId: context.get('workspaceId'), creatorProfileId: context.get('creatorProfileId') })

export function configureKnowledgeRoutes(app: Hono<HttpBindings>, service: KnowledgeService, tasks: TaskService): void {
  app.get('/knowledge/search', async (c) => {
    const query = parseWithSchema(knowledgeSearchQuerySchema, { q: c.req.query('q') ?? '', connectionId: c.req.query('connectionId'), projectId: c.req.query('projectId'), kind: c.req.query('kind'), limit: c.req.query('limit') })
    return c.json(knowledgeSearchResponseSchema.parse({ data: { results: await service.search(c.get('workspaceId'), query) }, meta: { requestId: c.get('requestId') } }))
  })
  app.get('/knowledge/sources/:id', async (c) => c.json(knowledgeSourceResponseSchema.parse({ data: await service.detail(c.get('workspaceId'), parseWithSchema(idSchema, c.req.param('id'))), meta: { requestId: c.get('requestId') } })))
  app.post('/knowledge/sources/:id/refresh', async (c) => {
    const sourceId = parseWithSchema(idSchema, c.req.param('id'))
    const task = await tasks.create(identity(c), { type: 'knowledge.refresh', input: { action: 'refresh', workspaceId: c.get('workspaceId'), sourceId } })
    return c.json(refreshKnowledgeSourceResponseSchema.parse({ data: { taskId: task.id }, meta: { requestId: c.get('requestId') } }), 202)
  })
  app.get('/projects/:projectId/sources', (c) => c.json(projectSourceListResponseSchema.parse({ data: { sources: service.listProjectSources(c.get('workspaceId'), parseWithSchema(idSchema, c.req.param('projectId'))) }, meta: { requestId: c.get('requestId') } })))
  app.post('/projects/:projectId/sources', async (c) => {
    const projectId = parseWithSchema(idSchema, c.req.param('projectId'))
    const { sourceId } = parseWithSchema(bindProjectSourceSchema, await json(c))
    return c.json(knowledgeSourceEntityResponseSchema.parse({ data: service.bind(c.get('workspaceId'), projectId, sourceId), meta: { requestId: c.get('requestId') } }), 201)
  })
  app.delete('/projects/:projectId/sources/:sourceId', (c) => { service.unbind(c.get('workspaceId'), parseWithSchema(idSchema, c.req.param('projectId')), parseWithSchema(idSchema, c.req.param('sourceId'))); return c.json(unbindProjectSourceResponseSchema.parse({ data: { deleted: true }, meta: { requestId: c.get('requestId') } })) })
}
