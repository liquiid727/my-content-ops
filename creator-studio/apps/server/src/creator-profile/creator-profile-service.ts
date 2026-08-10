import {
  creatorProfileEntitySchema,
  injectionSettingsSchema,
  personalStyleSchema,
  serializeIsoDateTime,
  type CreatorProfileEntity,
  type CreatorProfilePatch,
  type ImportProfileRequest,
  type RenderRequest,
  type SectionKey,
} from '@creator-studio/contracts'

import type { CreatorProfileRecord } from '../db/schema.js'
import { createRevisionConflictError, HttpError } from '../http/errors.js'
import { ConfigRepository } from '../repositories/index.js'
import {
  CreatorProfileNotFoundError,
  CreatorProfileRepository,
  CreatorProfileRevisionConflictError,
} from './creator-profile-repository.js'
import { renderContext } from './context-render.js'
import { ALAOS_BIO, ALAOS_DISPLAY_NAME, ALAOS_INJECTION, ALAOS_PROFILE } from './seed-profile.js'
import { applyImportToSection, readVaultMarkdown, VaultImportError } from './vault-import.js'

const IMPORT_FAILED = 'IMPORT_FAILED'

export interface CreatorProfileServiceIdentity {
  workspaceId: string
  creatorProfileId: string
}

function profileNotFound(): HttpError {
  return new HttpError({ status: 404, code: 'NOT_FOUND', message: '画像不存在。' })
}

export function mapProfile(record: CreatorProfileRecord): CreatorProfileEntity {
  return creatorProfileEntitySchema.parse({
    id: record.id,
    workspaceId: record.workspaceId,
    displayName: record.displayName,
    avatarAssetId: record.avatarAssetId,
    bio: record.bio,
    profile: personalStyleSchema.parse(JSON.parse(record.profileJson)),
    injection: injectionSettingsSchema.parse(JSON.parse(record.injectionJson)),
    revision: record.revision,
    createdAt: serializeIsoDateTime(new Date(record.createdAt)),
    updatedAt: serializeIsoDateTime(new Date(record.updatedAt)),
  })
}

export class CreatorProfileService {
  constructor(
    private readonly profiles: CreatorProfileRepository,
    private readonly configs: ConfigRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async get(identity: CreatorProfileServiceIdentity): Promise<CreatorProfileEntity> {
    const record = await this.profiles.getByWorkspaceAndId(identity.workspaceId, identity.creatorProfileId)
    if (!record) throw profileNotFound()
    return mapProfile(record)
  }

  async update(
    identity: CreatorProfileServiceIdentity,
    profileId: string,
    revision: number,
    patch: CreatorProfilePatch,
  ): Promise<CreatorProfileEntity> {
    const existing = await this.profiles.getByWorkspaceAndId(identity.workspaceId, profileId)
    if (!existing) throw profileNotFound()
    try {
      const updated = await this.profiles.update(profileId, identity.workspaceId, revision, {
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.avatarAssetId !== undefined ? { avatarAssetId: patch.avatarAssetId } : {}),
        ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
        ...(patch.profile !== undefined ? { profileJson: JSON.stringify(patch.profile) } : {}),
        ...(patch.injection !== undefined ? { injectionJson: JSON.stringify(patch.injection) } : {}),
      }, this.now())
      return mapProfile(updated)
    } catch (error) {
      this.rethrowWriteError(error)
    }
  }

  async render(identity: CreatorProfileServiceIdentity, input: RenderRequest): Promise<{ text: string }> {
    const profileId = input.profileId ?? identity.creatorProfileId
    const record = await this.profiles.getByWorkspaceAndId(identity.workspaceId, profileId)
    if (!record) throw profileNotFound()
    const profile = personalStyleSchema.parse(JSON.parse(record.profileJson))
    const injection = injectionSettingsSchema.parse(JSON.parse(record.injectionJson))
    return { text: renderContext(profile, injection, input.scope) }
  }

  async importVault(
    identity: CreatorProfileServiceIdentity,
    input: ImportProfileRequest,
  ): Promise<{ profile: CreatorProfileEntity; imported: SectionKey[] }> {
    const record = await this.profiles.getByWorkspaceAndId(identity.workspaceId, identity.creatorProfileId)
    if (!record) throw profileNotFound()

    const vaultRoot = await this.resolveVaultRoot(identity.workspaceId)
    let markdown: string
    try {
      markdown = await readVaultMarkdown(vaultRoot, input.vaultPath)
    } catch (error) {
      if (error instanceof VaultImportError) {
        throw new HttpError({ status: 422, code: IMPORT_FAILED, message: error.message })
      }
      throw error
    }

    const current = personalStyleSchema.parse(JSON.parse(record.profileJson))
    const nextProfile = applyImportToSection(current, input.targetSection, markdown)

    try {
      const updated = await this.profiles.update(
        record.id,
        identity.workspaceId,
        record.revision,
        { profileJson: JSON.stringify(nextProfile) },
        this.now(),
      )
      return { profile: mapProfile(updated), imported: [input.targetSection] }
    } catch (error) {
      this.rethrowWriteError(error)
    }
  }

  getDefault(identity: CreatorProfileServiceIdentity): CreatorProfileEntity {
    return creatorProfileEntitySchema.parse({
      id: identity.creatorProfileId,
      workspaceId: identity.workspaceId,
      displayName: ALAOS_DISPLAY_NAME,
      avatarAssetId: null,
      bio: ALAOS_BIO,
      profile: ALAOS_PROFILE,
      injection: ALAOS_INJECTION,
      revision: 1,
      createdAt: serializeIsoDateTime(new Date(0)),
      updatedAt: serializeIsoDateTime(new Date(0)),
    })
  }

  private async resolveVaultRoot(workspaceId: string): Promise<string> {
    const connector = await this.configs.getConnector(workspaceId, 'obsidian')
    if (!connector) {
      throw new HttpError({ status: 422, code: IMPORT_FAILED, message: '请先在设置中配置 Obsidian Vault。' })
    }
    const values = JSON.parse(connector.configJson) as { vaultRoot?: unknown }
    const vaultRoot = typeof values.vaultRoot === 'string' ? values.vaultRoot.trim() : ''
    if (!vaultRoot) {
      throw new HttpError({ status: 422, code: IMPORT_FAILED, message: 'Obsidian Vault 根目录未配置。' })
    }
    return vaultRoot
  }

  private rethrowWriteError(error: unknown): never {
    if (error instanceof CreatorProfileRevisionConflictError) {
      throw createRevisionConflictError(error.currentRevision)
    }
    if (error instanceof CreatorProfileNotFoundError) throw profileNotFound()
    throw error
  }
}
