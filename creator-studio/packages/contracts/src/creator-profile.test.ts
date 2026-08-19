import { describe, expect, it } from 'vitest'

import {
  creatorProfileEntitySchema,
  creatorProfilePatchSchema,
  importProfileRequestSchema,
  injectScopeSchema,
  injectionSettingsSchema,
  personalStyleSchema,
  renderRequestSchema,
  sectionKeySchema,
  updateCreatorProfileSchema,
} from './creator-profile.js'

const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'

const FULL_PROFILE = {
  identity: {
    creatorName: '阿篓',
    nicknames: { 公众号: 'AI晚点', 抖音: '阿篓的AI篓子' },
    currentRole: 'AI 应用独立开发者',
    background: '白天写代码，晚上写 AI 内容。',
  },
  positioning: {
    summary: '面向普通人的 AI 应用开发与工具测评。',
    nicheTags: ['AI Coding', 'AI工具', '独立开发'],
  },
  audience: {
    primaryAudience: '想用 AI 提升效率的普通人',
    painPoints: ['不知道从哪开始', '怕被割韭菜'],
    goals: ['学会搭一个自己的 AI 小工具'],
  },
  voice: {
    tone: { like: ['轻松', '口语化'], avoid: ['营销感', '鸡汤感'] },
    writingStyle: { preferredAspects: ['第一人称'], sentencePatterns: ['先问后析结'] },
    vocabulary: { common: ['干就完了'], banned: ['赋能'] },
  },
  knowledge: { domains: ['AI 应用开发'], toolsAndSkills: ['Cursor', 'Claude'] },
  memory: { pastWorks: [{ title: '普通人如何搭建第一个 AI Agent', platform: '公众号' }] },
  rules: { principles: ['故事优先', '不写口水文'], likedHooks: ['反差开头'] },
}

describe('creator-profile Personal Style contract', () => {
  it('parses a full seven-block personal style and preserves free-form extra keys', () => {
    const parsed = personalStyleSchema.parse({
      ...FULL_PROFILE,
      extra: { kpi: { followers: 12000 } },
      customTopLevelKey: 'kept-through-passthrough',
    })

    expect(parsed.identity.creatorName).toBe('阿篓')
    expect(parsed.positioning.nicheTags).toEqual(['AI Coding', 'AI工具', '独立开发'])
    expect(parsed.voice.vocabulary.banned).toEqual(['赋能'])
    expect(parsed.extra).toEqual({ kpi: { followers: 12000 } })
  })

  it('tolerates unknown top-level keys without erroring (extra free extension)', () => {
    expect(personalStyleSchema.safeParse({ ...FULL_PROFILE, futureField: { nested: true } }).success).toBe(true)
  })

  it('defaults an empty profile into the seven empty blocks', () => {
    const parsed = personalStyleSchema.parse({})

    expect(parsed.identity).toEqual({ creatorName: '', nicknames: {} })
    expect(parsed.positioning).toMatchObject({ summary: '', nicheTags: [] })
    expect(parsed.voice).toMatchObject({ tone: { like: [], avoid: [] }, vocabulary: { common: [], banned: [] } })
    expect(parsed.rules).toMatchObject({ principles: [] })
  })

  it('rejects malformed structured fields', () => {
    expect(personalStyleSchema.safeParse({ ...FULL_PROFILE, voice: { tone: 'bubbly' } }).success).toBe(false)
    expect(personalStyleSchema.safeParse({ ...FULL_PROFILE, positioning: { summary: '', nicheTags: [123] } }).success).toBe(false)
  })

  it('validates injection settings with a global switch and per-section toggles', () => {
    const settings = injectionSettingsSchema.parse({ enabled: false, sections: { voice: false } })

    expect(settings.enabled).toBe(false)
    expect(settings.sections.voice).toBe(false)
    expect(settings.sections.identity).toBe(true)
    expect(injectionSettingsSchema.safeParse({ enabled: true, sections: { unknownSection: true } }).success).toBe(false)
  })

  it('constrains inject scopes to the supported scene set', () => {
    expect(injectScopeSchema.parse('project')).toBe('project')
    expect(injectScopeSchema.parse('script')).toBe('script')
    expect(injectScopeSchema.safeParse('meta').success).toBe(false)
    expect(sectionKeySchema.options).toContain('memory')
  })

  it('accepts a revisioned patch carrying profile and injection', () => {
    const patch = updateCreatorProfileSchema.parse({
      revision: 2,
      patch: { profile: FULL_PROFILE, injection: { enabled: true, sections: {} } },
    })

    expect(patch.revision).toBe(2)
    expect(patch.patch.profile.identity.creatorName).toBe('阿篓')
    expect(creatorProfilePatchSchema.safeParse({}).success).toBe(false)
  })

  it('validates the full entity response shape', () => {
    const entity = creatorProfileEntitySchema.parse({
      id: PROFILE_ID,
      workspaceId: WORKSPACE_ID,
      displayName: '阿篓的AI篓子',
      avatarAssetId: null,
      bio: 'AI 应用创作者',
      profile: FULL_PROFILE,
      injection: { enabled: true, sections: {} },
      revision: 1,
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
    })

    expect(entity).toMatchObject({ displayName: '阿篓的AI篓子', revision: 1 })
  })

  it('validates import and render request schemas', () => {
    expect(importProfileRequestSchema.parse({ vaultPath: '50_Channels/阿篓的AI篓子/00-账号定位.md', targetSection: 'positioning' })).toMatchObject({
      vaultPath: '50_Channels/阿篓的AI篓子/00-账号定位.md',
      targetSection: 'positioning',
    })
    expect(importProfileRequestSchema.safeParse({ vaultPath: '', targetSection: 'positioning' }).success).toBe(false)
    expect(importProfileRequestSchema.safeParse({ vaultPath: 'a.md', targetSection: 'examples' }).success).toBe(false)
    expect(renderRequestSchema.parse({ scope: 'project' })).toEqual({ scope: 'project' })
    expect(renderRequestSchema.parse({ profileId: REQUEST_ID, scope: 'script' }).profileId).toBe(REQUEST_ID)
    expect(renderRequestSchema.safeParse({}).success).toBe(false)
  })
})
