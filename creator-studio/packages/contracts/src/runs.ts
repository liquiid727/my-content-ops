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
  sourceArtifactIds: z.array(idSchema).default([]),
  inputVersionIds: z.array(idSchema).default([]),
  knowledgeSourceIds: z.array(idSchema).default([]),
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

/** 创建 Run（async）。idempotencyKey 必须为 ULID。sourceArtifactIds 为多源生成（画布多选），sourceArtifactId 为主源（向后兼容单源）。 */
export const createRunSchema = z
  .object({
    projectId: idSchema,
    sourceArtifactId: idSchema.nullable().optional(),
    sourceArtifactIds: z.array(idSchema).min(1).max(10).optional(),
    inputVersionIds: z.array(idSchema).default([]),
    knowledgeSourceIds: z.array(idSchema).default([]),
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
    /** create 类操作在 Run 创建时即落地的占位输出 artifact（loading 节点）。 */
    outputArtifactIds: z.array(idSchema).default([]),
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
