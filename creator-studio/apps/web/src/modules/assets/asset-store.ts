import type { Asset, AssetKind } from '@creator-studio/contracts'
import { create } from 'zustand'

import { getLocalizedErrorMessage, i18n } from '../i18n'
import { listAssets, uploadAsset } from './asset-api'

interface AssetState {
  assets: Asset[]
  loading: boolean
  error: string | undefined
  hasMore: boolean
  nextCursor: string | undefined
  uploading: boolean
  uploadError: string | undefined
  load: (filter?: { projectId?: string; type?: AssetKind }, cursor?: string) => Promise<void>
  upload: (file: File, projectId?: string, signal?: AbortSignal) => Promise<Asset>
}

export const useAssetStore = create<AssetState>((set) => ({
  assets: [], loading: false, error: undefined, hasMore: false, nextCursor: undefined, uploading: false, uploadError: undefined,
  load: async (filter = {}, cursor) => {
    set({ loading: true, error: undefined })
    try {
      const response = await listAssets({ ...filter, ...(cursor ? { cursor } : {}) })
      set((state) => ({ assets: cursor ? [...state.assets, ...response.data] : response.data, loading: false, hasMore: response.meta.hasMore, nextCursor: response.meta.nextCursor }))
    } catch (error) {
      set({ loading: false, error: getLocalizedErrorMessage(error, i18n.t, 'assets.requestFailed') })
    }
  },
  upload: async (file, projectId, signal) => {
    set({ uploading: true, uploadError: undefined })
    try {
      const response = await uploadAsset(file, projectId, signal)
      set((state) => ({ assets: [response.data, ...state.assets.filter((asset) => asset.id !== response.data.id)], uploading: false }))
      return response.data
    } catch (error) {
      set({ uploading: false, uploadError: getLocalizedErrorMessage(error, i18n.t, 'assets.uploadFailed') })
      throw error
    }
  },
}))
