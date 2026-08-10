import { assetListResponseSchema, assetResponseSchema, type AssetKind } from '@creator-studio/contracts'
import { apiRequest } from '../../shared/api'
import { resetSessionStoreForTests } from '../session'

export async function listAssets(input: { projectId?: string; type?: AssetKind; cursor?: string }) {
  const query = new URLSearchParams()
  if (input.projectId) query.set('projectId', input.projectId)
  if (input.type) query.set('type', input.type)
  if (input.cursor) query.set('cursor', input.cursor)
  return apiRequest(`/assets${query.size ? `?${query}` : ''}`, assetListResponseSchema)
}

export async function uploadAsset(file: File, projectId?: string, signal?: AbortSignal) {
  const body = new FormData()
  body.set('file', file)
  if (projectId) body.set('projectId', projectId)
  return apiRequest('/assets/upload', assetResponseSchema, { method: 'POST', body, timeoutMs: 60_000, ...(signal ? { signal } : {}) })
}

export function resetAssetApiForTests() { resetSessionStoreForTests() }
