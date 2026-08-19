import { ulid } from 'ulid'

import { runApi } from '../api/run-api'
import { useRunStore } from '../runtime/run-store'

export interface ExecuteOperationInput {
  operationId: string
  projectId: string
  sourceArtifactId: string
  /** 画布多选的全部源 artifact（多源生成）；缺省时仅用 sourceArtifactId。 */
  sourceArtifactIds?: string[]
  knowledgeSourceIds?: string[]
  config?: Record<string, unknown>
}

/**
 * 在画布/Inspector 执行一个 Registry 操作：
 * 用新 ULID 作 idempotencyKey 创建 Run，并乐观地写一条 run.created 到 RunStore，
 * 使 UI 立即进入 queued 状态（SSE 到达时按 runId 去重覆盖）。
 * create 类操作服务端会同步落地占位输出（loading 节点），202 响应的 outputArtifactIds
 * 一并写入乐观事件，让占位节点在 SSE 刷新前就能显示 running。
 */
export async function executeOperation(input: ExecuteOperationInput): Promise<string> {
  const result = await runApi.create(input.operationId, {
    projectId: input.projectId,
    sourceArtifactId: input.sourceArtifactId,
    ...(input.sourceArtifactIds && input.sourceArtifactIds.length > 0 ? { sourceArtifactIds: input.sourceArtifactIds } : {}),
    inputVersionIds: [],
    knowledgeSourceIds: input.knowledgeSourceIds ?? [],
    config: input.config ?? {},
    idempotencyKey: ulid(),
  })
  useRunStore.getState().applyRunEvent('run.created', {
    runId: result.runId,
    operationId: input.operationId,
    taskId: result.taskId,
    sourceArtifactId: input.sourceArtifactId,
    sourceArtifactIds: input.sourceArtifactIds ?? [input.sourceArtifactId],
    outputArtifactIds: result.outputArtifactIds,
    projectId: input.projectId,
    occurredAt: new Date().toISOString(),
  })
  return result.runId
}
