import {
  artifactDetailSchema,
  artifactVersionSchema,
  serializeIsoDateTime,
  type Artifact,
  type ArtifactDetail,
  type ArtifactVersion,
  type UpdateArtifact,
} from '@creator-studio/contracts'
import { ulid } from 'ulid'

import type { ArtifactRecord, ArtifactVersionRecord } from '../db/schema.js'
import { createRevisionConflictError, HttpError } from '../http/errors.js'
import { ProjectRepository } from '../repositories/project-repository.js'
import {
  ArtifactNotFoundError,
  ArtifactRepository,
  ArtifactRevisionConflictError,
  ArtifactSoftDeletedError,
  ArtifactVersionNotFoundError,
} from './artifact-repository.js'

function date(value: number): string { return serializeIsoDateTime(new Date(value)) }

export function mapArtifact(record: ArtifactRecord): Artifact {
  return {
    id: record.id,
    projectId: record.projectId,
    kind: record.kind,
    role: record.role,
    currentVersionId: record.currentVersionId ?? null,
    revision: record.revision,
    createdAt: date(record.createdAt),
    updatedAt: date(record.updatedAt),
  }
}

export function mapArtifactVersion(record: ArtifactVersionRecord): ArtifactVersion {
  return artifactVersionSchema.parse({
    id: record.id,
    artifactId: record.artifactId,
    versionNumber: record.versionNumber,
    parentVersionId: record.parentVersionId ?? null,
    contentRef:
      record.contentRefType === 'asset' && record.contentRefId
        ? { type: 'asset', id: record.contentRefId }
        : record.contentRefType === 'inline'
          ? { type: 'inline', text: record.inlineText ?? '' }
          : null,
    metadata: record.metadataJson ? JSON.parse(record.metadataJson) as Record<string, unknown> : {},
    source: record.source,
    operationRunId: record.operationRunId ?? null,
    createdBy: record.createdBy,
    createdAt: date(record.createdAt),
  })
}

export interface ArtifactServiceIdentity {
  workspaceId: string
  creatorProfileId: string
}

export interface VersionPage {
  items: ArtifactVersion[]
  hasMore: boolean
  nextCursor?: string
}

export class ArtifactService {
  constructor(
    private readonly artifacts: ArtifactRepository,
    private readonly projects: ProjectRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async get(identity: ArtifactServiceIdentity, id: string): Promise<ArtifactDetail> {
    const record = await this.requireArtifact(identity.workspaceId, id)
    let currentVersion: ArtifactVersion | null = null
    if (record.currentVersionId) {
      const version = await this.artifacts.getVersionById(record.currentVersionId)
      if (version) currentVersion = mapArtifactVersion(version)
    }
    return artifactDetailSchema.parse({ ...mapArtifact(record), currentVersion })
  }

  async listVersions(identity: ArtifactServiceIdentity, id: string, query: { cursor?: string | undefined; limit: number }): Promise<VersionPage> {
    await this.requireArtifact(identity.workspaceId, id)
    const cursor = this.decodeCursor(query.cursor)
    const page = await this.artifacts.listVersionsByArtifactCursor(id, cursor, query.limit)
    const last = page.items.at(-1)
    return {
      items: page.items.map(mapArtifactVersion),
      hasMore: page.hasMore,
      ...(page.hasMore && last ? { nextCursor: Buffer.from(JSON.stringify({ versionNumber: last.versionNumber, id: last.id })).toString('base64url') } : {}),
    }
  }

  async getVersion(identity: ArtifactServiceIdentity, id: string): Promise<ArtifactVersion> {
    const record = await this.artifacts.getVersionById(id)
    if (!record) throw new HttpError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: '内容版本不存在。' })
    const artifact = await this.artifacts.getById(record.artifactId)
    if (!artifact || artifact.workspaceId !== identity.workspaceId) {
      throw new HttpError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: '内容版本不存在。' })
    }
    return mapArtifactVersion(record)
  }

  async restore(identity: ArtifactServiceIdentity, id: string, versionId: string): Promise<ArtifactVersion> {
    await this.requireArtifact(identity.workspaceId, id)
    const now = this.now()
    try {
      const { version } = this.artifacts.restoreVersion({ artifactId: id, versionId, createdBy: identity.creatorProfileId, now })
      return mapArtifactVersion(version)
    } catch (error) {
      this.rethrowWriteError(error, { status: 404, code: 'ARTIFACT_NOT_FOUND', message: '内容版本不存在。' })
    }
  }

  async update(identity: ArtifactServiceIdentity, id: string, input: UpdateArtifact): Promise<ArtifactDetail> {
    await this.requireArtifact(identity.workspaceId, id)
    const now = this.now()
    try {
      const { artifact } = this.artifacts.editContent({
        artifactId: id,
        revision: input.revision,
        text: input.patch.text ?? '',
        ...(input.patch.metadata !== undefined ? { metadata: input.patch.metadata } : {}),
        createdBy: identity.creatorProfileId,
        now,
      })
      return this.get(identity, artifact.id)
    } catch (error) {
      this.rethrowWriteError(error)
    }
  }

  /** 显式「同时删除内容」：删除关联 CanvasNode + Edge + 软删 artifact。 */
  async remove(identity: ArtifactServiceIdentity, id: string): Promise<void> {
    await this.requireArtifact(identity.workspaceId, id)
    await this.artifacts.softDelete(id, this.now())
  }

  /** 供 canvas 模块调用：删除 Node 后若 artifact 无引用则标记 orphan。 */
  async markOrphanIfUnreferenced(artifactId: string, nodeCountAfter: number): Promise<void> {
    if (nodeCountAfter === 0) {
      await this.artifacts.markOrphan(artifactId, this.now())
    }
  }

  async requireArtifact(workspaceId: string, id: string): Promise<ArtifactRecord> {
    const record = await this.artifacts.getByWorkspaceAndId(workspaceId, id)
    if (!record) throw new HttpError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: '内容不存在。' })
    if (record.deletedAt !== null) throw new HttpError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: '内容不存在或已删除。' })
    return record
  }

  private decodeCursor(value?: string): { versionNumber: number; id: string } | undefined {
    if (!value) return undefined
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { versionNumber?: unknown; id?: unknown }
      if (!Number.isSafeInteger(parsed.versionNumber) || typeof parsed.id !== 'string') throw new Error('Invalid cursor')
      return { versionNumber: parsed.versionNumber as number, id: parsed.id }
    } catch {
      throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '版本列表 cursor 无效。' })
    }
  }

  private rethrowWriteError(error: unknown, notFound?: { status: number; code: string; message: string }): never {
    if (error instanceof ArtifactRevisionConflictError) throw createRevisionConflictError(error.currentRevision)
    if (error instanceof ArtifactNotFoundError) throw notFound ?? new HttpError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: '内容不存在。' })
    if (error instanceof ArtifactVersionNotFoundError) throw notFound ?? new HttpError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: '内容版本不存在。' })
    if (error instanceof ArtifactSoftDeletedError) throw new HttpError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: '内容不存在或已删除。' })
    throw error
  }

  protected newId(): string { return ulid(this.now()) }
}
