import { z } from 'zod'

import { idSchema, isoDateTimeSchema, revisionSchema } from './common.js'
import { successEnvelopeSchema } from './envelopes.js'
import { revisionedPatchSchema } from './protocol.js'

/**
 * Personal Style 契约（spec §3.2 / §3.4）。
 *
 * 由 creator-profile feature 全权定义，canvas-runtime 的 Project 绑定（`personalStyleId`）
 * 与 Context Assembly 消费（`renderContext(profile, injection, scope)`）。跨 feature 契约：
 * 本模块的 schema/类型一旦稳定，其他 feature 只引用不重定义。
 */

export const sectionKeySchema = z.enum(['identity', 'positioning', 'audience', 'voice', 'knowledge', 'memory', 'rules'])
export type SectionKey = z.infer<typeof sectionKeySchema>

export const sectionKeys = sectionKeySchema.options

export const creatorIdentitySchema = z
  .object({
    creatorName: z.string().trim().default(''),
    nicknames: z.record(z.string(), z.string()).default({}),
    currentRole: z.string().trim().optional(),
    background: z.string().trim().optional(),
    personalStory: z.string().trim().optional(),
    mission: z.string().trim().optional(),
  })
  .passthrough()

export const positioningSchema = z
  .object({
    summary: z.string().trim().default(''),
    nicheTags: z.array(z.string().trim().min(1)).default([]),
    differentiation: z.string().trim().optional(),
    valueProposition: z.string().trim().optional(),
    channels: z.array(z.object({ platform: z.string().trim().min(1), focus: z.string().trim() }).strict()).default([]),
  })
  .passthrough()

export const audienceSchema = z
  .object({
    primaryAudience: z.string().trim().default(''),
    knowledgeLevel: z.string().trim().optional(),
    painPoints: z.array(z.string().trim().min(1)).default([]),
    goals: z.array(z.string().trim().min(1)).default([]),
  })
  .passthrough()

export const voiceSchema = z
  .object({
    tone: z
      .object({
        like: z.array(z.string().trim().min(1)).default([]),
        avoid: z.array(z.string().trim().min(1)).default([]),
      })
      .passthrough()
      .default({ like: [], avoid: [] }),
    writingStyle: z
      .object({
        preferredAspects: z.array(z.string().trim().min(1)).default([]),
        sentencePatterns: z.array(z.string().trim().min(1)).default([]),
      })
      .passthrough()
      .default({ preferredAspects: [], sentencePatterns: [] }),
    vocabulary: z
      .object({
        common: z.array(z.string().trim().min(1)).default([]),
        banned: z.array(z.string().trim().min(1)).default([]),
      })
      .passthrough()
      .default({ common: [], banned: [] }),
  })
  .passthrough()
  .default({ tone: { like: [], avoid: [] }, writingStyle: { preferredAspects: [], sentencePatterns: [] }, vocabulary: { common: [], banned: [] } })

export const knowledgeSchema = z
  .object({
    domains: z.array(z.string().trim().min(1)).default([]),
    toolsAndSkills: z.array(z.string().trim().min(1)).optional(),
    strengths: z.array(z.string().trim().min(1)).optional(),
  })
  .passthrough()

export const memorySchema = z
  .object({
    pastWorks: z
      .array(z.object({
        title: z.string().trim().min(1),
        platform: z.string().trim().optional(),
        reflections: z.string().trim().optional(),
      }).passthrough())
      .default([]),
    learnings: z.array(z.string().trim().min(1)).optional(),
  })
  .passthrough()

export const contentRulesSchema = z
  .object({
    principles: z.array(z.string().trim().min(1)).default([]),
    likedStructures: z.array(z.string().trim().min(1)).optional(),
    likedHooks: z.array(z.string().trim().min(1)).optional(),
    bannedWords: z.array(z.string().trim().min(1)).optional(),
  })
  .passthrough()

/** 七块画像内容 + `extra` 自由扩展。未知顶层键不报错（passthrough 保留，UI 不回写）。 */
export const personalStyleSchema = z
  .object({
    identity: creatorIdentitySchema.default({ creatorName: '', nicknames: {} }),
    positioning: positioningSchema.default({ summary: '', nicheTags: [], channels: [] }),
    audience: audienceSchema.default({ primaryAudience: '', painPoints: [], goals: [] }),
    voice: voiceSchema.default({ tone: { like: [], avoid: [] }, writingStyle: { preferredAspects: [], sentencePatterns: [] }, vocabulary: { common: [], banned: [] } }),
    knowledge: knowledgeSchema.default({ domains: [] }),
    memory: memorySchema.default({ pastWorks: [] }),
    rules: contentRulesSchema.default({ principles: [] }),
    extra: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

export type PersonalStyle = z.infer<typeof personalStyleSchema>
export type CreatorIdentity = z.infer<typeof creatorIdentitySchema>
export type Positioning = z.infer<typeof positioningSchema>
export type Audience = z.infer<typeof audienceSchema>
export type Voice = z.infer<typeof voiceSchema>
export type Knowledge = z.infer<typeof knowledgeSchema>
export type Memory = z.infer<typeof memorySchema>
export type ContentRules = z.infer<typeof contentRulesSchema>

/** Injection Settings（spec §3.4）：全局总开关 + 区块开关。 */
export const injectionSettingsSchema = z
  .object({
    enabled: z.boolean().default(true),
    sections: z
      .object({
        identity: z.boolean().default(true),
        positioning: z.boolean().default(true),
        audience: z.boolean().default(true),
        voice: z.boolean().default(true),
        knowledge: z.boolean().default(true),
        memory: z.boolean().default(false),
        rules: z.boolean().default(true),
      })
      .strict()
      .default({
        identity: true,
        positioning: true,
        audience: true,
        voice: true,
        knowledge: true,
        memory: false,
        rules: true,
      }),
  })
  .strict()

export type InjectionSettings = z.infer<typeof injectionSettingsSchema>

/** 注入场景，供 canvas-runtime Context Assembly 按场景选择。 */
export const injectScopeSchema = z.enum(['project', 'topic', 'outline', 'script', 'cover', 'voice', 'video', 'publish'])
export type InjectScope = z.infer<typeof injectScopeSchema>

export const creatorProfilePatchSchema = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    avatarAssetId: idSchema.nullable().optional(),
    bio: z.string().max(5000).optional(),
    profile: personalStyleSchema.optional(),
    injection: injectionSettingsSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'At least one creator profile field is required' })

export const updateCreatorProfileSchema = revisionedPatchSchema(creatorProfilePatchSchema)

export const creatorProfileEntitySchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    displayName: z.string().min(1),
    avatarAssetId: idSchema.nullable(),
    bio: z.string().max(5000).default(''),
    profile: personalStyleSchema,
    injection: injectionSettingsSchema,
    revision: revisionSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict()

export const creatorProfileEntityResponseSchema = successEnvelopeSchema(creatorProfileEntitySchema)

export const importProfileRequestSchema = z
  .object({
    vaultPath: z.string().trim().min(1).max(2048),
    targetSection: sectionKeySchema,
  })
  .strict()

export const importProfileResultSchema = z
  .object({
    profile: creatorProfileEntitySchema,
    imported: z.array(sectionKeySchema),
  })
  .strict()

export const importProfileResponseSchema = successEnvelopeSchema(importProfileResultSchema)

export const renderRequestSchema = z
  .object({
    profileId: idSchema.optional(),
    scope: injectScopeSchema,
  })
  .strict()

export const renderResultSchema = z.object({ text: z.string() }).strict()
export const renderResponseSchema = successEnvelopeSchema(renderResultSchema)

export type CreatorProfilePatch = z.infer<typeof creatorProfilePatchSchema>
export type UpdateCreatorProfile = z.infer<typeof updateCreatorProfileSchema>
export type CreatorProfileEntity = z.infer<typeof creatorProfileEntitySchema>
export type ImportProfileRequest = z.infer<typeof importProfileRequestSchema>
export type RenderRequest = z.infer<typeof renderRequestSchema>
