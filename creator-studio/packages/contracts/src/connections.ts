import { z } from 'zod'

import { idSchema, isoDateTimeSchema } from './common.js'
import { successEnvelopeSchema } from './envelopes.js'

export const connectionTypeSchema = z.enum(['obsidian', 'folder', 'lark'])
export const connectionStatusSchema = z.enum(['not_configured', 'installing', 'auth_required', 'ready', 'error'])

export const connectionSchema = z.object({
  id: idSchema,
  type: connectionTypeSchema,
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  status: connectionStatusSchema,
  config: z.record(z.string(), z.unknown()),
  capabilities: z.array(z.enum(['browse', 'search', 'read'])),
  lastCheckedAt: isoDateTimeSchema.nullable(),
  lastError: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict()

export const connectionListResponseSchema = successEnvelopeSchema(z.object({ connections: z.array(connectionSchema) }).strict())
export const connectionResponseSchema = successEnvelopeSchema(connectionSchema)
export const createConnectionSchema = z.object({
  type: connectionTypeSchema,
  name: z.string().trim().min(1).max(100),
  config: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
}).strict()
export const updateConnectionSchema = createConnectionSchema.partial().strict()
export const resourceConnectionCheckResponseSchema = successEnvelopeSchema(z.object({
  ok: z.boolean(),
  status: connectionStatusSchema,
  message: z.string(),
}).strict())
export const connectionActionResponseSchema = successEnvelopeSchema(z.object({ taskId: idSchema }).strict())
export const connectionAuthStartResponseSchema = successEnvelopeSchema(z.object({
  taskId: idSchema.nullable(),
  authorizationUrl: z.string().url().nullable(),
  phase: z.enum(['app_setup', 'user_auth']),
}).strict())
export const deleteConnectionResponseSchema = successEnvelopeSchema(z.object({ deleted: z.literal(true) }).strict())
export const directoryPickerResponseSchema = successEnvelopeSchema(z.object({ path: z.string().min(1).max(4096) }).strict())

export type ResourceConnection = z.infer<typeof connectionSchema>
export type ConnectionType = z.infer<typeof connectionTypeSchema>
export type CreateConnection = z.infer<typeof createConnectionSchema>
export type UpdateConnection = z.infer<typeof updateConnectionSchema>
