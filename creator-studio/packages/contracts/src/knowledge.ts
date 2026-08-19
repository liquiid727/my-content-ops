import { z } from 'zod'

import { idSchema, isoDateTimeSchema } from './common.js'
import { successEnvelopeSchema } from './envelopes.js'

export const knowledgeKindSchema = z.enum(['document', 'spreadsheet', 'image', 'audio', 'video', 'other'])
export const knowledgeSourceSchema = z.object({
  id: idSchema,
  connectionId: idSchema,
  connectionType: z.enum(['obsidian', 'folder', 'lark']),
  ref: z.string().min(1),
  title: z.string().min(1),
  kind: knowledgeKindSchema,
  mimeType: z.string().nullable(),
  excerpt: z.string(),
  sourceUrl: z.string().nullable(),
  sourceVersion: z.string().nullable(),
  modifiedAt: isoDateTimeSchema.nullable(),
  readAt: isoDateTimeSchema.nullable(),
  indexedAt: isoDateTimeSchema.nullable(),
  projectIds: z.array(idSchema),
}).strict()

export const knowledgeSourceDetailSchema = knowledgeSourceSchema.extend({
  text: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  cached: z.boolean(),
}).strict()

export const knowledgeSearchQuerySchema = z.object({
  q: z.string().trim().max(500).default(''),
  connectionId: idSchema.optional(),
  projectId: idSchema.optional(),
  kind: knowledgeKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict()
export const knowledgeSearchResponseSchema = successEnvelopeSchema(z.object({ results: z.array(knowledgeSourceSchema) }).strict())
export const knowledgeSourceEntityResponseSchema = successEnvelopeSchema(knowledgeSourceSchema)
export const knowledgeSourceResponseSchema = successEnvelopeSchema(knowledgeSourceDetailSchema)
export const bindProjectSourceSchema = z.object({ sourceId: idSchema }).strict()
export const projectSourceListResponseSchema = successEnvelopeSchema(z.object({ sources: z.array(knowledgeSourceSchema) }).strict())
export const refreshKnowledgeSourceResponseSchema = successEnvelopeSchema(z.object({ taskId: idSchema }).strict())
export const unbindProjectSourceResponseSchema = successEnvelopeSchema(z.object({ deleted: z.literal(true) }).strict())

export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>
export type KnowledgeSourceDetail = z.infer<typeof knowledgeSourceDetailSchema>
export type KnowledgeSearchQuery = z.infer<typeof knowledgeSearchQuerySchema>
