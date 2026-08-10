import { connectionCheckResponseSchema, settingsResponseSchema } from '@creator-studio/contracts'
import { apiRequest } from '../../shared/api'

export async function loadSettings() { return apiRequest('/settings', settingsResponseSchema) }
export async function saveSetting(path: string, value: unknown) { return apiRequest(path, settingsResponseSchema, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }) }
export async function testSetting(path: string) { return apiRequest(path, connectionCheckResponseSchema, { method: 'POST' }) }
