import {
  connectionActionResponseSchema,
  connectionAuthStartResponseSchema,
  connectionListResponseSchema,
  connectionResponseSchema,
  createConnectionSchema,
  deleteConnectionResponseSchema,
  directoryPickerResponseSchema,
  idSchema,
  resourceConnectionCheckResponseSchema,
  updateConnectionSchema,
} from '@creator-studio/contracts'
import type { Hono } from 'hono'

import { HttpError } from '../http/errors.js'
import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import type { TaskService } from '../tasks/task-service.js'
import type { ConnectionService } from './connection-service.js'

async function json(context: { req: { json: () => Promise<unknown> } }) { try { return await context.req.json() } catch { throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '请求正文必须是 JSON。' }) } }
const identity = (context: { get: (key: 'workspaceId' | 'creatorProfileId') => string }) => ({ workspaceId: context.get('workspaceId'), creatorProfileId: context.get('creatorProfileId') })

export function configureConnectionRoutes(app: Hono<HttpBindings>, service: ConnectionService, tasks: TaskService): void {
  app.get('/connections', (c) => c.json(connectionListResponseSchema.parse({ data: { connections: service.list(c.get('workspaceId')) }, meta: { requestId: c.get('requestId') } })))
  app.post('/connections/pick-directory', async (c) => c.json(directoryPickerResponseSchema.parse({ data: { path: await service.pickDirectory() }, meta: { requestId: c.get('requestId') } })))
  app.post('/connections', async (c) => c.json(connectionResponseSchema.parse({ data: await service.create(c.get('workspaceId'), parseWithSchema(createConnectionSchema, await json(c))), meta: { requestId: c.get('requestId') } }), 201))
  app.patch('/connections/:id', async (c) => c.json(connectionResponseSchema.parse({ data: await service.update(c.get('workspaceId'), parseWithSchema(idSchema, c.req.param('id')), parseWithSchema(updateConnectionSchema, await json(c))), meta: { requestId: c.get('requestId') } })))
  app.delete('/connections/:id', (c) => { service.delete(c.get('workspaceId'), parseWithSchema(idSchema, c.req.param('id'))); return c.json(deleteConnectionResponseSchema.parse({ data: { deleted: true }, meta: { requestId: c.get('requestId') } })) })
  app.post('/connections/:id/test', async (c) => c.json(resourceConnectionCheckResponseSchema.parse({ data: await service.test(c.get('workspaceId'), parseWithSchema(idSchema, c.req.param('id'))), meta: { requestId: c.get('requestId') } })))
  app.post('/connections/:id/install', async (c) => {
    const connectionId = parseWithSchema(idSchema, c.req.param('id'))
    service.get(c.get('workspaceId'), connectionId)
    const task = await tasks.create(identity(c), { type: 'knowledge.install', input: { action: 'install_lark', workspaceId: c.get('workspaceId'), connectionId } })
    return c.json(connectionActionResponseSchema.parse({ data: { taskId: task.id }, meta: { requestId: c.get('requestId') } }), 202)
  })
  app.post('/connections/:id/auth/start', async (c) => {
    const connectionId = parseWithSchema(idSchema, c.req.param('id'))
    const auth = await service.beginLarkAuth(c.get('workspaceId'), connectionId)
    const task = auth.phase === 'user_auth'
      ? await tasks.create(identity(c), { type: 'knowledge.auth', input: { action: 'finish_lark_auth', workspaceId: c.get('workspaceId'), connectionId, deviceCode: auth.deviceCode } })
      : null
    return c.json(connectionAuthStartResponseSchema.parse({ data: { taskId: task?.id ?? null, authorizationUrl: auth.authorizationUrl, phase: auth.phase }, meta: { requestId: c.get('requestId') } }), 202)
  })
  app.get('/connections/:id/auth/status', async (c) => c.json(resourceConnectionCheckResponseSchema.parse({ data: await service.test(c.get('workspaceId'), parseWithSchema(idSchema, c.req.param('id'))), meta: { requestId: c.get('requestId') } })))
  app.post('/connections/:id/index', async (c) => {
    const connectionId = parseWithSchema(idSchema, c.req.param('id'))
    service.get(c.get('workspaceId'), connectionId)
    const task = await tasks.create(identity(c), { type: 'knowledge.index', input: { action: 'index', workspaceId: c.get('workspaceId'), connectionId } })
    return c.json(connectionActionResponseSchema.parse({ data: { taskId: task.id }, meta: { requestId: c.get('requestId') } }), 202)
  })
}
