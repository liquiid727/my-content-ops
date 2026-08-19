import {
  changeSetResponseSchema,
  createExecutionPlanSchema,
  createRecipeSchema,
  decideChangeSetSchema,
  executionPlanResponseSchema,
  graphCommandBatchSchema,
  idSchema,
  proposeChangeSetSchema,
  recipeResponseSchema,
  updateRecipeSchema,
  workflowSnapshotResponseSchema,
  recipeCapabilityListResponseSchema,
} from '@creator-studio/contracts'
import type { Hono } from 'hono'

import { HttpError } from '../http/errors.js'
import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import type { WorkflowService } from './workflow-service.js'
import { recipeCapabilities } from './capabilities.js'

async function json(context: { req: { json: () => Promise<unknown> } }) { try { return await context.req.json() } catch { throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '请求正文必须是有效 JSON。' }) } }
function identity(context: { get: (key: 'workspaceId' | 'creatorProfileId') => string }) { return { workspaceId: context.get('workspaceId'), creatorProfileId: context.get('creatorProfileId') } }
function envelope(context: { get: (key: 'requestId') => string }, schema: { parse: (value: unknown) => unknown }, data: unknown) { return schema.parse({ data, meta: { requestId: context.get('requestId') } }) }

export function configureWorkflowRoutes(app: Hono<HttpBindings>, service: WorkflowService): void {
  app.get('/workflow-capabilities', (context) => context.json(envelope(context, recipeCapabilityListResponseSchema, { capabilities: recipeCapabilities })))
  app.get('/projects/:projectId/workflow', async (context) => { const projectId = parseWithSchema(idSchema, context.req.param('projectId')); return context.json(envelope(context, workflowSnapshotResponseSchema, await service.getSnapshot(identity(context), projectId))) })
  app.post('/projects/:projectId/graph-commands', async (context) => { const projectId = parseWithSchema(idSchema, context.req.param('projectId')); const input = parseWithSchema(graphCommandBatchSchema, await json(context)); return context.json(envelope(context, workflowSnapshotResponseSchema, await service.applyCommands(identity(context), projectId, input))) })
  app.post('/projects/:projectId/recipes', async (context) => { const projectId = parseWithSchema(idSchema, context.req.param('projectId')); const input = parseWithSchema(createRecipeSchema, await json(context)); return context.json(envelope(context, recipeResponseSchema, await service.createRecipe(identity(context), projectId, input)), 201) })
  app.patch('/projects/:projectId/recipes/:recipeId', async (context) => { const projectId = parseWithSchema(idSchema, context.req.param('projectId')); const recipeId = parseWithSchema(idSchema, context.req.param('recipeId')); const input = parseWithSchema(updateRecipeSchema, await json(context)); const patch = { ...(input.title === undefined ? {} : { title: input.title }), ...(input.config === undefined ? {} : { config: input.config }) }; return context.json(envelope(context, recipeResponseSchema, await service.updateRecipe(identity(context), projectId, recipeId, input.expectedRevision, patch))) })
  app.post('/projects/:projectId/execution-plans', async (context) => { const projectId = parseWithSchema(idSchema, context.req.param('projectId')); const input = parseWithSchema(createExecutionPlanSchema, await json(context)); return context.json(envelope(context, executionPlanResponseSchema, await service.createExecutionPlan(identity(context), projectId, input.expectedRevision, input.recipeNodeIds)), 201) })
  app.post('/execution-plans/:planId/execute', async (context) => { const planId = parseWithSchema(idSchema, context.req.param('planId')); return context.json(envelope(context, executionPlanResponseSchema, await service.queueExecutionPlan(identity(context), planId)), 202) })
  app.post('/projects/:projectId/change-sets', async (context) => { const projectId = parseWithSchema(idSchema, context.req.param('projectId')); const input = parseWithSchema(proposeChangeSetSchema, await json(context)); return context.json(envelope(context, changeSetResponseSchema, await service.proposeChangeSet(identity(context), projectId, input)), 201) })
  app.get('/change-sets/:changeSetId', async (context) => { const id = parseWithSchema(idSchema, context.req.param('changeSetId')); return context.json(envelope(context, changeSetResponseSchema, await service.getChangeSet(identity(context), id))) })
  app.post('/change-sets/:changeSetId/approve', async (context) => { const id = parseWithSchema(idSchema, context.req.param('changeSetId')); const input = parseWithSchema(decideChangeSetSchema, await json(context)); return context.json(envelope(context, changeSetResponseSchema, await service.approveChangeSet(identity(context), id, input.expectedRevision))) })
  app.post('/change-sets/:changeSetId/reject', async (context) => { const id = parseWithSchema(idSchema, context.req.param('changeSetId')); return context.json(envelope(context, changeSetResponseSchema, await service.rejectChangeSet(identity(context), id))) })
}
