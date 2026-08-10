import { and, desc, eq, isNull, lt, max, or } from 'drizzle-orm'
import { ulid } from 'ulid'

import { artifacts, artifactVersions, type ArtifactRecord, type ArtifactVersionRecord } from '../db/schema.js'
import type { DatabaseClient } from '../repositories/types.js'

export interface ArtifactContentRef {
  type: 'asset' | 'inline'
  id?: string
  text?: string
}

export interface NewArtifactVersionInput {
  artifactId: string
  parentVersionId?: string | null
  contentRef?: ArtifactContentRef | null
  metadata?: Record<string, unknown>
  source: ArtifactVersionRecord['source']
  operationRunId?: string | null
  createdBy: string
  createdAt: number
}

export class ArtifactNotFoundError extends Error {
  constructor(readonly artifactId: string) {
    super(`Artifact ${artifactId} was not found`)
    this.name = 'ArtifactNotFoundError'
  }
}

export class ArtifactVersionNotFoundError extends Error {
  constructor(readonly versionId: string) {
    super(`Artifact version ${versionId} was not found`)
    this.name = 'ArtifactVersionNotFoundError'
  }
}

export class ArtifactRevisionConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super(`Artifact revision conflict; current revision is ${currentRevision}`)
    this.name = 'ArtifactRevisionConflictError'
  }
}

export class ArtifactSoftDeletedError extends Error {
  constructor(readonly artifactId: string) {
    super(`Artifact ${artifactId} is deleted`)
    this.name = 'ArtifactSoftDeletedError'
  }
}

export class ArtifactRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getById(id: string): Promise<ArtifactRecord | null> {
    return this.db.select().from(artifacts).where(eq(artifacts.id, id)).get() ?? null
  }

  async getByWorkspaceAndId(workspaceId: string, id: string): Promise<ArtifactRecord | null> {
    return this.db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.id, id), eq(artifacts.workspaceId, workspaceId)))
      .get() ?? null
  }

  async listActiveByProject(projectId: string): Promise<ArtifactRecord[]> {
    return this.db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.projectId, projectId), isNull(artifacts.deletedAt)))
      .orderBy(desc(artifacts.updatedAt), desc(artifacts.id))
      .all()
  }

  async create(input: typeof artifacts.$inferInsert): Promise<ArtifactRecord> {
    return this.db.insert(artifacts).values(input).returning().get()
  }

  /** 显式「同时删除内容」：软删 artifact（保留历史链，延迟 GC）。 */
  async softDelete(id: string, deletedAt = Date.now()): Promise<ArtifactRecord | null> {
    return this.db
      .update(artifacts)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(and(eq(artifacts.id, id), isNull(artifacts.deletedAt)))
      .returning()
      .get() ?? null
  }

  /** 删除 CanvasNode 后 artifact 无引用 → 标记 orphan（delayed GC）。 */
  async markOrphan(id: string, now = Date.now()): Promise<ArtifactRecord | null> {
    return this.db
      .update(artifacts)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(artifacts.id, id), isNull(artifacts.deletedAt)))
      .returning()
      .get() ?? null
  }

  async updateCurrentVersionId(id: string, currentVersionId: string, now = Date.now()): Promise<ArtifactRecord | null> {
    return this.db
      .update(artifacts)
      .set({ currentVersionId, updatedAt: now })
      .where(and(eq(artifacts.id, id), isNull(artifacts.deletedAt)))
      .returning()
      .get() ?? null
  }

  /** 手动编辑：校验 revision，建 source=user 新版本并更新 current_version_id。 */
  editContent(input: {
    artifactId: string
    revision: number
    text: string
    metadata?: Record<string, unknown>
    createdBy: string
    now: number
  }): { artifact: ArtifactRecord; version: ArtifactVersionRecord } {
    return this.db.transaction((transaction) => {
      const artifact = transaction
        .select()
        .from(artifacts)
        .where(and(eq(artifacts.id, input.artifactId), isNull(artifacts.deletedAt)))
        .get()
      if (!artifact) throw new ArtifactNotFoundError(input.artifactId)
      if (artifact.revision !== input.revision) throw new ArtifactRevisionConflictError(artifact.revision)

      const nextVersionNumber = this.nextVersionNumber(transaction, input.artifactId)
      const version = transaction
        .insert(artifactVersions)
        .values({
          id: this.newId(input.now),
          artifactId: input.artifactId,
          versionNumber: nextVersionNumber,
          parentVersionId: artifact.currentVersionId,
          contentRefType: 'inline',
          contentRefId: null,
          inlineText: input.text,
          metadataJson: JSON.stringify(input.metadata ?? {}),
          source: 'user',
          operationRunId: null,
          createdBy: input.createdBy,
          createdAt: input.now,
        })
        .returning()
        .get()
      const updated = transaction
        .update(artifacts)
        .set({ currentVersionId: version.id, revision: artifact.revision + 1, updatedAt: input.now })
        .where(and(eq(artifacts.id, input.artifactId), eq(artifacts.revision, artifact.revision)))
        .returning()
        .get()
      if (!updated) throw new ArtifactRevisionConflictError(artifact.revision)
      return { artifact: updated, version }
    })
  }

  /** 恢复历史版本为 current：复制内容为新版本（source=system），不删历史链。 */
  restoreVersion(input: {
    artifactId: string
    versionId: string
    createdBy: string
    now: number
  }): { artifact: ArtifactRecord; version: ArtifactVersionRecord } {
    return this.db.transaction((transaction) => {
      const artifact = transaction
        .select()
        .from(artifacts)
        .where(and(eq(artifacts.id, input.artifactId), isNull(artifacts.deletedAt)))
        .get()
      if (!artifact) throw new ArtifactNotFoundError(input.artifactId)
      const source = transaction
        .select()
        .from(artifactVersions)
        .where(and(eq(artifactVersions.id, input.versionId), eq(artifactVersions.artifactId, input.artifactId)))
        .get()
      if (!source) throw new ArtifactVersionNotFoundError(input.versionId)

      const nextVersionNumber = this.nextVersionNumber(transaction, input.artifactId)
      const version = transaction
        .insert(artifactVersions)
        .values({
          id: this.newId(input.now),
          artifactId: input.artifactId,
          versionNumber: nextVersionNumber,
          parentVersionId: source.id,
          contentRefType: source.contentRefType,
          contentRefId: source.contentRefId,
          inlineText: source.inlineText,
          metadataJson: source.metadataJson,
          source: 'system',
          operationRunId: null,
          createdBy: input.createdBy,
          createdAt: input.now,
        })
        .returning()
        .get()
      const updated = transaction
        .update(artifacts)
        .set({ currentVersionId: version.id, revision: artifact.revision + 1, updatedAt: input.now })
        .where(and(eq(artifacts.id, input.artifactId), eq(artifacts.revision, artifact.revision)))
        .returning()
        .get()
      if (!updated) throw new ArtifactRevisionConflictError(artifact.revision)
      return { artifact: updated, version }
    })
  }

  /** AI/import 生成新版本（transform），更新 current_version_id 但不 bump revision。 */
  createVersion(input: NewArtifactVersionInput): { artifact: ArtifactRecord; version: ArtifactVersionRecord } {
    return this.db.transaction((transaction) => {
      const artifact = transaction
        .select()
        .from(artifacts)
        .where(and(eq(artifacts.id, input.artifactId), isNull(artifacts.deletedAt)))
        .get()
      if (!artifact) throw new ArtifactNotFoundError(input.artifactId)
      const nextVersionNumber = this.nextVersionNumber(transaction, input.artifactId)
      const version = transaction
        .insert(artifactVersions)
        .values({
          id: this.newId(input.createdAt),
          artifactId: input.artifactId,
          versionNumber: nextVersionNumber,
          parentVersionId: input.parentVersionId ?? artifact.currentVersionId ?? null,
          contentRefType: input.contentRef?.type === 'asset' ? 'asset' : input.contentRef?.type === 'inline' ? 'inline' : null,
          contentRefId: input.contentRef?.type === 'asset' ? input.contentRef.id ?? null : null,
          inlineText: input.contentRef?.type === 'inline' ? input.contentRef.text ?? null : null,
          metadataJson: JSON.stringify(input.metadata ?? {}),
          source: input.source,
          operationRunId: input.operationRunId ?? null,
          createdBy: input.createdBy,
          createdAt: input.createdAt,
        })
        .returning()
        .get()
      const updated = transaction
        .update(artifacts)
        .set({ currentVersionId: version.id, updatedAt: input.createdAt })
        .where(and(eq(artifacts.id, input.artifactId), isNull(artifacts.deletedAt)))
        .returning()
        .get()
      if (!updated) throw new ArtifactSoftDeletedError(input.artifactId)
      return { artifact: updated, version }
    })
  }

  async getVersionById(id: string): Promise<ArtifactVersionRecord | null> {
    return this.db.select().from(artifactVersions).where(eq(artifactVersions.id, id)).get() ?? null
  }

  async listVersionsByArtifact(artifactId: string, limit = 100): Promise<ArtifactVersionRecord[]> {
    return this.db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifactId))
      .orderBy(desc(artifactVersions.versionNumber))
      .limit(limit)
      .all()
  }

  async listVersionsByArtifactCursor(artifactId: string, cursor?: { versionNumber: number; id: string }, limit = 30) {
    const capped = Math.min(Math.max(limit, 1), 100)
    const rows = this.db
      .select()
      .from(artifactVersions)
      .where(and(
        eq(artifactVersions.artifactId, artifactId),
        cursor === undefined
          ? undefined
          : or(
              lt(artifactVersions.versionNumber, cursor.versionNumber),
              and(eq(artifactVersions.versionNumber, cursor.versionNumber), lt(artifactVersions.id, cursor.id)),
            ),
      ))
      .orderBy(desc(artifactVersions.versionNumber), desc(artifactVersions.id))
      .limit(capped + 1)
      .all()
    return { items: rows.slice(0, capped), hasMore: rows.length > capped }
  }

  private nextVersionNumber(transaction: DatabaseClient, artifactId: string): number {
    const latest = transaction
      .select({ value: max(artifactVersions.versionNumber) })
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifactId))
      .get()
    return (latest?.value ?? 0) + 1
  }

  private newId(now: number): string {
    return ulid(now)
  }
}
