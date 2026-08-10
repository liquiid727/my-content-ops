import { and, eq } from 'drizzle-orm'

import { creatorProfiles, workspaces, type CreatorProfileRecord, type WorkspaceRecord } from '../db/schema.js'
import { validateDefaultedJsonText } from './json.js'
import type { DatabaseClient } from './types.js'

export interface CreateWorkspaceWithProfileInput {
  workspace: typeof workspaces.$inferInsert
  profile: Omit<typeof creatorProfiles.$inferInsert, 'workspaceId'>
}

export class WorkspaceRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getById(id: string): Promise<WorkspaceRecord | null> {
    return this.db.select().from(workspaces).where(eq(workspaces.id, id)).get() ?? null
  }

  async getBySlug(slug: string): Promise<WorkspaceRecord | null> {
    return this.db.select().from(workspaces).where(eq(workspaces.slug, slug)).get() ?? null
  }

  async getProfile(workspaceId: string): Promise<CreatorProfileRecord | null> {
    return this.db.select().from(creatorProfiles).where(eq(creatorProfiles.workspaceId, workspaceId)).get() ?? null
  }

  async createWithProfile(input: CreateWorkspaceWithProfileInput): Promise<{ workspace: WorkspaceRecord; profile: CreatorProfileRecord }> {
    return this.db.transaction((transaction) => {
      const workspace = transaction.insert(workspaces).values({
        ...input.workspace,
        settingsJson: validateDefaultedJsonText(input.workspace.settingsJson, 'workspace.settingsJson'),
      }).returning().get()
      const profile = transaction
        .insert(creatorProfiles)
        .values({
          ...input.profile,
          workspaceId: workspace.id,
          preferencesJson: validateDefaultedJsonText(input.profile.preferencesJson, 'creatorProfile.preferencesJson'),
        })
        .returning()
        .get()
      return { workspace, profile }
    })
  }

  async updateProfilePreferences(workspaceId: string, profileId: string, preferencesJson: string, updatedAt: number): Promise<CreatorProfileRecord | null> {
    return this.db.update(creatorProfiles).set({
      preferencesJson: validateDefaultedJsonText(preferencesJson, 'creatorProfile.preferencesJson'),
      updatedAt,
    }).where(and(eq(creatorProfiles.workspaceId, workspaceId), eq(creatorProfiles.id, profileId))).returning().get() ?? null
  }
}
