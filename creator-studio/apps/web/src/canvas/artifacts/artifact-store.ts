import type { ArtifactDetail, ArtifactVersion } from '@creator-studio/contracts'
import { create } from 'zustand'

import { artifactApi } from '../api/artifact-api'

interface ArtifactState {
  /** Artifact 摘要 + 当前版本缓存（id → detail）。 */
  byId: Record<string, ArtifactDetail>
  /** 版本历史缓存（artifactId → versions，最新在前）。 */
  versions: Record<string, ArtifactVersion[]>
  /** 每个 artifact 的取数状态。 */
  loading: Record<string, boolean>
  /** 取摘要（缓存命中直接返回；否则拉取并缓存）。 */
  getArtifact: (id: string) => Promise<ArtifactDetail>
  /** 强制重拉并替换缓存（失效后刷新用）。 */
  refreshArtifact: (id: string) => Promise<ArtifactDetail>
  /** 失效摘要 + 版本缓存。 */
  invalidate: (id: string) => void
  invalidateMany: (ids: string[]) => void
  /** 取版本历史（缓存命中直接返回）。 */
  getVersions: (artifactId: string) => Promise<ArtifactVersion[]>
  /** 直接写入一份 detail（用于本地新建/更新后同步）。 */
  setDetail: (detail: ArtifactDetail) => void
  /** 切换 project 时清空缓存。 */
  clearProject: () => void
}

export const useArtifactStore = create<ArtifactState>((set, get) => ({
  byId: {},
  versions: {},
  loading: {},

  async getArtifact(id) {
    const cached = get().byId[id]
    if (cached) return cached
    return get().refreshArtifact(id)
  },

  async refreshArtifact(id) {
    set((state) => ({ loading: { ...state.loading, [id]: true } }))
    try {
      const detail = await artifactApi.get(id)
      set((state) => ({ byId: { ...state.byId, [id]: detail }, loading: { ...state.loading, [id]: false } }))
      return detail
    } catch (error) {
      set((state) => ({ loading: { ...state.loading, [id]: false } }))
      throw error
    }
  },

  invalidate(id) {
    set((state) => {
      const byId = { ...state.byId }
      delete byId[id]
      const versions = { ...state.versions }
      delete versions[id]
      return { byId, versions }
    })
  },

  invalidateMany(ids) {
    if (ids.length === 0) return
    set((state) => {
      const byId = { ...state.byId }
      const versions = { ...state.versions }
      for (const id of ids) {
        delete byId[id]
        delete versions[id]
      }
      return { byId, versions }
    })
  },

  async getVersions(artifactId) {
    const cached = get().versions[artifactId]
    if (cached) return cached
    const versions = await artifactApi.versions(artifactId)
    set((state) => ({ versions: { ...state.versions, [artifactId]: versions } }))
    return versions
  },

  setDetail(detail) {
    set((state) => ({ byId: { ...state.byId, [detail.id]: detail } }))
  },

  clearProject() {
    set({ byId: {}, versions: {}, loading: {} })
  },
}))
