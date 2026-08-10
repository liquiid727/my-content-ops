import type { PersonalStyle } from '@creator-studio/contracts'
import { describe, expect, it } from 'vitest'

import { applyImportToSection, parseMarkdown, resolveVaultFilePath, VaultImportError } from './vault-import.js'

const VAULT_ROOT = '/vaults/main'

describe('resolveVaultFilePath', () => {
  it('resolves a relative path inside the vault root', () => {
    expect(resolveVaultFilePath(VAULT_ROOT, '50_Channels/note.md')).toBe('/vaults/main/50_Channels/note.md')
    expect(resolveVaultFilePath(VAULT_ROOT, './note.md')).toBe('/vaults/main/note.md')
  })

  it('rejects paths that escape the vault root', () => {
    expect(() => resolveVaultFilePath(VAULT_ROOT, '../outside.md')).toThrow(VaultImportError)
    expect(() => resolveVaultFilePath(VAULT_ROOT, 'a/../../outside.md')).toThrow(VaultImportError)
    expect(() => resolveVaultFilePath(VAULT_ROOT, '/etc/passwd')).toThrow(VaultImportError)
  })
})

describe('parseMarkdown', () => {
  it('strips YAML frontmatter and captures heading, paragraphs and list items', () => {
    const parsed = parseMarkdown([
      '---',
      'tags: [定位]',
      '---',
      '# 阿篓的AI篓子',
      '',
      '第一段话。',
      '第二段话。',
      '',
      '- AI Coding',
      '- AI 工具测评',
      '1. 序号项',
    ].join('\n'))
    expect(parsed.heading).toBe('阿篓的AI篓子')
    expect(parsed.paragraphs).toEqual(['第一段话。 第二段话。'])
    expect(parsed.listItems).toEqual(['AI Coding', 'AI 工具测评', '序号项'])
  })
})

describe('applyImportToSection', () => {
  const base: PersonalStyle = {
    identity: { creatorName: '阿篓', nicknames: {} },
    positioning: { summary: '', nicheTags: [], channels: [] },
    audience: { primaryAudience: '', painPoints: [], goals: [] },
    voice: { tone: { like: [], avoid: [] }, writingStyle: { preferredAspects: [], sentencePatterns: [] }, vocabulary: { common: [], banned: [] } },
    knowledge: { domains: [] },
    memory: { pastWorks: [] },
    rules: { principles: [] },
  }

  it('maps prose and list items into positioning', () => {
    const next = applyImportToSection(base, 'positioning', '# 定位\n\n一句话定位。\n- AI Coding\n- 独立开发')
    expect(next.positioning.summary).toBe('一句话定位。')
    expect(next.positioning.nicheTags).toEqual(['AI Coding', '独立开发'])
  })

  it('maps list items into voice tone', () => {
    const next = applyImportToSection(base, 'voice', '- 轻松\n- 不装')
    expect(next.voice.tone.like).toEqual(['轻松', '不装'])
  })

  it('parses 平台：昵称 list items into nicknames', () => {
    const next = applyImportToSection(base, 'identity', '# 身份\n\n阿篓，AI 应用开发者。\n- 公众号：AI晚点')
    expect(next.identity.background).toBe('阿篓，AI 应用开发者。')
    expect(next.identity.nicknames).toEqual({ 公众号: 'AI晚点' })
  })

  it('keeps the profile unchanged for an empty note', () => {
    expect(applyImportToSection(base, 'rules', '')).toBe(base)
  })
})
