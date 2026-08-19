import { z } from 'zod'

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

export const idSchema = z.string().regex(ULID_PATTERN, 'Expected an uppercase ULID')
export const requestIdSchema = idSchema
export const isoDateTimeSchema = z.string().datetime({ offset: false })
export const cursorSchema = z.string().min(1).max(512)
export const revisionSchema = z.number().int().positive()
export const jsonValueSchema = z.json()

export const paginationQuerySchema = z
  .object({
    cursor: cursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict()

export function serializeIsoDateTime(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    throw new TypeError('Cannot serialize an invalid date')
  }

  return isoDateTimeSchema.parse(value.toISOString())
}

export type EntityId = z.infer<typeof idSchema>
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>
export type PaginationQuery = z.infer<typeof paginationQuerySchema>
