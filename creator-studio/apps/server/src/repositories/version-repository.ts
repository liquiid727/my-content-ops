import { and, asc, desc, eq, max } from 'drizzle-orm'

import { idempotencyRecords, versions, type VersionRecord } from '../db/schema.js'
import { validateJsonText } from './json.js'
import type { DatabaseClient } from './types.js'

export type NewCurrentVersion = Omit<typeof versions.$inferInsert, 'versionNumber' | 'isCurrent'>

export class VersionRepository {
  constructor(private readonly db: DatabaseClient) {}

  async list(subjectType: VersionRecord['subjectType'], subjectId: string): Promise<VersionRecord[]> {
    return this.db
      .select()
      .from(versions)
      .where(and(eq(versions.subjectType, subjectType), eq(versions.subjectId, subjectId)))
      .orderBy(asc(versions.versionNumber))
      .all()
  }

  async listLatestByProject(projectId: string, limit = 5): Promise<VersionRecord[]> {
    return this.db
      .select()
      .from(versions)
      .where(eq(versions.projectId, projectId))
      .orderBy(desc(versions.createdAt), desc(versions.id))
      .limit(limit)
      .all()
  }

  async listByProject(projectId: string, subjectType?: VersionRecord['subjectType']): Promise<VersionRecord[]> {
    return this.db.select().from(versions).where(and(
      eq(versions.projectId, projectId),
      subjectType ? eq(versions.subjectType, subjectType) : undefined,
    )).orderBy(desc(versions.createdAt), desc(versions.id)).all()
  }

  async getByWorkspaceAndId(workspaceId: string, id: string): Promise<VersionRecord | null> {
    return this.db.select().from(versions).where(and(eq(versions.workspaceId, workspaceId), eq(versions.id, id))).get() ?? null
  }

  async isAssetReferenced(assetId: string): Promise<boolean> {
    return this.db.select({ id: versions.id }).from(versions).where(and(eq(versions.subjectType, 'asset'), eq(versions.subjectId, assetId))).limit(1).get() !== undefined
  }

  async createCurrent(input: NewCurrentVersion): Promise<VersionRecord> {
    validateJsonText(input.snapshotJson, 'version.snapshotJson')
    return this.db.transaction((transaction) => {
      const latest = transaction
        .select({ value: max(versions.versionNumber) })
        .from(versions)
        .where(and(
          eq(versions.workspaceId, input.workspaceId),
          eq(versions.subjectType, input.subjectType),
          eq(versions.subjectId, input.subjectId),
        ))
        .get()

      transaction
        .update(versions)
        .set({ isCurrent: false })
        .where(and(
          eq(versions.workspaceId, input.workspaceId),
          eq(versions.subjectType, input.subjectType),
          eq(versions.subjectId, input.subjectId),
          eq(versions.isCurrent, true),
        ))
        .run()

      return transaction
        .insert(versions)
        .values({ ...input, versionNumber: (latest?.value ?? 0) + 1, isCurrent: true })
        .returning()
        .get()
    })
  }

  restoreIdempotent(input: {
    source: VersionRecord
    id: string
    createdBy: string
    createdAt: number
    idempotency: { id: string; key: string; requestHash: string; expiresAt: number }
  }): VersionRecord {
    return this.db.transaction((transaction) => {
      const existing = transaction.select().from(idempotencyRecords).where(and(
        eq(idempotencyRecords.workspaceId, input.source.workspaceId),
        eq(idempotencyRecords.key, input.idempotency.key),
      )).get()
      if (existing) {
        if (existing.requestHash !== input.idempotency.requestHash) throw new Error('IDEMPOTENCY_KEY_REUSED')
        const version = existing.resourceId ? transaction.select().from(versions).where(eq(versions.id, existing.resourceId)).get() : undefined
        if (!version) throw new Error('Completed version idempotency record is missing its resource')
        return version
      }

      const latest = transaction.select({ value: max(versions.versionNumber) }).from(versions).where(and(
        eq(versions.workspaceId, input.source.workspaceId),
        eq(versions.subjectType, input.source.subjectType),
        eq(versions.subjectId, input.source.subjectId),
      )).get()
      transaction.update(versions).set({ isCurrent: false }).where(and(
        eq(versions.workspaceId, input.source.workspaceId),
        eq(versions.subjectType, input.source.subjectType),
        eq(versions.subjectId, input.source.subjectId),
        eq(versions.isCurrent, true),
      )).run()
      const restored = transaction.insert(versions).values({
        id: input.id,
        workspaceId: input.source.workspaceId,
        projectId: input.source.projectId,
        subjectType: input.source.subjectType,
        subjectId: input.source.subjectId,
        versionNumber: (latest?.value ?? 0) + 1,
        snapshotJson: input.source.snapshotJson,
        changeSummary: `Restored from version ${input.source.versionNumber}`,
        isCurrent: true,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
      }).returning().get()
      transaction.insert(idempotencyRecords).values({
        ...input.idempotency,
        workspaceId: input.source.workspaceId,
        responseStatus: 201,
        responseJson: JSON.stringify({ versionId: restored.id }),
        resourceType: 'version',
        resourceId: restored.id,
        createdAt: input.createdAt,
      }).run()
      return restored
    })
  }
}
