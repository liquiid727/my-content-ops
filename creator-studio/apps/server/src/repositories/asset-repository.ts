import { and, desc, eq, isNull, lt, or } from 'drizzle-orm'

import { assets, creatorProfiles, projects, versions, type AssetRecord } from '../db/schema.js'
import { validateDefaultedJsonText } from './json.js'
import type { DatabaseClient } from './types.js'

export interface AssetListCursor { createdAt: number; id: string }
export interface AssetListQuery {
  workspaceId: string
  projectId?: string | undefined
  kind?: AssetRecord['kind'] | undefined
  cursor?: AssetListCursor | undefined
  limit?: number | undefined
}

export class AssetRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getById(id: string): Promise<AssetRecord | null> {
    return this.db.select().from(assets).where(and(eq(assets.id, id), isNull(assets.deletedAt))).get() ?? null
  }

  async getByWorkspaceAndId(workspaceId: string, id: string): Promise<AssetRecord | null> {
    return this.db.select().from(assets).where(and(eq(assets.id, id), eq(assets.workspaceId, workspaceId), isNull(assets.deletedAt))).get() ?? null
  }

  async list(query: AssetListQuery) {
    const limit = Math.min(Math.max(query.limit ?? 30, 1), 100)
    const rows = this.db.select().from(assets).where(and(
      eq(assets.workspaceId, query.workspaceId),
      isNull(assets.deletedAt),
      query.projectId ? eq(assets.projectId, query.projectId) : undefined,
      query.kind ? eq(assets.kind, query.kind) : undefined,
      query.cursor ? or(lt(assets.createdAt, query.cursor.createdAt), and(eq(assets.createdAt, query.cursor.createdAt), lt(assets.id, query.cursor.id))) : undefined,
    )).orderBy(desc(assets.createdAt), desc(assets.id)).limit(limit + 1).all()
    return { items: rows.slice(0, limit), hasMore: rows.length > limit }
  }

  async listByProject(projectId: string): Promise<AssetRecord[]> {
    return this.db
      .select()
      .from(assets)
      .where(and(eq(assets.projectId, projectId), isNull(assets.deletedAt)))
      .orderBy(desc(assets.createdAt))
      .all()
  }

  async create(input: typeof assets.$inferInsert): Promise<AssetRecord> {
    return this.db.insert(assets).values({
      ...input,
      metadataJson: validateDefaultedJsonText(input.metadataJson, 'asset.metadataJson'),
    }).returning().get()
  }

  async softDelete(id: string, deletedAt = Date.now()): Promise<void> {
    this.db.update(assets).set({ deletedAt, updatedAt: deletedAt }).where(and(eq(assets.id, id), isNull(assets.deletedAt))).run()
  }

  async hardDelete(id: string): Promise<void> {
    this.db.delete(assets).where(eq(assets.id, id)).run()
  }

  async isReferenced(id: string): Promise<boolean> {
    const versionReference = this.db.select({ id: versions.id }).from(versions).where(and(eq(versions.subjectType, 'asset'), eq(versions.subjectId, id))).limit(1).get()
    if (versionReference) return true
    const projectReference = this.db.select({ id: projects.id }).from(projects).where(eq(projects.coverAssetId, id)).limit(1).get()
    if (projectReference) return true
    return this.db.select({ id: creatorProfiles.id }).from(creatorProfiles).where(eq(creatorProfiles.avatarAssetId, id)).limit(1).get() !== undefined
  }
}
