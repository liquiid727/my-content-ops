import { z } from 'zod'
import { isoDateTimeSchema } from './common.js'
import { successEnvelopeSchema } from './envelopes.js'

const checkSchema = z.object({ status: z.enum(['ok', 'error']).nullable(), checkedAt: isoDateTimeSchema.nullable() }).strict()
export const providerSettingSchema = z.object({ key: z.string().min(1), displayName: z.string().min(1), enabled: z.boolean(), configured: z.boolean(), config: z.object({ model: z.string().optional() }).passthrough(), check: checkSchema }).strict()
export const connectorSettingSchema = z.object({ key: z.enum(['lark_cli', 'obsidian']), displayName: z.string().min(1), enabled: z.boolean(), configured: z.boolean(), config: z.record(z.string(), z.unknown()), check: checkSchema, availability: z.literal('stub_only') }).strict()
export const settingsSchema = z.object({ providers: z.array(providerSettingSchema), connectors: z.array(connectorSettingSchema) }).strict()
export const settingsResponseSchema = successEnvelopeSchema(settingsSchema)
export const saveProviderSettingSchema = z.object({ displayName: z.string().trim().min(1).max(100), enabled: z.boolean(), model: z.string().trim().max(100).optional(), baseUrl: z.string().trim().max(500).optional(), credential: z.string().min(1).max(10_000).optional() }).strict()
export const saveLarkSettingSchema = z.object({ enabled: z.boolean(), command: z.string().trim().min(1).max(500), args: z.array(z.string().max(500)).max(20), credential: z.string().min(1).max(10_000).optional() }).strict()
export const saveObsidianSettingSchema = z.object({ enabled: z.boolean(), vaultRoot: z.string().trim().min(1).max(4096), credential: z.string().min(1).max(10_000).optional() }).strict()
export const connectionCheckSchema = z.object({ ok: z.boolean(), mode: z.literal('stub'), message: z.string().min(1) }).strict()
export const connectionCheckResponseSchema = successEnvelopeSchema(connectionCheckSchema)
export type SettingsData = z.infer<typeof settingsSchema>

