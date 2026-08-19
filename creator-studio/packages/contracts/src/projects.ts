import { z } from 'zod'

import { idSchema, isoDateTimeSchema, paginationQuerySchema, revisionSchema } from './common.js'
import { listEnvelopeSchema, successEnvelopeSchema } from './envelopes.js'
import { revisionedPatchSchema } from './protocol.js'

export const projectStatusSchema = z.enum(['draft', 'active', 'archived'])
export const projectContentTypeSchema = z.string().trim().min(1).max(80)
export const projectTitleSchema = z.string().trim().min(1).max(160)
export const projectBriefSchema = z.string().trim().max(5000)
export const projectTargetPlatformSchema = z.string().trim().min(1).max(80)
export const projectTargetDurationMsSchema = z.number().int().min(1000).max(3_600_000)
export const projectStageSchema = z.enum(['idea', 'script'])

export const createProjectSchema = z
  .object({
    title: projectTitleSchema,
    contentType: projectContentTypeSchema,
    brief: projectBriefSchema.default(''),
    targetPlatform: projectTargetPlatformSchema.nullable().optional(),
    targetDurationMs: projectTargetDurationMsSchema.nullable().optional(),
    personalStyleId: idSchema.optional(),
  })
  .strict()

export const projectPatchSchema = z
  .object({
    title: projectTitleSchema.optional(),
    brief: projectBriefSchema.optional(),
    contentType: projectContentTypeSchema.optional(),
    status: projectStatusSchema.exclude(['archived']).optional(),
    targetPlatform: projectTargetPlatformSchema.nullable().optional(),
    targetDurationMs: projectTargetDurationMsSchema.nullable().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'At least one project field is required' })

export const updateProjectSchema = revisionedPatchSchema(projectPatchSchema)
export const archiveProjectSchema = z.object({ revision: revisionSchema }).strict()

export const projectListQuerySchema = paginationQuerySchema
  .extend({ status: projectStatusSchema.optional() })
  .strict()

export const projectSchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    title: projectTitleSchema,
    brief: projectBriefSchema,
    status: projectStatusSchema,
    stage: projectStageSchema,
    contentType: projectContentTypeSchema,
    targetPlatform: projectTargetPlatformSchema.nullable(),
    targetDurationMs: projectTargetDurationMsSchema.nullable(),
    graphId: idSchema.nullable(),
    contextId: idSchema.nullable(),
    personalStyleId: idSchema.nullable(),
    revision: revisionSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict()

export const projectTaskSummarySchema = z
  .object({
    id: idSchema,
    type: z.string().min(1),
    status: z.enum(['queued', 'running', 'waiting_review', 'completed', 'failed', 'cancelled']),
    progress: z.number().int().min(0).max(100),
  })
  .strict()

export const projectAssetSummarySchema = z
  .object({
    id: idSchema,
    kind: z.enum(['image', 'audio', 'video', 'document', 'other']),
    displayName: z.string().min(1),
    createdAt: isoDateTimeSchema,
  })
  .strict()

export const projectVersionSummarySchema = z
  .object({
    id: idSchema,
    subjectType: z.enum(['idea', 'topic', 'script', 'rhythm_plan', 'shot', 'asset']),
    versionNumber: z.number().int().positive(),
    createdAt: isoDateTimeSchema,
  })
  .strict()

export const projectPipelineItemSchema = z
  .object({
    stage: projectStageSchema,
    status: z.enum(['not_started', 'in_progress', 'completed']),
    resultRef: idSchema.nullable(),
  })
  .strict()

export const projectOverviewSchema = z
  .object({
    project: projectSchema,
    pipeline: z.array(projectPipelineItemSchema),
    activeTasks: z.array(projectTaskSummarySchema),
    latestAssets: z.array(projectAssetSummarySchema),
    latestVersions: z.array(projectVersionSummarySchema),
    nextAction: z
      .object({ type: z.literal('generate_topics'), label: z.string().min(1) })
      .strict(),
  })
  .strict()

export const projectResponseSchema = successEnvelopeSchema(projectSchema)
export const projectListResponseSchema = listEnvelopeSchema(projectSchema)
export const projectOverviewResponseSchema = successEnvelopeSchema(projectOverviewSchema)

export type CreateProject = z.infer<typeof createProjectSchema>
export type ProjectPatch = z.infer<typeof projectPatchSchema>
export type Project = z.infer<typeof projectSchema>
export type ProjectOverview = z.infer<typeof projectOverviewSchema>
export type ProjectStatus = z.infer<typeof projectStatusSchema>

