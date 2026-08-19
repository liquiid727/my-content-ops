import {
  availableOperationsRequestSchema,
  createRunResponseSchema,
  createRunSchema,
  idSchema,
  operationDefinitionListResponseSchema,
  retryRunSchema,
  runListResponseSchema,
  runResponseSchema,
} from '@creator-studio/contracts'
import type { Hono } from 'hono'

import { HttpError } from '../http/errors.js'
import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import type { RunService } from './run-service.js'

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

export function configureRunRoutes(app: Hono<HttpBindings>, service: RunService): void {
  app.get('/artifacts/:artifactId/operations', async (context) => {
    const artifactId = parseWithSchema(idSchema, context.req.param('artifactId'))
    const operations = await service.getAvailableOperations(identity(context), artifactId)
    return context.json(operationDefinitionListResponseSchema.parse({
      data: { operations },
      meta: { requestId: context.get('requestId') },
    }))
  })

  app.post('/operations/available', async (context) => {
    const input = parseWithSchema(availableOperationsRequestSchema, await readJson(context))
    const operations = await service.getAvailableOperationsForSet(identity(context), input.projectId, input.artifactIds)
    return context.json(operationDefinitionListResponseSchema.parse({
      data: { operations },
      meta: { requestId: context.get('requestId') },
    }))
  })

  app.post('/operations/:operationId/runs', async (context) => {
    const operationId = context.req.param('operationId')
    const input = parseWithSchema(createRunSchema, await readJson(context))
    const { run } = await service.create(identity(context), operationId, {
      projectId: input.projectId,
      sourceArtifactId: input.sourceArtifactId ?? null,
      ...(input.sourceArtifactIds ? { sourceArtifactIds: input.sourceArtifactIds } : {}),
      inputVersionIds: input.inputVersionIds,
      knowledgeSourceIds: input.knowledgeSourceIds,
      config: input.config,
      idempotencyKey: input.idempotencyKey,
    })
    return context.json(createRunResponseSchema.parse({
      data: { runId: run.id, taskId: run.taskId, status: run.status, outputArtifactIds: run.outputArtifactIds ?? [] },
      meta: { requestId: context.get('requestId') },
    }), 202)
  })

  app.get('/runs', async (context) => {
    const projectId = context.req.query('projectId')
    const runs = projectId
      ? await service.list(identity(context), parseWithSchema(idSchema, projectId))
      : []
    return context.json(runListResponseSchema.parse({ data: runs, meta: { requestId: context.get('requestId'), hasMore: false } }))
  })

  app.get('/runs/:runId', async (context) => {
    const runId = parseWithSchema(idSchema, context.req.param('runId'))
    const run = await service.get(identity(context), runId)
    return context.json(runResponseSchema.parse({ data: run, meta: { requestId: context.get('requestId') } }))
  })

  app.post('/runs/:runId/cancel', async (context) => {
    const runId = parseWithSchema(idSchema, context.req.param('runId'))
    const run = await service.cancel(identity(context), runId)
    return context.json(runResponseSchema.parse({ data: run, meta: { requestId: context.get('requestId') } }), 202)
  })

  app.post('/runs/:runId/retry', async (context) => {
    const runId = parseWithSchema(idSchema, context.req.param('runId'))
    const input = parseWithSchema(retryRunSchema, await readJson(context))
    const { run } = await service.retry(identity(context), runId, input.idempotencyKey)
    return context.json(createRunResponseSchema.parse({
      data: { runId: run.id, taskId: run.taskId, status: run.status },
      meta: { requestId: context.get('requestId') },
    }), 202)
  })
}
