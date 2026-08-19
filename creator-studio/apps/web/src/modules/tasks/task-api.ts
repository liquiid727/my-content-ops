import { taskListResponseSchema, taskResponseSchema } from '@creator-studio/contracts'
import { apiRequest } from '../../shared/api'
import { resetSessionStoreForTests, useSessionStore } from '../session'

export async function ensureTaskSession(): Promise<void> { return useSessionStore.getState().ensureReady() }

interface TaskListOptions { active?: boolean; cursor?: string; limit?: number }

export const taskApi = {
  async list(options: TaskListOptions = {}) {
    const query = new URLSearchParams()
    if (options.active !== undefined) query.set('active', String(options.active))
    if (options.cursor) query.set('cursor', options.cursor)
    if (options.limit !== undefined) query.set('limit', String(options.limit))
    return apiRequest(`/tasks${query.size > 0 ? `?${query}` : ''}`, taskListResponseSchema)
  },
  async get(taskId: string) { return apiRequest(`/tasks/${encodeURIComponent(taskId)}`, taskResponseSchema) },
  async cancel(taskId: string) { return apiRequest(`/tasks/${encodeURIComponent(taskId)}/cancel`, taskResponseSchema, { method: 'POST' }) },
}

export function resetTaskApiSessionForTests(): void { resetSessionStoreForTests() }
