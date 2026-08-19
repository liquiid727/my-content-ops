import { z } from 'zod'
import { idSchema, isoDateTimeSchema, jsonValueSchema, paginationQuerySchema } from './common.js'
import { listEnvelopeSchema, successEnvelopeSchema } from './envelopes.js'

export const taskStatusSchema = z.enum(['queued', 'running', 'waiting_review', 'completed', 'failed', 'cancelled'])
export const seedTaskInputSchema = z.object({ prompt: z.string().trim().min(1).max(10_000) }).strict()
export const createTaskSchema = z.object({ projectId: idSchema.nullable().optional(), type: z.string().trim().min(1).max(100), input: jsonValueSchema }).strict()
export const taskSchema = z.object({
  id: idSchema, projectId: idSchema.nullable(), type: z.string().min(1), status: taskStatusSchema,
  progress: z.number().int().min(0).max(100), resultRef: z.object({ type: z.string().min(1), id: idSchema }).strict().nullable(),
  parentTaskId: idSchema.nullable(), retryCount: z.number().int().nonnegative(),
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict().nullable(),
  output: jsonValueSchema.nullable(), createdAt: isoDateTimeSchema, startedAt: isoDateTimeSchema.nullable(), finishedAt: isoDateTimeSchema.nullable(),
}).strict()
export const taskListQuerySchema = paginationQuerySchema.extend({
  active: z.enum(['true', 'false']).transform((value) => value === 'true').optional(), projectId: idSchema.optional(), type: z.string().trim().min(1).max(100).optional(),
}).strict()
export const taskResponseSchema = successEnvelopeSchema(taskSchema)
export const taskListResponseSchema = listEnvelopeSchema(taskSchema)
export const taskEventTypeSchema = z.enum(['task.created', 'task.updated', 'task.completed', 'task.failed', 'task.cancelled', 'stream.reset'])
export const taskEventDataSchema = z.object({
  taskId: idSchema,
  projectId: idSchema.nullable(),
  status: taskStatusSchema,
  progress: z.number().int().min(0).max(100),
  occurredAt: isoDateTimeSchema,
}).strict()
export type Task = z.infer<typeof taskSchema>
export type TaskStatus = z.infer<typeof taskStatusSchema>
export type TaskEventType = z.infer<typeof taskEventTypeSchema>
export type TaskEventData = z.infer<typeof taskEventDataSchema>
