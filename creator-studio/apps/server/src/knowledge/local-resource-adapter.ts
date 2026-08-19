import { readdir, realpath, stat } from 'node:fs/promises'
import { basename, extname, relative, resolve, sep } from 'node:path'

import { HttpError } from '../http/errors.js'
import { extractLocalResource, LOCAL_MIME_TYPES, localResourceKind, SUPPORTED_EXTENSIONS } from './local-extractor.js'
import type { AdapterConnection, NormalizedResource, ResourceAdapter, ResourceDescriptor } from './resource-adapter.js'

const IGNORED = new Set(['.git', '.trash', 'node_modules', 'dist'])

async function rootFor(connection: AdapterConnection): Promise<string> {
  const value = connection.config.root ?? connection.config.vaultRoot
  if (typeof value !== 'string' || !value) throw new HttpError({ status: 422, code: 'CONNECTOR_UNAVAILABLE', message: '请先配置可读目录。' })
  try { const root = await realpath(value); if (!(await stat(root)).isDirectory()) throw new Error(); return root } catch {
    throw new HttpError({ status: 403, code: 'CONNECTOR_PATH_DENIED', message: '连接目录不可读或不是目录。' })
  }
}

async function safePath(connection: AdapterConnection, ref: string): Promise<{ root: string; target: string }> {
  const root = await rootFor(connection)
  const candidate = resolve(root, ref)
  if (candidate !== root && !candidate.startsWith(root + sep)) throw new HttpError({ status: 403, code: 'CONNECTOR_PATH_DENIED', message: '资源路径越出连接目录。' })
  try {
    const target = await realpath(candidate)
    if (target !== root && !target.startsWith(root + sep)) throw new Error()
    return { root, target }
  } catch { throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: '外部资源不存在或不可读。' }) }
}

async function scan(root: string, limit: number): Promise<string[]> {
  const files: string[] = []
  async function walk(directory: string): Promise<void> {
    if (files.length >= limit) return
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (files.length >= limit || IGNORED.has(entry.name) || entry.name.startsWith('.')) continue
      const target = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) await walk(target)
      else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) files.push(target)
    }
  }
  await walk(root)
  return files
}

export class LocalResourceAdapter implements ResourceAdapter {
  constructor(readonly type: 'obsidian' | 'folder') {}

  async test(connection: AdapterConnection) {
    const root = await rootFor(connection)
    return { ok: true, status: 'ready' as const, message: `${this.type === 'obsidian' ? 'Obsidian Vault' : '文件夹'}可读：${basename(root)}` }
  }

  async browse(connection: AdapterConnection, limit: number): Promise<ResourceDescriptor[]> {
    const root = await rootFor(connection)
    const files = await scan(root, limit)
    return Promise.all(files.map(async (path) => {
      const info = await stat(path)
      const ref = relative(root, path)
      const extension = extname(path).toLowerCase()
      return {
        ref, title: basename(path, extension), kind: localResourceKind(extension), mimeType: LOCAL_MIME_TYPES[extension] ?? null,
        excerpt: '', sourceUrl: null, sourceVersion: `${Math.trunc(info.mtimeMs)}:${info.size}`,
        modifiedAt: info.mtimeMs, metadata: { extension, size: info.size },
      }
    }))
  }

  async search(connection: AdapterConnection, query: string, limit: number): Promise<ResourceDescriptor[]> {
    const resources = await this.browse(connection, Math.max(limit * 20, 200))
    if (!query) return resources.slice(0, limit)
    const needle = query.toLocaleLowerCase()
    return resources.filter((resource) => `${resource.title}\n${resource.excerpt}`.toLocaleLowerCase().includes(needle)).slice(0, limit)
  }

  async stat(connection: AdapterConnection, ref: string): Promise<ResourceDescriptor> {
    const { target } = await safePath(connection, ref)
    const info = await stat(target)
    const extension = extname(target).toLowerCase()
    return {
      ref, title: basename(target, extension), kind: localResourceKind(extension), mimeType: LOCAL_MIME_TYPES[extension] ?? null,
      excerpt: '', sourceUrl: null, sourceVersion: `${Math.trunc(info.mtimeMs)}:${info.size}`, modifiedAt: info.mtimeMs,
      metadata: { extension, size: info.size },
    }
  }

  async read(connection: AdapterConnection, ref: string): Promise<NormalizedResource> {
    const { target } = await safePath(connection, ref)
    const resource = await extractLocalResource(target)
    return {
      ref, title: resource.title, kind: resource.kind, mimeType: resource.mimeType, text: resource.text,
      excerpt: resource.text.slice(0, 300), sourceUrl: null, sourceVersion: resource.sourceVersion,
      modifiedAt: resource.modifiedAt, metadata: resource.metadata,
    }
  }
}
