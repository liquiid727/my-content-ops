import { z } from 'zod'

import { idSchema, isoDateTimeSchema } from './common.js'
import { listEnvelopeSchema, successEnvelopeSchema } from './envelopes.js'

export const runStatusSchema = z.enum(['queued', 'running', 'waiting_review', 'completed', 'failed', 'cancelled'])
export type RunStatus = z.infer<typeof runStatusSchema>

export const runErrorSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string(),
}).strict()
export type RunError = z.infer<typeof runErrorSchema>

export const runSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  taskId: idSchema,
  operationId: z.string().trim().min(1),
  sourceArtifactId: idSchema.nullable(),
  inputVersionIds: z.array(idSchema).default([]),
  outputVersionIds: z.array(idSchema).nullable(),
  outputArtifactIds: z.array(idSchema).nullable(),
  status: runStatusSchema,
  progress: z.number().int().min(0).max(100).default(0),
  config: z.record(z.string(), z.unknown()).default({}),
  error: runErrorSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict()

export const runResponseSchema = successEnvelopeSchema(runSchema)
export const runListResponseSchema = listEnvelopeSchema(runSchema)

/** 创建 Run（async）。idempotencyKey 必须为 ULID。 */
export const createRunSchema = z
  .object({
    projectId: idSchema,
    sourceArtifactId: idSchema.nullable().optional(),
    inputVersionIds: z.array(idSchema).default([]),
    config: z.record(z.string(), z.unknown()).default({}),
    idempotencyKey: idSchema,
  })
  .strict()
export type CreateRun = z.infer<typeof createRunSchema>

export const createRunResultSchema = z
  .object({
    runId: idSchema,
    taskId: idSchema,
    status: runStatusSchema,
  })
  .strict()
export const createRunResponseSchema = successEnvelopeSchema(createRunResultSchema)
export type CreateRunResult = z.infer<typeof createRunResultSchema>

export const retryRunSchema = z
  .object({
    idempotencyKey: idSchema,
  })
  .strict()
export type RetryRun = z.infer<typeof retryRunSchema>

export type Run = z.infer<typeof runSchema>
