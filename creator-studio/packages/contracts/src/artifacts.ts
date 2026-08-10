import { z } from 'zod'

import { idSchema, isoDateTimeSchema } from './common.js'
import { successEnvelopeSchema } from './envelopes.js'

/** Artifact 类型：text/image/audio/video/collection/action（业务语义由 role 表达）。 */
export const artifactKindSchema = z.enum(['text', 'image', 'audio', 'video', 'collection', 'action'])
export type ArtifactKind = z.infer<typeof artifactKindSchema>

/** 内容来源：AI 生成 / 用户手动 / 导入 / 系统。 */
export const artifactSourceSchema = z.enum(['ai', 'user', 'import', 'system'])
export type ArtifactSource = z.infer<typeof artifactSourceSchema>

/** 内容引用：媒体走 asset（二进制在 Foundation assets），文本可内联。 */
export const contentRefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('asset'), id: idSchema }).strict(),
  z.object({ type: z.literal('inline'), text: z.string().max(1_000_000) }).strict(),
])
export type ContentRef = z.infer<typeof contentRefSchema>

export const artifactSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  kind: artifactKindSchema,
  role: z.string().trim().min(1),
  currentVersionId: idSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict()

export const artifactVersionSchema = z.object({
  id: idSchema,
  artifactId: idSchema,
  versionNumber: z.number().int().positive(),
  parentVersionId: idSchema.nullable(),
  contentRef: contentRefSchema.nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  source: artifactSourceSchema,
  operationRunId: idSchema.nullable(),
  createdBy: idSchema,
  createdAt: isoDateTimeSchema,
}).strict()

export const artifactResponseSchema = successEnvelopeSchema(artifactSchema)
export const artifactVersionResponseSchema = successEnvelopeSchema(artifactVersionSchema)

export type Artifact = z.infer<typeof artifactSchema>
export type ArtifactVersion = z.infer<typeof artifactVersionSchema>
