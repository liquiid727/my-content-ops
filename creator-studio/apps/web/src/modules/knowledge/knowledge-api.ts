import {
  knowledgeSearchResponseSchema,
  knowledgeSourceEntityResponseSchema,
  knowledgeSourceResponseSchema,
  projectSourceListResponseSchema,
  unbindProjectSourceResponseSchema,
} from '@creator-studio/contracts'

import { apiRequest } from '../../shared/api'

export const knowledgeApi = {
  search(input: { q?: string; connectionId?: string; projectId?: string; kind?: string; limit?: number } = {}) {
    const query = new URLSearchParams()
    if (input.q) query.set('q', input.q)
    if (input.connectionId) query.set('connectionId', input.connectionId)
    if (input.projectId) query.set('projectId', input.projectId)
    if (input.kind) query.set('kind', input.kind)
    if (input.limit) query.set('limit', String(input.limit))
    return apiRequest(`/knowledge/search${query.size ? `?${query}` : ''}`, knowledgeSearchResponseSchema)
  },
  read: (id: string) => apiRequest(`/knowledge/sources/${encodeURIComponent(id)}`, knowledgeSourceResponseSchema),
  listProject: (projectId: string) => apiRequest(`/projects/${encodeURIComponent(projectId)}/sources`, projectSourceListResponseSchema),
  bind: (projectId: string, sourceId: string) => apiRequest(`/projects/${encodeURIComponent(projectId)}/sources`, knowledgeSourceEntityResponseSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId }) }),
  unbind: (projectId: string, sourceId: string) => apiRequest(`/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`, unbindProjectSourceResponseSchema, { method: 'DELETE' }),
}
