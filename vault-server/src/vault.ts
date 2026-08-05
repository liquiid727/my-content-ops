import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative, basename, extname } from 'node:path'
import matter from 'gray-matter'
import type { DocMeta } from './bm25.js'

export interface VaultConfig {
  vaultPath: string
  excludeDirs?: string[]
}

const DEFAULT_EXCLUDE = ['.obsidian', '.trash', '.git', 'assets', 'dist', 'node_modules']

function getFolder(relPath: string): string {
  const parts = relPath.split('/')
  return parts.length > 1 ? parts[0] : 'root'
}

function getTitle(frontmatter: Record<string, unknown>, filePath: string): string {
  if (typeof frontmatter.title === 'string') return frontmatter.title
  const name = basename(filePath, extname(filePath))
  return name.replace(/[-_]/g, ' ')
}

function getExcerpt(content: string, maxLen = 300): string {
  const cleaned = content
    .replace(/^---[\s\S]*?---\n/, '')
    .replace(/#+\s/g, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
  return cleaned.slice(0, maxLen) + (cleaned.length > maxLen ? '…' : '')
}

function getTags(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter.tags
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') return [raw]
  return []
}

export async function parseVaultFile(filePath: string, vaultRoot: string): Promise<DocMeta | null> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    const { data: fm, content } = matter(raw)
    const relPath = relative(vaultRoot, filePath)
    const mtime = (await stat(filePath)).mtimeMs

    // Skip tiny files (templates, index stubs)
    if (content.trim().length < 30) return null

    return {
      id: relPath,
      path: relPath,
      title: getTitle(fm as Record<string, unknown>, filePath),
      excerpt: getExcerpt(raw),
      content: content.slice(0, 4000),
      tags: getTags(fm as Record<string, unknown>),
      folder: getFolder(relPath),
      mtime,
    }
  } catch {
    return null
  }
}

export async function scanVault(config: VaultConfig): Promise<DocMeta[]> {
  const exclude = new Set([...DEFAULT_EXCLUDE, ...(config.excludeDirs ?? [])])
  const results: DocMeta[] = []

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    await Promise.all(
      entries.map(async (entry) => {
        if (exclude.has(entry.name)) return
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(fullPath)
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const doc = await parseVaultFile(fullPath, config.vaultPath)
          if (doc) results.push(doc)
        }
      })
    )
  }

  await walk(config.vaultPath)
  return results
}
