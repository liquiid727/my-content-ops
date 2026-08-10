import { z } from 'zod'

import { idSchema, isoDateTimeSchema } from './common.js'
import { successEnvelopeSchema } from './envelopes.js'

export const canvasNodeSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  artifactId: idSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nullable(),
  height: z.number().finite().nullable(),
  collapsed: z.boolean().default(false),
  zIndex: z.number().int().default(0),
  renderer: z.string().trim().min(1).default('TextNode'),
  updatedAt: isoDateTimeSchema,
}).strict()

export const edgeSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  sourceArtifactId: idSchema,
  targetArtifactId: idSchema,
  inputSlot: z.string().trim().min(1),
  createdAt: isoDateTimeSchema,
}).strict()

export const graphSchema = z.object({
  nodes: z.array(canvasNodeSchema),
  edges: z.array(edgeSchema),
}).strict()

export const canvasNodeResponseSchema = successEnvelopeSchema(canvasNodeSchema)
export const edgeResponseSchema = successEnvelopeSchema(edgeSchema)
export const graphResponseSchema = successEnvelopeSchema(graphSchema)

export type CanvasNode = z.infer<typeof canvasNodeSchema>
export type Edge = z.infer<typeof edgeSchema>
export type Graph = z.infer<typeof graphSchema>
