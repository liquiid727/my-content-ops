import { z } from 'zod'

import { idSchema } from './common.js'
import { successEnvelopeSchema } from './envelopes.js'

export const themePreferenceSchema = z.enum(['dark', 'light', 'system'])
export const localePreferenceSchema = z.enum(['zh-CN', 'en-US'])

export const creatorPreferencesSchema = z
  .object({
    theme: themePreferenceSchema.default('light'),
    locale: localePreferenceSchema.default('zh-CN'),
  })
  .passthrough()

export const updateCreatorPreferencesSchema = z
  .object({
    theme: themePreferenceSchema.optional(),
    locale: localePreferenceSchema.optional(),
  })
  .strict()
  .refine((preferences) => preferences.theme !== undefined || preferences.locale !== undefined, {
    message: 'At least one preference is required',
  })
export const creatorProfileSchema = z.object({
  id: idSchema,
  displayName: z.string().min(1),
  preferences: creatorPreferencesSchema,
}).strict()

export const bootstrapTaskSchema = z
  .object({
    id: idSchema,
    type: z.string().min(1),
    status: z.enum(['queued', 'running', 'waiting_review']),
    progress: z.number().int().min(0).max(100),
  })
  .strict()

const configSummarySchema = z
  .object({
    key: z.string().min(1),
    displayName: z.string().min(1),
    configured: z.boolean(),
    enabled: z.boolean(),
  })
  .strict()

export const bootstrapDataSchema = z
  .object({
    workspace: z.object({ id: idSchema, name: z.string().min(1) }).strict(),
    creatorProfile: creatorProfileSchema,
    activeTasks: z.array(bootstrapTaskSchema),
    capabilities: z.object({ connectors: z.boolean(), providers: z.boolean() }).strict(),
    settings: z
      .object({
        providers: z.array(configSummarySchema),
        connectors: z.array(configSummarySchema),
      })
      .strict(),
  })
  .strict()

export const bootstrapResponseSchema = successEnvelopeSchema(bootstrapDataSchema)
export const creatorProfileResponseSchema = successEnvelopeSchema(creatorProfileSchema)

export type BootstrapData = z.infer<typeof bootstrapDataSchema>
export type CreatorPreferences = z.infer<typeof creatorPreferencesSchema>
export type ThemePreference = z.infer<typeof themePreferenceSchema>
export type LocalePreference = z.infer<typeof localePreferenceSchema>
