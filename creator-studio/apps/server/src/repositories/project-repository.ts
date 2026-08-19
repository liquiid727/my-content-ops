import { and, desc, eq, isNull, lt, ne, or, sql } from 'drizzle-orm'

import { idempotencyRecords, projects, type ProjectRecord } from '../db/schema.js'
import { validateDefaultedJsonText } from './json.js'
import type { DatabaseClient, Page } from './types.js'

export interface ProjectListCursor {
  updatedAt: number
  id: string
}

export interface ProjectListQuery {
  workspaceId: string
  status?: ProjectRecord['status'] | undefined
  cursor?: ProjectListCursor | undefined
  includeDeleted?: boolean
  limit?: number
}

export interface ProjectPatch {
  title?: string | undefined
  brief?: string | undefined
  status?: ProjectRecord['status'] | undefined
  contentType?: string | undefined
  targetPlatform?: string | null | undefined
  targetDurationMs?: number | null | undefined
  coverAssetId?: string | null | undefined
  settingsJson?: string | undefined
}

export class ProjectRevisionConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super(`Project revision conflict; current revision is ${currentRevision}`)
    this.name = 'ProjectRevisionConflictError'
  }
}

export class ProjectNotFoundError extends Error {
  constructor(readonly projectId: string) {
    super(`Project ${projectId} was not found`)
    this.name = 'ProjectNotFoundError'
  }
}

export class ProjectIdempotencyKeyReusedError extends Error {
  constructor() {
    super('The idempotency key was already used for a different project request')
    this.name = 'ProjectIdempotencyKeyReusedError'
  }
}

export interface IdempotentProjectCreate {
  idempotency: {
    id: string
    key: string
    requestHash: string
    expiresAt: number
    createdAt: number
  }
  project: typeof projects.$inferInsert
}

export class ProjectRepository {
  constructor(private readonly db: DatabaseClient) {}

  async list(query: ProjectListQuery): Promise<Page<ProjectRecord>> {
    const limit = Math.min(Math.max(query.limit ?? 30, 1), 100)
    const rows = this.db
      .select()
      .from(projects)
      .where(and(
        eq(projects.workspaceId, query.workspaceId),
        query.status === undefined ? ne(projects.status, 'archived') : eq(projects.status, query.status),
        query.cursor === undefined
          ? undefined
          : or(
              lt(projects.updatedAt, query.cursor.updatedAt),
              and(eq(projects.updatedAt, query.cursor.updatedAt), lt(projects.id, query.cursor.id)),
            ),
        query.includeDeleted ? undefined : isNull(projects.deletedAt),
      ))
      .orderBy(desc(projects.updatedAt), desc(projects.id))
      .limit(limit + 1)
      .all()

    return { items: rows.slice(0, limit), hasMore: rows.length > limit }
  }

  async getById(id: string): Promise<ProjectRecord | null> {
    return this.db.select().from(projects).where(and(eq(projects.id, id), isNull(projects.deletedAt))).get() ?? null
  }

  async getByWorkspaceAndId(workspaceId: string, id: string): Promise<ProjectRecord | null> {
    return this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt)))
      .get() ?? null
  }

  async create(input: typeof projects.$inferInsert): Promise<ProjectRecord> {
    return this.db.insert(projects).values({
      ...input,
      settingsJson: validateDefaultedJsonText(input.settingsJson, 'project.settingsJson'),
    }).returning().get()
  }

  createIdempotent(input: IdempotentProjectCreate): { project: ProjectRecord; replayed: boolean } {
    const settingsJson = validateDefaultedJsonText(input.project.settingsJson, 'project.settingsJson')

    return this.db.transaction((transaction) => {
      const existing = transaction
        .select()
        .from(idempotencyRecords)
        .where(and(
          eq(idempotencyRecords.workspaceId, input.project.workspaceId),
          eq(idempotencyRecords.key, input.idempotency.key),
        ))
        .get()

      if (existing) {
        if (existing.requestHash !== input.idempotency.requestHash) {
          throw new ProjectIdempotencyKeyReusedError()
        }
        const project = existing.resourceId
          ? transaction
              .select()
              .from(projects)
              .where(and(
                eq(projects.id, existing.resourceId),
                eq(projects.workspaceId, input.project.workspaceId),
                isNull(projects.deletedAt),
              ))
              .get()
          : undefined
        if (!project) throw new Error('Completed project idempotency record is missing its resource')
        return { project, replayed: true }
      }

      const project = transaction.insert(projects).values({ ...input.project, settingsJson }).returning().get()
      transaction.insert(idempotencyRecords).values({
        ...input.idempotency,
        workspaceId: input.project.workspaceId,
        responseStatus: 201,
        responseJson: JSON.stringify({ projectId: project.id }),
        resourceType: 'project',
        resourceId: project.id,
      }).run()
      return { project, replayed: false }
    })
  }

  async update(id: string, revision: number, patch: ProjectPatch, updatedAt = Date.now()): Promise<ProjectRecord> {
    const updated = this.db
      .update(projects)
      .set({
        ...patch,
        settingsJson: validateDefaultedJsonText(patch.settingsJson, 'project.settingsJson'),
        revision: sql`${projects.revision} + 1`,
        updatedAt,
      })
      .where(and(eq(projects.id, id), eq(projects.revision, revision), isNull(projects.deletedAt)))
      .returning()
      .get()

    if (updated) return updated
    throw await this.resolveUpdateFailure(id)
  }

  async softDelete(id: string, revision: number, deletedAt = Date.now()): Promise<void> {
    const deleted = this.db
      .update(projects)
      .set({ deletedAt, updatedAt: deletedAt, revision: sql`${projects.revision} + 1` })
      .where(and(eq(projects.id, id), eq(projects.revision, revision), isNull(projects.deletedAt)))
      .returning({ id: projects.id })
      .get()

    if (!deleted) throw await this.resolveUpdateFailure(id)
  }

  private async resolveUpdateFailure(id: string): Promise<Error> {
    const current = this.db.select({ revision: projects.revision }).from(projects).where(eq(projects.id, id)).get()
    return current ? new ProjectRevisionConflictError(current.revision) : new ProjectNotFoundError(id)
  }
}
