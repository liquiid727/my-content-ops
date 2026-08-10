import {
  type CreatorProfileEntity,
  type CreatorProfilePatch,
  type InjectScope,
  type SectionKey,
} from '@creator-studio/contracts'
import { create } from 'zustand'

import { ApiClientError } from '../../shared/api'
import { getLocalizedErrorMessage, i18n } from '../i18n'
import { creatorProfileApi } from './creator-profile-api'

const REVISION_CONFLICT_CODE = 'REVISION_CONFLICT'

function errorMessage(error: unknown): string {
  return getLocalizedErrorMessage(error, i18n.t)
}

function isRevisionConflict(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === REVISION_CONFLICT_CODE
}

interface CreatorProfileState {
  profile: CreatorProfileEntity | null
  loading: boolean
  saving: boolean
  importing: boolean
  error: string | undefined
  revisionConflict: boolean
  previewText: string
  load: () => Promise<CreatorProfileEntity | null>
  save: (profileId: string, revision: number, patch: CreatorProfilePatch) => Promise<CreatorProfileEntity | null>
  importVault: (vaultPath: string, targetSection: SectionKey) => Promise<SectionKey[] | null>
  renderPreview: (scope: InjectScope, profileId?: string) => Promise<void>
  clearError: () => void
}

export const useCreatorProfileStore = create<CreatorProfileState>((set) => ({
  profile: null,
  loading: false,
  saving: false,
  importing: false,
  error: undefined,
  revisionConflict: false,
  previewText: '',

  load: async () => {
    set({ loading: true, error: undefined, revisionConflict: false })
    try {
      const response = await creatorProfileApi.get()
      set({ profile: response.data, loading: false })
      return response.data
    } catch (error) {
      set({ loading: false, error: errorMessage(error) })
      return null
    }
  },

  save: async (profileId, revision, patch) => {
    set({ saving: true, error: undefined, revisionConflict: false })
    try {
      const response = await creatorProfileApi.update(profileId, revision, patch)
      set({ profile: response.data, saving: false })
      return response.data
    } catch (error) {
      set({
        saving: false,
        error: errorMessage(error),
        revisionConflict: isRevisionConflict(error),
      })
      return null
    }
  },

  importVault: async (vaultPath, targetSection) => {
    set({ importing: true, error: undefined, revisionConflict: false })
    try {
      const response = await creatorProfileApi.importVault({ vaultPath, targetSection })
      set({ profile: response.data.profile, importing: false })
      return response.data.imported
    } catch (error) {
      set({ importing: false, error: errorMessage(error) })
      return null
    }
  },

  renderPreview: async (scope, profileId) => {
    try {
      const response = await creatorProfileApi.render({ scope, ...(profileId ? { profileId } : {}) })
      set({ previewText: response.data.text })
    } catch (error) {
      set({ error: errorMessage(error) })
    }
  },

  clearError: () => set({ error: undefined, revisionConflict: false }),
}))
