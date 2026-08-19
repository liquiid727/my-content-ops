import { assetSchema, serializeIsoDateTime, type Asset, type AssetKind } from '@creator-studio/contracts'
import { ulid } from 'ulid'

import type { AssetRecord } from '../db/schema.js'
import { HttpError } from '../http/errors.js'
import { AssetRepository, type AssetListCursor } from '../repositories/asset-repository.js'
import { ProjectRepository } from '../repositories/project-repository.js'
import { AssetFileStore, inspectUpload, validateDisplayName } from './file-store.js'

export const DEFAULT_MAX_ASSET_BYTES = 200 * 1024 * 1024

function mapAsset(record: AssetRecord): Asset {
  return assetSchema.parse({
    id: record.id, projectId: record.projectId, type: record.kind, name: record.displayName,
    mimeType: record.mimeType, size: record.sizeBytes, width: record.width, height: record.height,
    durationMs: record.durationMs, contentUrl: `/api/v1/assets/${record.id}/content`,
    thumbnailUrl: null,
    createdAt: serializeIsoDateTime(new Date(record.createdAt)),
  })
}

function decodeCursor(value?: string): AssetListCursor | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString()) as AssetListCursor
    if (!Number.isSafeInteger(parsed.createdAt) || typeof parsed.id !== 'string') throw new Error()
    return parsed
  } catch { throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: 'Asset cursor 无效。' }) }
}

export class AssetService {
  constructor(
    private readonly assets: AssetRepository,
    private readonly projects: ProjectRepository,
    private readonly files: AssetFileStore,
    private readonly maxBytes = DEFAULT_MAX_ASSET_BYTES,
    private readonly now: () => number = Date.now,
  ) {}

  async upload(identity: { workspaceId: string; creatorProfileId: string }, file: File, projectId?: string): Promise<Asset> {
    const name = validateDisplayName(file.name)
    if (file.size > this.maxBytes) throw new HttpError({ status: 413, code: 'FILE_TOO_LARGE', message: `文件超过 ${this.maxBytes} byte 限制。` })
    if (projectId && !(await this.projects.getByWorkspaceAndId(identity.workspaceId, projectId))) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: '目标 Project 不存在。' })
    const buffer = new Uint8Array(await file.arrayBuffer())
    const temporary = await this.files.writeTemporary(buffer)
    let record: AssetRecord | undefined
    try {
      const inspected = await inspectUpload(buffer, file.type)
      const now = this.now()
      const id = ulid(now)
      const storagePath = this.files.storagePath(id, name)
      record = await this.assets.create({
        id, workspaceId: identity.workspaceId, projectId: projectId ?? null, kind: inspected.kind,
        source: 'upload', displayName: name, mimeType: file.type, sizeBytes: buffer.byteLength,
        storagePath, sha256: inspected.sha256, width: inspected.width, height: inspected.height,
        createdBy: identity.creatorProfileId, createdAt: now, updatedAt: now,
      })
      try { await this.files.commit(temporary, storagePath) } catch (error) { await this.assets.hardDelete(id); throw error }
      return mapAsset(record)
    } finally {
      await this.files.cleanup(temporary)
    }
  }

  async list(identity: { workspaceId: string }, input: { projectId?: string | undefined; type?: AssetKind | undefined; cursor?: string | undefined; limit: number }) {
    const page = await this.assets.list({ workspaceId: identity.workspaceId, projectId: input.projectId, kind: input.type, cursor: decodeCursor(input.cursor), limit: input.limit })
    const last = page.items.at(-1)
    return { items: page.items.map(mapAsset), hasMore: page.hasMore, nextCursor: page.hasMore && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString('base64url') : undefined }
  }

  async get(identity: { workspaceId: string }, id: string): Promise<{ asset: Asset; record: AssetRecord }> {
    const record = await this.assets.getByWorkspaceAndId(identity.workspaceId, id)
    if (!record) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Asset 不存在。' })
    return { asset: mapAsset(record), record }
  }

  async content(identity: { workspaceId: string }, id: string) {
    const { record } = await this.get(identity, id)
    return { bytes: await this.files.read(record.storagePath), mimeType: record.mimeType, name: record.displayName }
  }

  async remove(identity: { workspaceId: string }, id: string): Promise<void> {
    await this.get(identity, id)
    if (await this.assets.isReferenced(id)) throw new HttpError({ status: 409, code: 'ASSET_IN_USE', message: 'Asset 仍被其他对象引用，无法删除。' })
    await this.assets.softDelete(id, this.now())
  }
}
