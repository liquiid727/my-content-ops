import { z } from 'zod'
import {
  artifactDetailResponseSchema,
  artifactVersionListResponseSchema,
  artifactVersionResponseSchema,
  operationDefinitionListResponseSchema,
  type ArtifactDetail,
  type ArtifactVersion,
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
  /** 显式删除 artifact（用户同时删除内容时调用）。 */
  async deleteArtifact(artifactId: string): Promise<void> {
    await apiRequest(`/artifacts/${encodeURIComponent(artifactId)}`, z.undefined(), { method: 'DELETE' })
  },
}
