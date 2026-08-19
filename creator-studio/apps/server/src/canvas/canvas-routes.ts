import {
  canvasNodeResponseSchema,
  createEdgeSchema,
  createNodeResponseSchema,
  createNodeSchema,
  edgeResponseSchema,
  graphResponseSchema,
  idSchema,
  updateNodeSchema,
} from '@creator-studio/contracts'
import type { Hono } from 'hono'

import { HttpError } from '../http/errors.js'
import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import type { CanvasService } from './canvas-service.js'

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

export function configureCanvasRoutes(app: Hono<HttpBindings>, service: CanvasService): void {
  app.get('/projects/:projectId/graph', async (context) => {
    const projectId = parseWithSchema(idSchema, context.req.param('projectId'))
    const data = await service.getGraph(identity(context), projectId)
    return context.json(graphResponseSchema.parse({ data, meta: { requestId: context.get('requestId') } }))
  })

  app.post('/projects/:projectId/nodes', async (context) => {
    const projectId = parseWithSchema(idSchema, context.req.param('projectId'))
    const input = parseWithSchema(createNodeSchema, await readJson(context))
    const data = await service.createNode(identity(context), projectId, input)
    return context.json(createNodeResponseSchema.parse({ data, meta: { requestId: context.get('requestId') } }), 201)
  })

  app.patch('/nodes/:nodeId', async (context) => {
    const nodeId = parseWithSchema(idSchema, context.req.param('nodeId'))
    const patch = parseWithSchema(updateNodeSchema, await readJson(context))
    const data = await service.updateNode(identity(context), nodeId, patch)
    return context.json(canvasNodeResponseSchema.parse({ data, meta: { requestId: context.get('requestId') } }))
  })

  app.delete('/nodes/:nodeId', async (context) => {
    const nodeId = parseWithSchema(idSchema, context.req.param('nodeId'))
    await service.deleteNode(identity(context), nodeId)
    return context.body(null, 204)
  })

  app.post('/edges', async (context) => {
    const input = parseWithSchema(createEdgeSchema, await readJson(context))
    const data = await service.createEdge(identity(context), input)
    return context.json(edgeResponseSchema.parse({ data, meta: { requestId: context.get('requestId') } }), 201)
  })

  app.delete('/edges/:edgeId', async (context) => {
    const edgeId = parseWithSchema(idSchema, context.req.param('edgeId'))
    await service.deleteEdge(identity(context), edgeId)
    return context.body(null, 204)
  })
}
