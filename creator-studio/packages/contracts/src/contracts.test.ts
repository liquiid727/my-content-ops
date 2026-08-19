import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  bootstrapResponseSchema,
  createProjectSchema,
  errorEnvelopeSchema,
  fieldValidationDetailsSchema,
  healthResponseSchema,
  idSchema,
  listEnvelopeSchema,
  paginationQuerySchema,
  PROJECT_REVISION_CONFLICT_CODE,
  projectRevisionConflictErrorSchema,
  revisionedPatchSchema,
  serializeIsoDateTime,
  successEnvelopeSchema,
  updateCreatorPreferencesSchema,
} from './index.js'

const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

describe('shared contracts', () => {
  it('validates IDs, UTC timestamps and pagination limits', () => {
    expect(idSchema.parse(REQUEST_ID)).toBe(REQUEST_ID)
    expect(serializeIsoDateTime(new Date('2026-08-09T09:00:00.000Z'))).toBe('2026-08-09T09:00:00.000Z')
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 30 })
    expect(paginationQuerySchema.parse({ cursor: REQUEST_ID, limit: '100' })).toEqual({
      cursor: REQUEST_ID,
      limit: 100,
    })
    expect(paginationQuerySchema.safeParse({ limit: 101 }).success).toBe(false)
  })

  it('validates success, list, health and error envelopes', () => {
    const projectSchema = z.object({ id: idSchema, title: z.string() }).strict()

    expect(
      successEnvelopeSchema(projectSchema).parse({
        data: { id: REQUEST_ID, title: 'First project' },
        meta: { requestId: REQUEST_ID },
      }),
    ).toBeTruthy()
    expect(
      listEnvelopeSchema(projectSchema).parse({
        data: [],
        meta: { requestId: REQUEST_ID, hasMore: false },
      }),
    ).toBeTruthy()
    expect(
      healthResponseSchema.parse({
        data: { status: 'ok', version: '0.1.0', database: 'ready', migrations: 'ready' },
        meta: { requestId: REQUEST_ID },
      }),
    ).toBeTruthy()
    expect(
      errorEnvelopeSchema.parse({
        error: { code: 'VALIDATION_FAILED', message: 'Invalid input', retryable: false },
        meta: { requestId: REQUEST_ID },
      }),
    ).toBeTruthy()
  })

  it('exposes field-level validation details', () => {
    expect(
      fieldValidationDetailsSchema.parse({
        issues: [{ path: ['title'], code: 'too_small', message: 'Title is required' }],
      }),
    ).toBeTruthy()
  })

  it('requires positive revisions and a schema-constrained patch', () => {
    const updateSchema = revisionedPatchSchema(z.object({ title: z.string().min(1) }).strict())

    expect(updateSchema.parse({ revision: 3, patch: { title: 'Updated' } })).toEqual({
      revision: 3,
      patch: { title: 'Updated' },
    })
    expect(updateSchema.safeParse({ revision: 0, patch: { title: 'Updated' } }).success).toBe(false)
    expect(updateSchema.safeParse({ revision: 3, patch: { title: '' } }).success).toBe(false)
  })

  it('defines the domain-specific project revision conflict contract', () => {
    expect(
      projectRevisionConflictErrorSchema.parse({
        code: PROJECT_REVISION_CONFLICT_CODE,
        message: '项目已在其他位置更新，请刷新后重试。',
        retryable: false,
        details: { currentRevision: 8 },
      }),
    ).toMatchObject({ code: 'PROJECT_REVISION_CONFLICT', details: { currentRevision: 8 } })

    expect(
      projectRevisionConflictErrorSchema.safeParse({
        code: 'REVISION_CONFLICT',
        message: 'stale',
        retryable: false,
        details: { currentRevision: 8 },
      }).success,
    ).toBe(false)
  })

  it('shares Project title, brief, content type, status and duration constraints', () => {
    expect(createProjectSchema.parse({ title: '  First Project  ', brief: '  Clear brief  ', contentType: 'short_video' })).toEqual({
      title: 'First Project',
      brief: 'Clear brief',
      contentType: 'short_video',
    })
    expect(createProjectSchema.safeParse({ title: '', contentType: 'short_video' }).success).toBe(false)
    expect(createProjectSchema.safeParse({ title: 'Project', contentType: '', targetDurationMs: 999 }).success).toBe(false)
    expect(createProjectSchema.safeParse({ title: 'Project', contentType: 'video', targetDurationMs: 3_600_001 }).success).toBe(false)
  })

  it('validates bootstrap identity, preferences, capabilities and redacted settings', () => {
    expect(
      bootstrapResponseSchema.parse({
        data: {
          workspace: { id: REQUEST_ID, name: '个人创作空间' },
          creatorProfile: { id: REQUEST_ID, displayName: '创作者', preferences: { theme: 'dark' } },
          activeTasks: [],
          capabilities: { connectors: false, providers: false },
          settings: { providers: [], connectors: [] },
        },
        meta: { requestId: REQUEST_ID },
      }),
    ).toBeTruthy()

    const parsed = bootstrapResponseSchema.parse({
      data: {
        workspace: { id: REQUEST_ID, name: '个人创作空间' },
        creatorProfile: { id: REQUEST_ID, displayName: '创作者', preferences: { theme: 'dark' } },
        activeTasks: [], capabilities: { connectors: false, providers: false }, settings: { providers: [], connectors: [] },
      },
      meta: { requestId: REQUEST_ID },
    })
    expect(parsed.data.creatorProfile.preferences.locale).toBe('zh-CN')
    expect(updateCreatorPreferencesSchema.parse({ locale: 'en-US' })).toEqual({ locale: 'en-US' })
    expect(updateCreatorPreferencesSchema.parse({ theme: 'system' })).toEqual({ theme: 'system' })
    expect(updateCreatorPreferencesSchema.safeParse({}).success).toBe(false)
    expect(updateCreatorPreferencesSchema.safeParse({ locale: 'fr-FR' }).success).toBe(false)
  })
})
