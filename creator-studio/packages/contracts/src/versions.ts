import { z } from 'zod'

import { idSchema, isoDateTimeSchema, jsonValueSchema } from './common.js'
import { listEnvelopeSchema, successEnvelopeSchema } from './envelopes.js'

export const versionSubjectTypeSchema = z.enum(['idea', 'topic', 'script', 'rhythm_plan', 'shot', 'asset'])
export const versionSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  subjectType: versionSubjectTypeSchema,
  subjectId: idSchema,
  versionNumber: z.number().int().positive(),
  snapshot: jsonValueSchema,
  changeSummary: z.string().max(1000),
  isCurrent: z.boolean(),
  createdAt: isoDateTimeSchema,
}).strict()

export const versionListQuerySchema = z.object({ subjectType: versionSubjectTypeSchema.optional() }).strict()
export const versionResponseSchema = successEnvelopeSchema(versionSchema)
export const versionListResponseSchema = listEnvelopeSchema(versionSchema)

export type Version = z.infer<typeof versionSchema>
export type VersionSubjectType = z.infer<typeof versionSubjectTypeSchema>

