import { z } from 'zod'

import { artifactKindSchema } from './artifacts.js'
import { idSchema } from './common.js'
import { successEnvelopeSchema } from './envelopes.js'

export const operationBehaviorSchema = z.enum(['create', 'transform', 'branch', 'action'])
export type OperationBehavior = z.infer<typeof operationBehaviorSchema>

export const operationOutputBehaviorSchema = z.enum(['new_artifact', 'new_version', 'new_collection', 'side_effect'])
export type OperationOutputBehavior = z.infer<typeof operationOutputBehaviorSchema>

export const operationPlacementSchema = z.enum(['primary', 'secondary', 'more'])
export type OperationPlacement = z.infer<typeof operationPlacementSchema>

export const operationInputSchema = z.object({
  kinds: z.array(artifactKindSchema).optional(),
  roles: z.array(z.string().trim().min(1)).optional(),
  slots: z.array(z.string().trim().min(1)).optional(),
}).strict()
export type OperationInput = z.infer<typeof operationInputSchema>

export const operationOutputSchema = z.object({
  kind: artifactKindSchema.optional(),
  role: z.string().trim().min(1).optional(),
  behavior: operationOutputBehaviorSchema,
}).strict()
export type OperationOutput = z.infer<typeof operationOutputSchema>

export const operationPresentationSchema = z.object({
  group: z.string().trim().min(1),
  priority: z.number().int().default(0),
  icon: z.string().trim().optional(),
  placement: operationPlacementSchema.default('secondary'),
  danger: z.boolean().default(false),
}).strict()
export type OperationPresentation = z.infer<typeof operationPresentationSchema>

export const operationRuntimeSchema = z.object({
  streaming: z.boolean().optional(),
  cancellable: z.boolean().optional(),
  retryable: z.boolean().optional(),
  expectedDuration: z.enum(['instant', 'short', 'medium', 'long']).optional(),
}).strict()
export type OperationRuntime = z.infer<typeof operationRuntimeSchema>

export const operationDefinitionSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().optional(),
  behavior: operationBehaviorSchema,
  input: operationInputSchema,
  output: operationOutputSchema.optional(),
  configSchema: z.unknown().optional(),
  defaultConfig: z.record(z.string(), z.unknown()).default({}),
  executor: z.string().trim().min(1),
  presentation: operationPresentationSchema,
  runtime: operationRuntimeSchema.optional(),
}).strict()

export const operationDefinitionListSchema = z.object({
  operations: z.array(operationDefinitionSchema),
}).strict()

export const operationDefinitionListResponseSchema = successEnvelopeSchema(operationDefinitionListSchema)

/** 查询一组 artifact（画布多选）可用的操作集合。 */
export const availableOperationsRequestSchema = z
  .object({
    projectId: idSchema,
    artifactIds: z.array(idSchema).min(1).max(10),
  })
  .strict()
export type AvailableOperationsRequest = z.infer<typeof availableOperationsRequestSchema>

export type OperationDefinition = z.infer<typeof operationDefinitionSchema>
