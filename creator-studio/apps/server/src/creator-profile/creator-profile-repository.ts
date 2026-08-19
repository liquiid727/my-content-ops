import { and, eq, sql } from 'drizzle-orm'

import { creatorProfiles, type CreatorProfileRecord } from '../db/schema.js'
import { validateJsonText } from '../repositories/json.js'
import type { DatabaseClient } from '../repositories/types.js'

export class CreatorProfileRevisionConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super(`Creator profile revision conflict; current revision is ${currentRevision}`)
    this.name = 'CreatorProfileRevisionConflictError'
  }
}

export class CreatorProfileNotFoundError extends Error {
  constructor(readonly profileId: string) {
    super(`Creator profile ${profileId} was not found`)
    this.name = 'CreatorProfileNotFoundError'
  }
}

export interface CreatorProfileUpdatePatch {
  displayName?: string | undefined
  avatarAssetId?: string | null | undefined
  bio?: string | undefined
  profileJson?: string | undefined
  injectionJson?: string | undefined
}

export class CreatorProfileRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getByWorkspaceAndId(workspaceId: string, id: string): Promise<CreatorProfileRecord | null> {
    return this.db
      .select()
      .from(creatorProfiles)
      .where(and(eq(creatorProfiles.id, id), eq(creatorProfiles.workspaceId, workspaceId)))
      .get() ?? null
  }

  async getByWorkspace(workspaceId: string): Promise<CreatorProfileRecord | null> {
    return this.db.select().from(creatorProfiles).where(eq(creatorProfiles.workspaceId, workspaceId)).get() ?? null
  }

  async update(
    id: string,
    workspaceId: string,
    revision: number,
    patch: CreatorProfileUpdatePatch,
    updatedAt = Date.now(),
  ): Promise<CreatorProfileRecord> {
    const updated = this.db
      .update(creatorProfiles)
      .set({
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.avatarAssetId !== undefined ? { avatarAssetId: patch.avatarAssetId } : {}),
        ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
        ...(patch.profileJson !== undefined ? { profileJson: validateJsonText(patch.profileJson, 'creatorProfile.profile') } : {}),
        ...(patch.injectionJson !== undefined ? { injectionJson: validateJsonText(patch.injectionJson, 'creatorProfile.injection') } : {}),
        revision: sql`${creatorProfiles.revision} + 1`,
        updatedAt,
      })
      .where(and(
        eq(creatorProfiles.id, id),
        eq(creatorProfiles.workspaceId, workspaceId),
        eq(creatorProfiles.revision, revision),
      ))
      .returning()
      .get()

    if (updated) return updated
    throw await this.resolveUpdateFailure(workspaceId, id)
  }

  private async resolveUpdateFailure(workspaceId: string, id: string): Promise<Error> {
    const current = this.db
      .select({ revision: creatorProfiles.revision })
      .from(creatorProfiles)
      .where(and(eq(creatorProfiles.id, id), eq(creatorProfiles.workspaceId, workspaceId)))
      .get()
    return current ? new CreatorProfileRevisionConflictError(current.revision) : new CreatorProfileNotFoundError(id)
  }
}
