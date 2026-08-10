import { z } from 'zod'

import { idSchema, revisionSchema } from './common.js'

export const idempotencyKeySchema = idSchema

export function revisionedPatchSchema<TPatch extends z.ZodType>(patchSchema: TPatch) {
  return z
    .object({
      revision: revisionSchema,
      patch: patchSchema,
    })
    .strict()
}

export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>
