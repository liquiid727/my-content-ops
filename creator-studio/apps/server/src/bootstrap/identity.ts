import { ulid } from 'ulid'

import type { CreatorProfileRecord, WorkspaceRecord } from '../db/schema.js'
import { ALAOS_BIO, ALAOS_DISPLAY_NAME, ALAOS_INJECTION, ALAOS_PROFILE } from '../creator-profile/seed-profile.js'
import { WorkspaceRepository } from '../repositories/workspace-repository.js'

export const LOCAL_WORKSPACE_SLUG = 'local'

export interface LocalIdentity {
  workspace: WorkspaceRecord
  creatorProfile: CreatorProfileRecord
}

export async function ensureLocalIdentity(repository: WorkspaceRepository, now = Date.now()): Promise<LocalIdentity> {
  const existingWorkspace = await repository.getBySlug(LOCAL_WORKSPACE_SLUG)
  if (existingWorkspace) {
    const creatorProfile = await repository.getProfile(existingWorkspace.id)
    if (!creatorProfile) throw new Error(`Workspace ${existingWorkspace.id} is missing its CreatorProfile`)
    return { workspace: existingWorkspace, creatorProfile }
  }

  try {
    const created = await repository.createWithProfile({
      workspace: {
        id: ulid(now),
        name: '个人创作空间',
        slug: LOCAL_WORKSPACE_SLUG,
        settingsJson: '{}',
        createdAt: now,
        updatedAt: now,
      },
      profile: {
        id: ulid(now + 1),
        displayName: ALAOS_DISPLAY_NAME,
        bio: ALAOS_BIO,
        preferencesJson: JSON.stringify({ theme: 'dark', locale: 'zh-CN' }),
        profileJson: JSON.stringify(ALAOS_PROFILE),
        injectionJson: JSON.stringify(ALAOS_INJECTION),
        createdAt: now,
        updatedAt: now,
      },
    })
    return { workspace: created.workspace, creatorProfile: created.profile }
  } catch (error) {
    const workspace = await repository.getBySlug(LOCAL_WORKSPACE_SLUG)
    const creatorProfile = workspace ? await repository.getProfile(workspace.id) : null
    if (workspace && creatorProfile) return { workspace, creatorProfile }
    throw error
  }
}
