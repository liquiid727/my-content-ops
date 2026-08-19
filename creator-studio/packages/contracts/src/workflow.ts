import { z } from 'zod'

import { artifactSchema } from './artifacts.js'
import { idSchema, isoDateTimeSchema, revisionSchema } from './common.js'
import { successEnvelopeSchema } from './envelopes.js'

export const workflowPortKindSchema = z.enum(['text', 'image', 'collection', 'mask', 'any'])
export type WorkflowPortKind = z.infer<typeof workflowPortKindSchema>

export const recipeCapabilityIdSchema = z.enum([
  'text.draft',
  'text.rewrite',
  'image.generate',
  'image.edit',
  'image.outpaint',
  'image.variation',
  'image.enhance',
])
export type RecipeCapabilityId = z.infer<typeof recipeCapabilityIdSchema>

export const recipeSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  capabilityId: recipeCapabilityIdSchema,
  title: z.string().trim().min(1).max(120),
  config: z.record(z.string(), z.unknown()).default({}),
  revision: revisionSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict()
export type Recipe = z.infer<typeof recipeSchema>

const workflowNodeBaseSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nullable(),
  height: z.number().finite().nullable(),
  collapsed: z.boolean(),
  zIndex: z.number().int(),
  renderer: z.string().trim().min(1),
  updatedAt: isoDateTimeSchema,
})

export const workflowNodeSchema = z.discriminatedUnion('subjectType', [
  workflowNodeBaseSchema.extend({ subjectType: z.literal('artifact'), artifactId: idSchema }).strict(),
  workflowNodeBaseSchema.extend({ subjectType: z.literal('recipe'), recipeId: idSchema }).strict(),
])
export type WorkflowNode = z.infer<typeof workflowNodeSchema>

export const workflowConnectionSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  sourceNodeId: idSchema,
  sourcePort: z.string().trim().min(1).max(80),
  targetNodeId: idSchema,
  targetPort: z.string().trim().min(1).max(80),
  createdAt: isoDateTimeSchema,
}).strict()
export type WorkflowConnection = z.infer<typeof workflowConnectionSchema>

export const workflowSnapshotSchema = z.object({
  projectId: idSchema,
  revision: revisionSchema,
  nodes: z.array(workflowNodeSchema),
  connections: z.array(workflowConnectionSchema),
  recipes: z.array(recipeSchema),
  artifacts: z.array(artifactSchema),
}).strict()
export type WorkflowSnapshot = z.infer<typeof workflowSnapshotSchema>
export const workflowSnapshotResponseSchema = successEnvelopeSchema(workflowSnapshotSchema)

const positionSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()

export const graphCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add_artifact_node'), artifactId: idSchema, position: positionSchema }).strict(),
  z.object({
    type: z.literal('create_recipe_node'),
    capabilityId: recipeCapabilityIdSchema,
    title: z.string().trim().min(1).max(120),
    config: z.record(z.string(), z.unknown()).default({}),
    position: positionSchema,
  }).strict(),
  z.object({ type: z.literal('move_node'), nodeId: idSchema, position: positionSchema }).strict(),
  z.object({
    type: z.literal('resize_node'),
    nodeId: idSchema,
    width: z.number().finite().positive().nullable(),
    height: z.number().finite().positive().nullable(),
  }).strict(),
  z.object({ type: z.literal('remove_node'), nodeId: idSchema }).strict(),
  z.object({
    type: z.literal('connect_nodes'),
    sourceNodeId: idSchema,
    sourcePort: z.string().trim().min(1).max(80),
    targetNodeId: idSchema,
    targetPort: z.string().trim().min(1).max(80),
  }).strict(),
  z.object({ type: z.literal('disconnect_nodes'), connectionId: idSchema }).strict(),
  z.object({
    type: z.literal('update_recipe'),
    recipeId: idSchema,
    title: z.string().trim().min(1).max(120).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  }).strict(),
])
export type GraphCommand = z.infer<typeof graphCommandSchema>

export const graphCommandBatchSchema = z.object({
  expectedRevision: revisionSchema,
  commands: z.array(graphCommandSchema).min(1).max(100),
}).strict()
export type GraphCommandBatch = z.infer<typeof graphCommandBatchSchema>

export const createRecipeSchema = z.object({
  capabilityId: recipeCapabilityIdSchema,
  title: z.string().trim().min(1).max(120),
  config: z.record(z.string(), z.unknown()).default({}),
}).strict()
export const updateRecipeSchema = z.object({
  expectedRevision: revisionSchema,
  title: z.string().trim().min(1).max(120).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
}).strict().refine((value) => value.title !== undefined || value.config !== undefined, 'At least one recipe field is required')

export const recipeCapabilitySchema = z.object({
  id: recipeCapabilityIdSchema,
  label: z.string(),
  description: z.string(),
  inputPorts: z.array(z.object({ id: z.string(), kind: workflowPortKindSchema, required: z.boolean() }).strict()),
  outputPorts: z.array(z.object({ id: z.string(), kind: workflowPortKindSchema }).strict()),
}).strict()
export type RecipeCapability = z.infer<typeof recipeCapabilitySchema>

export const executionPlanStepSchema = z.object({
  recipeId: idSchema,
  capabilityId: recipeCapabilityIdSchema,
  inputArtifactIds: z.array(idSchema),
  dependsOnRecipeIds: z.array(idSchema).default([]),
}).strict()
export const executionPlanStatusSchema = z.enum(['draft', 'queued', 'running', 'completed', 'failed', 'cancelled'])
export const executionPlanSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  graphRevision: revisionSchema,
  steps: z.array(executionPlanStepSchema),
  status: executionPlanStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict()
export type ExecutionPlan = z.infer<typeof executionPlanSchema>
export const createExecutionPlanSchema = z.object({
  expectedRevision: revisionSchema,
  recipeNodeIds: z.array(idSchema).min(1).max(100),
}).strict()

export const changeSetStatusSchema = z.enum(['proposed', 'approved', 'rejected', 'applied', 'failed'])
export const changeSetValidationSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.object({ commandIndex: z.number().int().nonnegative().nullable(), code: z.string(), message: z.string() }).strict()),
}).strict()
export type ChangeSetValidation = z.infer<typeof changeSetValidationSchema>
export const changeSetSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  baseRevision: revisionSchema,
  summary: z.string().trim().min(1).max(2_000),
  proposer: z.object({ type: z.enum(['internal_agent', 'mcp', 'user']), name: z.string().trim().min(1).max(120) }).strict(),
  commands: z.array(graphCommandSchema),
  validation: changeSetValidationSchema,
  status: changeSetStatusSchema,
  resultingRevision: revisionSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict()
export type ChangeSet = z.infer<typeof changeSetSchema>
export const proposeChangeSetSchema = z.object({
  baseRevision: revisionSchema,
  summary: z.string().trim().min(1).max(2_000),
  proposer: z.object({ type: z.enum(['internal_agent', 'mcp', 'user']), name: z.string().trim().min(1).max(120) }).strict(),
  commands: z.array(graphCommandSchema).min(1).max(100),
}).strict()
export type ProposeChangeSet = z.infer<typeof proposeChangeSetSchema>
export const decideChangeSetSchema = z.object({ expectedRevision: revisionSchema }).strict()

export const collectionItemSchema = z.object({
  collectionArtifactId: idSchema,
  itemArtifactId: idSchema,
  position: z.number().int().nonnegative(),
  selected: z.boolean(),
}).strict()
export type CollectionItem = z.infer<typeof collectionItemSchema>
export const collectionItemListResponseSchema = successEnvelopeSchema(z.object({ items: z.array(collectionItemSchema) }).strict())
export const selectCollectionItemSchema = z.object({ itemArtifactId: idSchema }).strict()

export const recipeResponseSchema = successEnvelopeSchema(recipeSchema)
export const recipeCapabilityListResponseSchema = successEnvelopeSchema(z.object({ capabilities: z.array(recipeCapabilitySchema) }).strict())
export const executionPlanResponseSchema = successEnvelopeSchema(executionPlanSchema)
export const changeSetResponseSchema = successEnvelopeSchema(changeSetSchema)
