import {
  createRunResponseSchema,
  runListResponseSchema,
  runResponseSchema,
  type CreateRunResult,
  type Run,
} from '@creator-studio/contracts'
import { apiRequest } from '../../shared/api/api-client'

export interface CreateRunInput {
  projectId: string
  sourceArtifactId?: string
  inputVersionIds?: string[]
  config?: Record<string, unknown>
  idempotencyKey: string
}

export const runApi = {
  /** 该 project 的 Run 列表（最近在前），用于 SSE 连接前的水合。 */
  async list(projectId: string): Promise<Run[]> {
    return (await apiRequest(`/runs?projectId=${encodeURIComponent(projectId)}`, runListResponseSchema)).data
  },
  async get(runId: string): Promise<Run> {
    return (await apiRequest(`/runs/${encodeURIComponent(runId)}`, runResponseSchema)).data
  },
  /** 创建 Run（async，202）。idempotencyKey 必须为 ULID。 */
  async create(operationId: string, input: CreateRunInput): Promise<CreateRunResult> {
    const body: Record<string, unknown> = {
      projectId: input.projectId,
      idempotencyKey: input.idempotencyKey,
      ...(input.sourceArtifactId ? { sourceArtifactId: input.sourceArtifactId } : {}),
      ...(input.inputVersionIds && input.inputVersionIds.length > 0 ? { inputVersionIds: input.inputVersionIds } : {}),
      ...(input.config && Object.keys(input.config).length > 0 ? { config: input.config } : {}),
    }
    return (await apiRequest(`/operations/${encodeURIComponent(operationId)}/runs`, createRunResponseSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).data
  },
  async cancel(runId: string): Promise<Run> {
    return (await apiRequest(`/runs/${encodeURIComponent(runId)}/cancel`, runResponseSchema, { method: 'POST' })).data
  },
  async retry(runId: string, idempotencyKey: string): Promise<CreateRunResult> {
    return (await apiRequest(`/runs/${encodeURIComponent(runId)}/retry`, createRunResponseSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey }),
    })).data
  },
}
