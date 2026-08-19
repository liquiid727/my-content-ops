import {
  creatorProfileEntityResponseSchema,
  importProfileResponseSchema,
  renderResponseSchema,
  type CreatorProfilePatch,
  type ImportProfileRequest,
  type InjectScope,
} from '@creator-studio/contracts'
import { apiRequest } from '../../shared/api'

export const creatorProfileApi = {
  async get() {
    return apiRequest('/creator-profile', creatorProfileEntityResponseSchema)
  },
  async getDefault() {
    return apiRequest('/creator-profile/default', creatorProfileEntityResponseSchema)
  },
  async update(profileId: string, revision: number, patch: CreatorProfilePatch) {
    return apiRequest(`/creator-profile/${encodeURIComponent(profileId)}`, creatorProfileEntityResponseSchema, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision, patch }),
    })
  },
  async render(input: { profileId?: string; scope: InjectScope }) {
    return apiRequest('/creator-profile/render', renderResponseSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  },
  async importVault(input: ImportProfileRequest) {
    return apiRequest('/creator-profile/import', importProfileResponseSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  },
}
