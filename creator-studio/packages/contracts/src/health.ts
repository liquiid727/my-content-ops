import { z } from 'zod'

import { successEnvelopeSchema } from './envelopes.js'

export const healthComponentStatusSchema = z.enum(['ready', 'unhealthy'])

export const healthDataSchema = z
  .object({
    status: z.enum(['ok', 'unhealthy']),
    version: z.string().min(1),
    database: healthComponentStatusSchema,
    migrations: healthComponentStatusSchema,
  })
  .strict()

export const healthResponseSchema = successEnvelopeSchema(healthDataSchema)

export type HealthComponentStatus = z.infer<typeof healthComponentStatusSchema>
export type HealthData = z.infer<typeof healthDataSchema>
export type HealthResponse = z.infer<typeof healthResponseSchema>
