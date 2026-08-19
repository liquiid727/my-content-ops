import { z } from 'zod'
import {
  artifactDetailResponseSchema,
  artifactVersionListResponseSchema,
  artifactVersionResponseSchema,
  collectionItemListResponseSchema,
  operationDefinitionListResponseSchema,
  type ArtifactDetail,
  type ArtifactVersion,
  type CollectionItem,
  type OperationDefinition,
} from '@creator-studio/contracts'
import { apiRequest } from '../../shared/api/api-client'

export interface ArtifactPatch {
  text?: string
  metadata?: Record<string, unknown>
}

export const artifactApi = {
  /** Artifact 摘要 + 当前版本。 */
  async get(artifactId: string): Promise<ArtifactDetail> {
    return (await apiRequest(`/artifacts/${encodeURIComponent(artifactId)}`, artifactDetailResponseSchema)).data
  },
  /** 版本历史（分页，最新在前）。 */
  async versions(artifactId: string, limit = 30): Promise<ArtifactVersion[]> {
    const query = limit !== 30 ? `?limit=${limit}` : ''
    return (await apiRequest(`/artifacts/${encodeURIComponent(artifactId)}/versions${query}`, artifactVersionListResponseSchema)).data
  },
  /** 单个版本详情。 */
  async getVersion(versionId: string): Promise<ArtifactVersion> {
    return (await apiRequest(`/artifact-versions/${encodeURIComponent(versionId)}`, artifactVersionResponseSchema)).data
  },
  /** 恢复历史版本为 current（不删历史链）。 */
  async restore(artifactId: string, versionId: string): Promise<ArtifactVersion> {
    return (await apiRequest(`/artifacts/${encodeURIComponent(artifactId)}/versions/restore`, artifactVersionResponseSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId }),
    })).data
  },
  /** 手动编辑当前内容 → 新 Version(source=user)。 */
  async update(artifactId: string, revision: number, patch: ArtifactPatch): Promise<ArtifactDetail> {
    return (await apiRequest(`/artifacts/${encodeURIComponent(artifactId)}`, artifactDetailResponseSchema, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision, patch }),
    })).data
  },
  /** Registry 驱动的可用操作（按 kind/role/输入满足度过滤）。 */
  async operations(artifactId: string): Promise<OperationDefinition[]> {
    return (await apiRequest(`/artifacts/${encodeURIComponent(artifactId)}/operations`, operationDefinitionListResponseSchema)).data.operations
  },
  /** 画布多选集合的可用操作（任一选中 artifact 满足 kinds/roles 即可用）。 */
  async operationsForSet(projectId: string, artifactIds: string[]): Promise<OperationDefinition[]> {
    return (await apiRequest('/operations/available', operationDefinitionListResponseSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, artifactIds }),
    })).data.operations
  },
  async collectionItems(artifactId: string): Promise<CollectionItem[]> {
    return (await apiRequest(`/artifacts/${encodeURIComponent(artifactId)}/collection-items`, collectionItemListResponseSchema)).data.items
  },
  async selectCollectionItem(artifactId: string, itemArtifactId: string): Promise<CollectionItem[]> {
    return (await apiRequest(`/artifacts/${encodeURIComponent(artifactId)}/collection-items/select`, collectionItemListResponseSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemArtifactId }),
    })).data.items
  },
  /** 显式删除 artifact（用户同时删除内容时调用）。 */
  async deleteArtifact(artifactId: string): Promise<void> {
    await apiRequest(`/artifacts/${encodeURIComponent(artifactId)}`, z.undefined(), { method: 'DELETE' })
  },
}
