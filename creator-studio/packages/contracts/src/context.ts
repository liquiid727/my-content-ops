import { z } from 'zod'

import { successEnvelopeSchema } from './envelopes.js'

export const contextLayerSchema = z.object({
  name: z.string().min(1),
  text: z.string(),
}).strict()

export const projectContextSchema = z.object({
  layers: z.array(contextLayerSchema),
  text: z.string(),
}).strict()

export const projectContextResponseSchema = successEnvelopeSchema(projectContextSchema)

export type ProjectContext = z.infer<typeof projectContextSchema>
