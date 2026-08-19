import {
  projectListResponseSchema,
  projectOverviewResponseSchema,
  projectResponseSchema,
  type CreateProject,
  type ProjectPatch,
  type ProjectStatus,
} from '@creator-studio/contracts'
import { apiRequest, ApiClientError } from '../../shared/api'
import { resetSessionStoreForTests } from '../session'

export { ApiClientError }

export const projectApi = {
  async list(input: { status?: ProjectStatus; cursor?: string; limit?: number } = {}) {
    const query = new URLSearchParams()
    if (input.status) query.set('status', input.status)
    if (input.cursor) query.set('cursor', input.cursor)
    if (input.limit) query.set('limit', String(input.limit))
    return apiRequest(`/projects${query.size > 0 ? `?${query}` : ''}`, projectListResponseSchema)
  },
  async create(input: CreateProject, idempotencyKey: string, signal?: AbortSignal) {
    return apiRequest('/projects', projectResponseSchema, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input), ...(signal ? { signal } : {}) })
  },
  async update(projectId: string, revision: number, patch: ProjectPatch) {
    return apiRequest(`/projects/${encodeURIComponent(projectId)}`, projectResponseSchema, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, patch }) })
  },
  async archive(projectId: string, revision: number) {
    return apiRequest(`/projects/${encodeURIComponent(projectId)}/archive`, projectResponseSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision }) })
  },
  async overview(projectId: string) { return apiRequest(`/projects/${encodeURIComponent(projectId)}/overview`, projectOverviewResponseSchema) },
}

export function resetProjectApiSessionForTests(): void { resetSessionStoreForTests() }
