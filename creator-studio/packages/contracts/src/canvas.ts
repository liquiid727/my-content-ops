import { z } from 'zod'

import { artifactKindSchema, artifactSchema } from './artifacts.js'
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

/** 创建 CanvasNode：可绑定已有 artifact，或提供 kind+role 新建。 */
export const createNodeSchema = z
  .object({
    artifactId: idSchema.optional(),
    kind: artifactKindSchema.optional(),
    role: z.string().trim().min(1).optional(),
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict()
  .refine((input) => input.artifactId !== undefined || (input.kind !== undefined && input.role !== undefined), {
    message: 'Either artifactId or both kind and role are required',
  })
export type CreateNode = z.infer<typeof createNodeSchema>

export const createNodeResultSchema = z
  .object({
    node: canvasNodeSchema,
    artifact: artifactSchema.optional(),
  })
  .strict()
export const createNodeResponseSchema = successEnvelopeSchema(createNodeResultSchema)

/** 移动/改布局/折叠。 */
export const updateNodeSchema = z
  .object({
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().finite().nullable().optional(),
    height: z.number().finite().nullable().optional(),
    collapsed: z.boolean().optional(),
    zIndex: z.number().int().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'At least one node field is required' })
export type UpdateNode = z.infer<typeof updateNodeSchema>

/** 建 Edge：source → target + inputSlot（输入语义）。 */
export const createEdgeSchema = z
  .object({
    sourceArtifactId: idSchema,
    targetArtifactId: idSchema,
    inputSlot: z.string().trim().min(1),
  })
  .strict()
export type CreateEdge = z.infer<typeof createEdgeSchema>

export type CanvasNode = z.infer<typeof canvasNodeSchema>
export type Edge = z.infer<typeof edgeSchema>
export type Graph = z.infer<typeof graphSchema>
