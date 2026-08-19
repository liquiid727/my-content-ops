import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

import {
  type PersonalStyle,
  type SectionKey,
} from '@creator-studio/contracts'

export class VaultImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultImportError'
  }
}

/** 将 vault 内相对路径解析为绝对路径，并拒绝越出 vault 根目录的路径（防路径穿越）。 */
export function resolveVaultFilePath(vaultRoot: string, vaultPath: string): string {
  const root = resolve(vaultRoot)
  const target = resolve(root, vaultPath)
  const isInside = target === root || target.startsWith(root + sep)
  if (!isInside) {
    throw new VaultImportError(`导入路径越界：不允许读取 Vault 根目录之外的路径（${vaultPath}）。`)
  }
  return target
}

export async function readVaultMarkdown(vaultRoot: string, vaultPath: string): Promise<string> {
  const target = resolveVaultFilePath(vaultRoot, vaultPath)
  try {
    return await readFile(target, 'utf8')
  } catch {
    throw new VaultImportError(`无法读取 Vault 笔记：${vaultPath}。`)
  }
}

export interface ParsedMarkdown {
  heading: string
  paragraphs: string[]
  listItems: string[]
}

/**
 * 极简 Markdown 解析：frontmatter 剔除、H1 作为标题、段落合并、列表项收集。
 * 足够支撑结构化抽取，解析不出结构时调用方会退回整段文本草稿。
 */
export function parseMarkdown(text: string): ParsedMarkdown {
  const headingLines: string[] = []
  const paragraphs: string[] = []
  const listItems: string[] = []
  let inFrontmatter = false
  let currentParagraph: string | null = null

  const flush = () => {
    if (currentParagraph !== null && currentParagraph.length > 0) paragraphs.push(currentParagraph)
    currentParagraph = null
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '---') {
      inFrontmatter = !inFrontmatter
      continue
    }
    if (inFrontmatter) continue
    if (line.startsWith('# ')) {
      headingLines.push(line.slice(2).trim())
      flush()
      continue
    }
    if (line.startsWith('#')) continue
    if (line.startsWith('![')) {
      flush()
      continue
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      listItems.push(line.slice(2).trim())
      flush()
      continue
    }
    const ordered = /^(\d+)[.、]\s*(.+)$/.exec(line)
    if (ordered) {
      const [, , item] = ordered
      if (item !== undefined) listItems.push(item.trim())
      flush()
      continue
    }
    if (line === '') {
      flush()
      continue
    }
    currentParagraph = currentParagraph === null ? line : `${currentParagraph} ${line}`
  }
  flush()

  return { heading: headingLines[0] ?? '', paragraphs, listItems }
}

/** 形如 `平台：昵称` 的列表项转成 nicknames 记录。 */
function parseNicknames(listItems: string[]): Record<string, string> {
  const nicknames: Record<string, string> = {}
  for (const item of listItems) {
    const match = /^(.{1,24})[:：]\s*(.+)$/.exec(item)
    if (match) {
      const platform = match[1]
      const nickname = match[2]
      if (platform !== undefined && nickname !== undefined) nicknames[platform.trim()] = nickname.trim()
    }
  }
  return nicknames
}

/** 将一段 Markdown 笔记覆盖写入画像的 targetSection（幂等，保留其余区块）。 */
export function applyImportToSection(profile: PersonalStyle, targetSection: SectionKey, text: string): PersonalStyle {
  const { heading, paragraphs, listItems } = parseMarkdown(text)
  const prose = paragraphs[0] ?? ''
  const hasContent = prose.length > 0 || listItems.length > 0 || heading.length > 0
  if (!hasContent) return profile

  const lines = listItems.length > 0 ? listItems : prose ? [prose] : []

  switch (targetSection) {
    case 'identity':
      return {
        ...profile,
        identity: {
          ...profile.identity,
          ...(prose ? { background: prose } : {}),
          ...(heading ? { currentRole: heading } : {}),
          ...(Object.keys(parseNicknames(listItems)).length > 0 ? { nicknames: { ...profile.identity.nicknames, ...parseNicknames(listItems) } } : {}),
        },
      }
    case 'positioning':
      return {
        ...profile,
        positioning: {
          ...profile.positioning,
          ...(prose ? { summary: prose } : {}),
          ...(lines.length > 0 ? { nicheTags: lines } : {}),
        },
      }
    case 'audience':
      return {
        ...profile,
        audience: {
          ...profile.audience,
          ...(prose ? { primaryAudience: prose } : {}),
          ...(lines.length > 0 ? { painPoints: lines } : {}),
        },
      }
    case 'voice':
      return {
        ...profile,
        voice: {
          ...profile.voice,
          tone: {
            ...profile.voice.tone,
            ...(lines.length > 0 ? { like: lines } : {}),
          },
        },
      }
    case 'knowledge':
      return {
        ...profile,
        knowledge: {
          ...profile.knowledge,
          ...(lines.length > 0 ? { domains: lines } : {}),
        },
      }
    case 'memory':
      return {
        ...profile,
        memory: {
          ...profile.memory,
          ...(lines.length > 0 ? { learnings: lines } : {}),
        },
      }
    case 'rules':
      return {
        ...profile,
        rules: {
          ...profile.rules,
          ...(lines.length > 0 ? { principles: lines } : {}),
        },
      }
  }
}
