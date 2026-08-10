import { z } from 'zod'

import { idSchema, isoDateTimeSchema, revisionSchema } from './common.js'
import { listEnvelopeSchema, successEnvelopeSchema } from './envelopes.js'
import { revisionedPatchSchema } from './protocol.js'

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
  revision: revisionSchema.default(1),
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

/** Artifact 摘要 + 当前版本摘要（`GET /artifacts/:id`）。 */
export const artifactDetailSchema = artifactSchema.extend({
  currentVersion: artifactVersionSchema.nullable(),
}).strict()
export const artifactDetailResponseSchema = successEnvelopeSchema(artifactDetailSchema)

export const artifactVersionListResponseSchema = listEnvelopeSchema(artifactVersionSchema)

/** 手动编辑当前内容 → 新 Version(source=user)。 */
export const artifactPatchSchema = z
  .object({
    text: z.string().max(1_000_000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'At least one artifact field is required' })
export type ArtifactPatch = z.infer<typeof artifactPatchSchema>
export const updateArtifactSchema = revisionedPatchSchema(artifactPatchSchema)
export type UpdateArtifact = z.infer<typeof updateArtifactSchema>

/** 恢复历史版本为 current（不删历史链）。 */
export const restoreArtifactVersionSchema = z
  .object({
    versionId: idSchema,
  })
  .strict()
export type RestoreArtifactVersion = z.infer<typeof restoreArtifactVersionSchema>

export type Artifact = z.infer<typeof artifactSchema>
export type ArtifactVersion = z.infer<typeof artifactVersionSchema>
export type ArtifactDetail = z.infer<typeof artifactDetailSchema>
