import { ulid } from 'ulid'

import { runApi } from '../api/run-api'
import { useRunStore } from '../runtime/run-store'

export interface ExecuteOperationInput {
  operationId: string
  projectId: string
  sourceArtifactId: string
  config?: Record<string, unknown>
}

/**
 * 在 Inspector 执行一个 Registry 操作：
 * 用新 ULID 作 idempotencyKey 创建 Run，并乐观地写一条 run.created 到 RunStore，
 * 使 UI 立即进入 queued 状态（SSE 到达时按 runId 去重覆盖）。
 */
export async function executeOperation(input: ExecuteOperationInput): Promise<string> {
  const result = await runApi.create(input.operationId, {
    projectId: input.projectId,
    sourceArtifactId: input.sourceArtifactId,
    inputVersionIds: [],
    config: input.config ?? {},
    idempotencyKey: ulid(),
  })
  useRunStore.getState().applyRunEvent('run.created', {
    runId: result.runId,
    operationId: input.operationId,
    taskId: result.taskId,
    sourceArtifactId: input.sourceArtifactId,
    projectId: input.projectId,
    occurredAt: new Date().toISOString(),
  })
  return result.runId
}
