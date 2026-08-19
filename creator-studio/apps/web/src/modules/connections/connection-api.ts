import {
  connectionActionResponseSchema,
  connectionAuthStartResponseSchema,
  connectionListResponseSchema,
  connectionResponseSchema,
  deleteConnectionResponseSchema,
  directoryPickerResponseSchema,
  resourceConnectionCheckResponseSchema,
  type CreateConnection,
  type UpdateConnection,
} from '@creator-studio/contracts'

import { apiRequest } from '../../shared/api'

export const connectionApi = {
  list: () => apiRequest('/connections', connectionListResponseSchema),
  pickDirectory: () => apiRequest('/connections/pick-directory', directoryPickerResponseSchema, { method: 'POST', timeoutMs: 2 * 60_000 }),
  create: (input: CreateConnection) => apiRequest('/connections', connectionResponseSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
  update: (id: string, input: UpdateConnection) => apiRequest(`/connections/${encodeURIComponent(id)}`, connectionResponseSchema, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
  remove: (id: string) => apiRequest(`/connections/${encodeURIComponent(id)}`, deleteConnectionResponseSchema, { method: 'DELETE' }),
  test: (id: string) => apiRequest(`/connections/${encodeURIComponent(id)}/test`, resourceConnectionCheckResponseSchema, { method: 'POST' }),
  install: (id: string) => apiRequest(`/connections/${encodeURIComponent(id)}/install`, connectionActionResponseSchema, { method: 'POST' }),
  authenticate: (id: string) => apiRequest(`/connections/${encodeURIComponent(id)}/auth/start`, connectionAuthStartResponseSchema, { method: 'POST' }),
  index: (id: string) => apiRequest(`/connections/${encodeURIComponent(id)}/index`, connectionActionResponseSchema, { method: 'POST' }),
}
