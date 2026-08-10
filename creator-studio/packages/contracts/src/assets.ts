import { z } from 'zod'

import { idSchema, isoDateTimeSchema, paginationQuerySchema } from './common.js'
import { listEnvelopeSchema, successEnvelopeSchema } from './envelopes.js'

export const assetKindSchema = z.enum(['image', 'audio', 'video', 'document', 'other'])
export const assetNameSchema = z.string().trim().min(1).max(255)
export const assetMimeTypeSchema = z.string().trim().min(1).max(127)

export const assetSchema = z.object({
  id: idSchema,
  projectId: idSchema.nullable(),
  type: assetKindSchema,
  name: assetNameSchema,
  mimeType: assetMimeTypeSchema,
  size: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  contentUrl: z.string().startsWith('/api/v1/assets/'),
  thumbnailUrl: z.string().startsWith('/api/v1/assets/').nullable(),
  createdAt: isoDateTimeSchema,
}).strict()

export const assetListQuerySchema = paginationQuerySchema.extend({
  projectId: idSchema.optional(),
  type: assetKindSchema.optional(),
}).strict()

export const assetUploadFieldsSchema = z.object({ projectId: idSchema.optional() }).strict()
export const assetResponseSchema = successEnvelopeSchema(assetSchema)
export const assetListResponseSchema = listEnvelopeSchema(assetSchema)

export type Asset = z.infer<typeof assetSchema>
export type AssetKind = z.infer<typeof assetKindSchema>

