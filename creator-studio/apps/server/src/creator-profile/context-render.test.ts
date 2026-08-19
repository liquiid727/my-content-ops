import {
  personalStyleSchema,
  type InjectionSettings,
  type PersonalStyle,
} from '@creator-studio/contracts'
import { describe, expect, it } from 'vitest'

import { renderContext } from './context-render.js'

const FULL_PROFILE: PersonalStyle = personalStyleSchema.parse({
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
    painPoints: ['不知道从哪开始'],
    goals: ['学会搭一个自己的 AI 小工具'],
  },
  voice: {
    tone: { like: ['轻松', '口语化'], avoid: ['营销感'] },
    writingStyle: { preferredAspects: ['第一人称'], sentencePatterns: ['先问后析结'] },
    vocabulary: { common: ['干就完了'], banned: ['赋能'] },
  },
  knowledge: { domains: ['AI 应用开发'], toolsAndSkills: ['Cursor'] },
  memory: { pastWorks: [{ title: '普通人如何搭建第一个 AI Agent', platform: '公众号' }] },
  rules: { principles: ['故事优先', '不写口水文'] },
})

const EMPTY_PROFILE: PersonalStyle = personalStyleSchema.parse({})

const ALL_SECTIONS_ON: InjectionSettings = {
  enabled: true,
  sections: {
    identity: true,
    positioning: true,
    audience: true,
    voice: true,
    knowledge: true,
    memory: true,
    rules: true,
  },
}

const VOICE_OFF: InjectionSettings = {
  enabled: true,
  sections: {
    identity: true,
    positioning: true,
    audience: true,
    voice: false,
    knowledge: true,
    memory: true,
    rules: true,
  },
}

describe('renderContext', () => {
  it('renders every enabled section with a titled markdown block', () => {
    const text = renderContext(FULL_PROFILE, ALL_SECTIONS_ON, 'project')
    expect(text).toContain('以下是创作者的风格与背景，请遵循。')
    for (const title of ['## 身份', '## 定位', '## 受众', '## 声音', '## 知识', '## 记忆', '## 规则']) {
      expect(text).toContain(title)
    }
    expect(text).toContain('阿篓')
  })

  it('drops a section when its injection switch is off', () => {
    const text = renderContext(FULL_PROFILE, VOICE_OFF, 'project')
    expect(text).toContain('## 身份')
    expect(text).toContain('## 定位')
    expect(text).not.toContain('## 声音')
    expect(text).not.toContain('轻松')
  })

  it('returns empty text when the global switch is disabled', () => {
    const text = renderContext(FULL_PROFILE, { enabled: false, sections: ALL_SECTIONS_ON.sections }, 'project')
    expect(text).toBe('')
  })

  it('returns empty text for an empty profile without throwing', () => {
    expect(renderContext(EMPTY_PROFILE, ALL_SECTIONS_ON, 'project')).toBe('')
  })

  it('embeds the scope intent into the rendered text', () => {
    expect(renderContext(FULL_PROFILE, ALL_SECTIONS_ON, 'script')).toContain('创作场景：口播脚本撰写')
    expect(renderContext(FULL_PROFILE, ALL_SECTIONS_ON, 'cover')).toContain('创作场景：封面与标题创作')
  })

  it('never renders the free-form extra keys', () => {
    const text = renderContext({ ...FULL_PROFILE, extra: { kpi: { followers: 12000 } } }, ALL_SECTIONS_ON, 'project')
    expect(text).not.toContain('12000')
    expect(text).not.toContain('kpi')
  })
})
