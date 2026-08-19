import { z } from 'zod'

import { cursorSchema, requestIdSchema } from './common.js'

export const responseMetaSchema = z
  .object({
    requestId: requestIdSchema,
  })
  .strict()

export const listResponseMetaSchema = responseMetaSchema
  .extend({
    nextCursor: cursorSchema.optional(),
    hasMore: z.boolean(),
  })
  .strict()

export const fieldValidationIssueSchema = z
  .object({
    path: z.array(z.union([z.string(), z.number()])),
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict()

export const fieldValidationDetailsSchema = z
  .object({
    issues: z.array(fieldValidationIssueSchema).min(1),
  })
  .strict()

export const apiErrorSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    message: z.string().min(1),
    retryable: z.boolean(),
    details: z.unknown().optional(),
  })
  .strict()

export const errorEnvelopeSchema = z
  .object({
    error: apiErrorSchema,
    meta: responseMetaSchema,
  })
  .strict()

export function successEnvelopeSchema<TData extends z.ZodType>(dataSchema: TData) {
  return z
    .object({
      data: dataSchema,
      meta: responseMetaSchema,
    })
    .strict()
}

export function listEnvelopeSchema<TItem extends z.ZodType>(itemSchema: TItem) {
  return z
    .object({
      data: z.array(itemSchema),
      meta: listResponseMetaSchema,
    })
    .strict()
}

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>
export type FieldValidationDetails = z.infer<typeof fieldValidationDetailsSchema>
