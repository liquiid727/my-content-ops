import { createTaskSchema, idSchema, taskListQuerySchema, taskListResponseSchema, taskResponseSchema } from '@creator-studio/contracts'
import type { Hono } from 'hono'
import { HttpError } from '../http/errors.js'
import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import type { TaskService } from './task-service.js'

async function json(context: { req: { json: () => Promise<unknown> } }) { try { return await context.req.json() } catch { throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '请求正文必须是 JSON。' }) } }
export function configureTaskRoutes(app: Hono<HttpBindings>, service: TaskService): void {
  app.get('/tasks', async (context) => {
    const query = parseWithSchema(taskListQuerySchema, { active: context.req.query('active'), projectId: context.req.query('projectId'), type: context.req.query('type'), cursor: context.req.query('cursor'), limit: context.req.query('limit') })
    const page = await service.list(context.get('workspaceId'), query)
    return context.json(taskListResponseSchema.parse({ data: page.items, meta: { requestId: context.get('requestId'), hasMore: page.hasMore, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) } }))
  })
  app.post('/tasks', async (context) => {
    const input = parseWithSchema(createTaskSchema, await json(context))
    const data = await service.create({ workspaceId: context.get('workspaceId'), creatorProfileId: context.get('creatorProfileId') }, input)
    return context.json(taskResponseSchema.parse({ data, meta: { requestId: context.get('requestId') } }), 202)
  })
  app.get('/tasks/:taskId', async (context) => {
    const data = await service.get(context.get('workspaceId'), parseWithSchema(idSchema, context.req.param('taskId')))
    return context.json(taskResponseSchema.parse({ data, meta: { requestId: context.get('requestId') } }))
  })
  app.post('/tasks/:taskId/cancel', async (context) => {
    const data = await service.cancel(context.get('workspaceId'), parseWithSchema(idSchema, context.req.param('taskId')))
    return context.json(taskResponseSchema.parse({ data, meta: { requestId: context.get('requestId') } }), 202)
  })
}
