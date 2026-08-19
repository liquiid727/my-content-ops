import {
  changeSetResponseSchema,
  executionPlanResponseSchema,
  recipeCapabilityListResponseSchema,
  workflowSnapshotResponseSchema,
  type GraphCommand,
  type ProposeChangeSet,
} from '@creator-studio/contracts'

import { apiRequest } from '../shared/api'

const json = { 'Content-Type': 'application/json' }

export const workflowApi = {
  snapshot: async (projectId: string) => (await apiRequest(`/projects/${encodeURIComponent(projectId)}/workflow`, workflowSnapshotResponseSchema)).data,
  capabilities: async () => (await apiRequest('/workflow-capabilities', recipeCapabilityListResponseSchema)).data.capabilities,
  commands: async (projectId: string, expectedRevision: number, commands: GraphCommand[]) => (await apiRequest(`/projects/${encodeURIComponent(projectId)}/graph-commands`, workflowSnapshotResponseSchema, { method: 'POST', headers: json, body: JSON.stringify({ expectedRevision, commands }) })).data,
  createPlan: async (projectId: string, expectedRevision: number, recipeNodeIds: string[]) => (await apiRequest(`/projects/${encodeURIComponent(projectId)}/execution-plans`, executionPlanResponseSchema, { method: 'POST', headers: json, body: JSON.stringify({ expectedRevision, recipeNodeIds }) })).data,
  executePlan: async (planId: string) => (await apiRequest(`/execution-plans/${encodeURIComponent(planId)}/execute`, executionPlanResponseSchema, { method: 'POST' })).data,
  propose: async (projectId: string, proposal: ProposeChangeSet) => (await apiRequest(`/projects/${encodeURIComponent(projectId)}/change-sets`, changeSetResponseSchema, { method: 'POST', headers: json, body: JSON.stringify(proposal) })).data,
  getChangeSet: async (id: string) => (await apiRequest(`/change-sets/${encodeURIComponent(id)}`, changeSetResponseSchema)).data,
  approve: async (id: string, expectedRevision: number) => (await apiRequest(`/change-sets/${encodeURIComponent(id)}/approve`, changeSetResponseSchema, { method: 'POST', headers: json, body: JSON.stringify({ expectedRevision }) })).data,
  reject: async (id: string) => (await apiRequest(`/change-sets/${encodeURIComponent(id)}/reject`, changeSetResponseSchema, { method: 'POST' })).data,
}
