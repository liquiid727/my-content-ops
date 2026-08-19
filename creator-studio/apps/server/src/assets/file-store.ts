import { fileTypeFromBuffer } from 'file-type'
import { imageSize } from 'image-size'
import { createHash, randomBytes } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { AssetKind } from '@creator-studio/contracts'
import { HttpError } from '../http/errors.js'

const MIME_KINDS: Record<string, AssetKind> = {
  'image/png': 'image', 'image/jpeg': 'image', 'image/gif': 'image', 'image/webp': 'image',
  'audio/mpeg': 'audio', 'audio/wav': 'audio', 'video/mp4': 'video', 'video/webm': 'video',
  'application/pdf': 'document', 'text/plain': 'document', 'application/json': 'document',
}

function unsupported(message = '文件 MIME 或签名不受支持。'): HttpError {
  return new HttpError({ status: 415, code: 'FILE_TYPE_UNSUPPORTED', message })
}

export function validateDisplayName(name: string): string {
  if (!name || name === '.' || name === '..' || isAbsolute(name) || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '上传文件名必须是安全的单一文件名。' })
  }
  return name.slice(0, 255)
}

export async function inspectUpload(buffer: Uint8Array, claimedMime: string) {
  const kind = MIME_KINDS[claimedMime]
  if (!kind) throw unsupported()
  const detected = await fileTypeFromBuffer(buffer)
  if (claimedMime === 'text/plain' || claimedMime === 'application/json') {
    if (detected) throw unsupported('文件签名与声明的 MIME 不一致。')
    let text: string
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer) } catch { throw unsupported() }
    if (text.includes('\0')) throw unsupported()
    if (claimedMime === 'application/json') {
      try { JSON.parse(text) } catch { throw unsupported('JSON 文件内容无效。') }
    }
  } else if (!detected || detected.mime !== claimedMime) {
    throw unsupported('文件签名与声明的 MIME 不一致。')
  }

  let width: number | null = null
  let height: number | null = null
  if (kind === 'image') {
    try {
      const dimensions = imageSize(buffer)
      width = dimensions.width ?? null
      height = dimensions.height ?? null
    } catch { throw unsupported('无法读取图像元数据。') }
  }
  return { kind, width, height, sha256: createHash('sha256').update(buffer).digest('hex') }
}

export class AssetFileStore {
  constructor(readonly filesDirectory: string) {}

  async writeTemporary(buffer: Uint8Array): Promise<string> {
    const directory = await this.ensureSafeDirectory(['.tmp'])
    const path = join(directory, randomBytes(20).toString('hex'))
    await writeFile(path, buffer, { flag: 'wx', mode: 0o600 })
    return path
  }

  storagePath(assetId: string, displayName: string): string {
    return `assets/${assetId}/${validateDisplayName(displayName)}`
  }

  async commit(temporaryPath: string, storagePath: string): Promise<void> {
    const target = await this.resolveForWrite(storagePath)
    await rename(temporaryPath, target)
  }

  async cleanup(path: string): Promise<void> {
    await rm(path, { force: true })
  }

  async read(storagePath: string): Promise<Uint8Array> {
    const root = await realpath(this.filesDirectory)
    const candidate = resolve(root, storagePath)
    if (!candidate.startsWith(`${root}${sep}`)) throw new Error('Unsafe stored asset path')
    const info = await lstat(candidate)
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('Asset content path is not a regular file')
    const actual = await realpath(candidate)
    if (!actual.startsWith(`${root}${sep}`)) throw new Error('Asset content escapes file root')
    return readFile(actual)
  }

  private async resolveForWrite(storagePath: string): Promise<string> {
    if (isAbsolute(storagePath) || storagePath.split('/').includes('..') || storagePath.includes('\\')) throw new Error('Unsafe asset storage path')
    await mkdir(this.filesDirectory, { recursive: true })
    const root = await realpath(this.filesDirectory)
    const segments = storagePath.split('/')
    const filename = segments.pop()
    if (!filename || segments.some((segment) => !segment || segment === '.' || segment === '..')) throw new Error('Unsafe asset storage path')
    const parent = await this.ensureSafeDirectory(segments)
    const target = resolve(parent, filename)
    if (!target.startsWith(`${root}${sep}`) || relative(root, target).startsWith('..')) throw new Error('Asset path escapes file root')
    return target
  }

  private async ensureSafeDirectory(segments: string[]): Promise<string> {
    await mkdir(this.filesDirectory, { recursive: true })
    const root = await realpath(this.filesDirectory)
    let current = root
    for (const segment of segments) {
      if (!segment || segment === '.' || segment === '..' || segment.includes(sep)) throw new Error('Unsafe asset directory segment')
      current = join(current, segment)
      try { await mkdir(current) } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      }
      const info = await lstat(current)
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Asset directory is not a safe directory')
      const actual = await realpath(current)
      if (!actual.startsWith(`${root}${sep}`)) throw new Error('Asset directory escapes file root')
      current = actual
    }
    return current
  }
}
