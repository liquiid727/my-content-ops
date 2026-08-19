import type { Run, RunStatus } from '@creator-studio/contracts'
import { create } from 'zustand'

export interface RunSummary {
  runId: string
  operationId: string
  taskId?: string
  sourceArtifactId?: string | null
  /** 多源生成：全部源 artifact（含主源）。 */
  sourceArtifactIds: string[] | null
  status: RunStatus
  progress: number
  error: { code: string; message: string } | null
  output?: unknown
  outputArtifactIds: string[] | null
  outputVersionIds: string[] | null
  updatedAt?: string
}

export type RunEventType =
  | 'run.created'
  | 'run.started'
  | 'run.progress'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'

const ACTIVE_STATUSES: ReadonlySet<RunStatus> = new Set(['queued', 'running', 'waiting_review'])

interface RunState {
  /** runId → 摘要（含 SSE 增量 + API 水合）。 */
  byId: Record<string, RunSummary>
  /** projectId → 未终结 run 的 id 列表。 */
  activeByProject: Record<string, string[]>
  /** artifactId → 最近一次作用于该 artifact 的 runId（Inspector 关联 Run）。 */
  runByArtifact: Record<string, string>
  /** API 水合：把 Run[] 并入缓存，重建 active 列表。 */
  hydrateRuns: (projectId: string, runs: Run[]) => void
  /** SSE 事件归并：run.created/started/progress/completed/failed/cancelled。 */
  applyRunEvent: (type: RunEventType, data: Record<string, unknown>) => void
  /** 切 project 时清理该 project 的 active 列表（byId 可保留做 Inspector 回看）。 */
  clearProject: (projectId: string) => void
}

function summaryFromRun(run: Run): RunSummary {
  return {
    runId: run.id,
    operationId: run.operationId,
    taskId: run.taskId,
    sourceArtifactId: run.sourceArtifactId,
    sourceArtifactIds: run.sourceArtifactIds ?? [],
    status: run.status,
    progress: run.progress,
    error: run.error,
    outputVersionIds: run.outputVersionIds,
    outputArtifactIds: run.outputArtifactIds,
    updatedAt: run.updatedAt,
  }
}

function upsertActive(state: RunState, projectId: string | undefined, runId: string, status: RunStatus): Partial<RunState> {
  if (!projectId) return {}
  const current = state.activeByProject[projectId] ?? []
  const present = current.includes(runId)
  if (ACTIVE_STATUSES.has(status)) {
    return present ? {} : { activeByProject: { ...state.activeByProject, [projectId]: [...current, runId] } }
  }
  if (!present) return {}
  return { activeByProject: { ...state.activeByProject, [projectId]: current.filter((id) => id !== runId) } }
}

export const useRunStore = create<RunState>((set) => ({
  byId: {},
  activeByProject: {},
  runByArtifact: {},

  hydrateRuns(projectId, runs) {
    set((state) => {
      const byId = { ...state.byId }
      const runByArtifact = { ...state.runByArtifact }
      const active: string[] = []
      for (const run of runs) {
        byId[run.id] = summaryFromRun(run)
        for (const id of [...new Set([run.sourceArtifactId ?? '', ...(run.sourceArtifactIds ?? [])])]) {
          if (id) runByArtifact[id] = run.id
        }
        if (ACTIVE_STATUSES.has(run.status)) active.push(run.id)
      }
      return { byId, runByArtifact, activeByProject: { ...state.activeByProject, [projectId]: active } }
    })
  },

  applyRunEvent(type, data) {
    const runId = String(data.runId ?? '')
    const projectId = data.projectId !== undefined ? String(data.projectId) : undefined
    if (!runId) return
    set((state) => {
      const existing = state.byId[runId]
      const base = existing ?? { runId, operationId: String(data.operationId ?? ''), status: 'queued' as RunStatus, progress: 0, error: null, sourceArtifactIds: null, outputArtifactIds: null, outputVersionIds: null }
      const sourceArtifactId = data.sourceArtifactId === undefined ? base.sourceArtifactId : data.sourceArtifactId === null ? null : String(data.sourceArtifactId)
      const sourceArtifactIds = Array.isArray(data.sourceArtifactIds)
        ? data.sourceArtifactIds.map(String)
        : base.sourceArtifactIds
      const mergedSourceIds = [...new Set([...(sourceArtifactId ? [sourceArtifactId] : []), ...(sourceArtifactIds ?? [])])]
      // runByArtifact：主源 + 多源集合都指向该 run，源节点与占位输出节点都能显示进行中状态。
      const runByArtifact = { ...state.runByArtifact }
      for (const id of mergedSourceIds) runByArtifact[id] = runId
      const runByArtifactPatch = mergedSourceIds.length ? { runByArtifact } : {}
      const topOutputArtifactIds = Array.isArray(data.outputArtifactIds) ? data.outputArtifactIds.map(String) : null
      switch (type) {
        case 'run.created':
          return {
            byId: { ...state.byId, [runId]: { ...base, sourceArtifactId, sourceArtifactIds: mergedSourceIds.length ? mergedSourceIds : null, operationId: String(data.operationId ?? base.operationId), taskId: data.taskId !== undefined ? String(data.taskId) : base.taskId, status: 'queued', progress: 0, error: null, outputArtifactIds: topOutputArtifactIds ?? base.outputArtifactIds, updatedAt: data.occurredAt !== undefined ? String(data.occurredAt) : base.updatedAt } },
            ...upsertActive(state, projectId, runId, 'queued'),
            ...runByArtifactPatch,
          }
        case 'run.started':
          return {
            byId: { ...state.byId, [runId]: { ...base, sourceArtifactId, sourceArtifactIds: mergedSourceIds.length ? mergedSourceIds : base.sourceArtifactIds, status: 'running', progress: base.progress || 5, error: null, outputArtifactIds: topOutputArtifactIds ?? base.outputArtifactIds, updatedAt: data.occurredAt !== undefined ? String(data.occurredAt) : base.updatedAt } },
            ...upsertActive(state, projectId, runId, 'running'),
            ...runByArtifactPatch,
          }
        case 'run.progress': {
          const progress = typeof data.progress === 'number' ? Math.max(0, Math.min(100, Math.round(data.progress))) : base.progress
          return {
            byId: { ...state.byId, [runId]: { ...base, sourceArtifactId, sourceArtifactIds, progress, updatedAt: data.occurredAt !== undefined ? String(data.occurredAt) : base.updatedAt } },
            ...upsertActive(state, projectId, runId, 'running'),
            ...runByArtifactPatch,
          }
        }
        case 'run.completed': {
          const nested = data.output !== undefined && typeof data.output === 'object' && data.output !== null ? data.output as { outputArtifactIds?: unknown; outputVersionIds?: unknown } : {}
          const outputArtifactIds = data.outputArtifactIds !== undefined
            ? (Array.isArray(data.outputArtifactIds) ? data.outputArtifactIds.map(String) : null)
            : (nested.outputArtifactIds !== undefined && Array.isArray(nested.outputArtifactIds) ? nested.outputArtifactIds.map(String) : base.outputArtifactIds)
          const outputVersionIds = data.outputVersionIds !== undefined
            ? (Array.isArray(data.outputVersionIds) ? data.outputVersionIds.map(String) : null)
            : (nested.outputVersionIds !== undefined && Array.isArray(nested.outputVersionIds) ? nested.outputVersionIds.map(String) : base.outputVersionIds)
          return {
            byId: { ...state.byId, [runId]: { ...base, sourceArtifactId, sourceArtifactIds, status: 'completed', progress: 100, error: null, output: data.output, outputArtifactIds, outputVersionIds, updatedAt: data.occurredAt !== undefined ? String(data.occurredAt) : base.updatedAt } },
            ...upsertActive(state, projectId, runId, 'completed'),
            ...runByArtifactPatch,
          }
        }
        case 'run.failed': {
          const error = data.error !== undefined && typeof data.error === 'object' && data.error !== null
            ? { code: String((data.error as { code?: unknown }).code ?? 'OPERATION_FAILED'), message: String((data.error as { message?: unknown }).message ?? '操作失败。') }
            : { code: 'OPERATION_FAILED', message: '操作失败。' }
          return {
            byId: { ...state.byId, [runId]: { ...base, sourceArtifactId, sourceArtifactIds, status: 'failed', progress: base.progress, error, updatedAt: data.occurredAt !== undefined ? String(data.occurredAt) : base.updatedAt } },
            ...upsertActive(state, projectId, runId, 'failed'),
            ...runByArtifactPatch,
          }
        }
        case 'run.cancelled':
          return {
            byId: { ...state.byId, [runId]: { ...base, sourceArtifactId, sourceArtifactIds, status: 'cancelled', error: base.error ?? null, updatedAt: data.occurredAt !== undefined ? String(data.occurredAt) : base.updatedAt } },
            ...upsertActive(state, projectId, runId, 'cancelled'),
            ...runByArtifactPatch,
          }
        default:
          return {}
      }
    })
  },

  clearProject(projectId) {
    set((state) => {
      const activeByProject = { ...state.activeByProject }
      delete activeByProject[projectId]
      return { activeByProject }
    })
  },
}))
