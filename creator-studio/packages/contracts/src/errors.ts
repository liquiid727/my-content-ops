import { z } from 'zod'

import { revisionSchema } from './common.js'
import { apiErrorSchema } from './envelopes.js'

export const PROJECT_REVISION_CONFLICT_CODE = 'PROJECT_REVISION_CONFLICT' as const

export const projectRevisionConflictDetailsSchema = z
  .object({
    currentRevision: revisionSchema,
  })
  .strict()

export const projectRevisionConflictErrorSchema = apiErrorSchema
  .extend({
    code: z.literal(PROJECT_REVISION_CONFLICT_CODE),
    retryable: z.literal(false),
    details: projectRevisionConflictDetailsSchema,
  })
  .strict()

export type ProjectRevisionConflictDetails = z.infer<typeof projectRevisionConflictDetailsSchema>

export const REVISION_CONFLICT_CODE = 'REVISION_CONFLICT' as const

export const revisionConflictDetailsSchema = z
  .object({
    currentRevision: revisionSchema,
  })
  .strict()

export const revisionConflictErrorSchema = apiErrorSchema
  .extend({
    code: z.literal(REVISION_CONFLICT_CODE),
    retryable: z.literal(false),
    details: revisionConflictDetailsSchema,
  })
  .strict()

export type RevisionConflictDetails = z.infer<typeof revisionConflictDetailsSchema>
