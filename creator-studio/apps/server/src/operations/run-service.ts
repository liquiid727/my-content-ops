import { runSchema, serializeIsoDateTime, type OperationDefinition, type Run } from '@creator-studio/contracts'
import { createHash } from 'node:crypto'
import { ulid } from 'ulid'

import type { RunRecord, TaskRecord } from '../db/schema.js'
import { HttpError } from '../http/errors.js'
import { ArtifactRepository } from '../artifacts/artifact-repository.js'
import { CanvasRepository } from '../canvas/canvas-repository.js'
import { ProjectRepository } from '../repositories/project-repository.js'
import { TaskRepository } from '../repositories/task-repository.js'
import { ProjectEventEmitter } from '../events/project-event-emitter.js'
import { isTerminalTaskStatus } from '../tasks/task-state-machine.js'
import type { TaskRunner } from '../tasks/task-runner.js'
import { OperationRegistry } from './registry.js'
import { RunIdempotencyKeyReusedError, RunRepository } from './run-repository.js'
import { operationTaskInputSchema, type OperationTaskInput } from './operation-task-handler.js'

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

export interface RunServiceIdentity {
  workspaceId: string
  creatorProfileId: string
}

export interface CreateRunInput {
  projectId: string
  sourceArtifactId?: string | null
  inputVersionIds?: string[]
  config?: Record<string, unknown>
  idempotencyKey: string
}

export interface RunWithTask {
  run: Run
  task: TaskRecord
}

function mapRun(run: RunRecord, task: TaskRecord): Run {
  return runSchema.parse({
    id: run.id,
    projectId: run.projectId,
    taskId: run.taskId,
    operationId: run.operationId,
    sourceArtifactId: run.sourceArtifactId ?? null,
    inputVersionIds: JSON.parse(run.inputVersionIdsJson) as string[],
    outputVersionIds: run.outputVersionIdsJson ? JSON.parse(run.outputVersionIdsJson) as string[] : null,
    outputArtifactIds: run.outputArtifactIdsJson ? JSON.parse(run.outputArtifactIdsJson) as string[] : null,
    status: task.status,
    progress: task.progress,
    config: JSON.parse(run.configJson) as Record<string, unknown>,
    error: task.errorCode && task.errorMessage ? { code: task.errorCode, message: task.errorMessage } : null,
    createdAt: serializeIsoDateTime(new Date(run.createdAt)),
    updatedAt: serializeIsoDateTime(new Date(run.updatedAt)),
  })
}

export class RunService {
  constructor(
    private readonly runs: RunRepository,
    private readonly registry: OperationRegistry,
    private readonly projects: ProjectRepository,
    private readonly artifacts: ArtifactRepository,
    private readonly canvas: CanvasRepository,
    private readonly tasks: TaskRepository,
    private readonly runner: TaskRunner,
    private readonly events: ProjectEventEmitter,
    private readonly now: () => number = Date.now,
  ) {}

  async create(identity: RunServiceIdentity, operationId: string, input: CreateRunInput): Promise<RunWithTask> {
    const definition = this.registry.getById(operationId)
    if (!definition) throw new HttpError({ status: 422, code: 'OPERATION_NOT_AVAILABLE', message: `Operation ${operationId} 不可用。` })

    const project = await this.projects.getByWorkspaceAndId(identity.workspaceId, input.projectId)
    if (!project) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Project 不存在。' })

    let sourceArtifact: import('../db/schema.js').ArtifactRecord | undefined
    if (input.sourceArtifactId) {
      const artifact = await this.artifacts.getByWorkspaceAndId(identity.workspaceId, input.sourceArtifactId)
      if (!artifact || artifact.deletedAt !== null) throw new HttpError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: '内容不存在。' })
      if (artifact.projectId !== input.projectId) throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '内容不属于该 Project。' })
      sourceArtifact = artifact
      const available = this.registry.getAvailableOperations({
        artifact: { kind: sourceArtifact.kind, role: sourceArtifact.role },
        connectedInputs: await this.connectedInputSlots(identity, sourceArtifact.id),
      })
      if (!available.some((op) => op.id === operationId)) {
        throw new HttpError({ status: 422, code: 'OPERATION_NOT_AVAILABLE', message: `Operation ${operationId} 对当前内容不可执行。` })
      }
    }

    const now = this.now()
    const runId = ulid(now)
    const taskId = ulid(now + 1)
    const taskInput: OperationTaskInput = operationTaskInputSchema.parse({
      workspaceId: identity.workspaceId,
      projectId: input.projectId,
      runId,
      operationId,
      createdBy: identity.creatorProfileId,
      sourceArtifactId: input.sourceArtifactId ?? null,
      inputVersionIds: input.inputVersionIds ?? [],
      config: input.config ?? {},
    })
    const requestHash = createHash('sha256').update(JSON.stringify({ operationId, ...input, idempotencyKey: undefined })).digest('hex')

    try {
      const created = this.runs.createIdempotent({
        idempotency: { id: ulid(now + 2), key: input.idempotencyKey, requestHash, expiresAt: now + IDEMPOTENCY_TTL_MS, createdAt: now },
        run: {
          id: runId,
          workspaceId: identity.workspaceId,
          projectId: input.projectId,
          taskId,
          operationId,
          sourceArtifactId: input.sourceArtifactId ?? null,
          inputVersionIdsJson: JSON.stringify(input.inputVersionIds ?? []),
          configJson: JSON.stringify(input.config ?? {}),
          createdAt: now,
          updatedAt: now,
        },
        task: {
          id: taskId,
          workspaceId: identity.workspaceId,
          projectId: input.projectId,
          type: `operation.${operationId}`,
          inputJson: JSON.stringify(taskInput),
          idempotencyKey: input.idempotencyKey,
          createdBy: identity.creatorProfileId,
          createdAt: now,
          status: 'queued',
          progress: 0,
          updatedAt: now,
        },
      })

      if (!created.replayed) {
        this.events.emit(identity.workspaceId, input.projectId, 'run.created', { runId: created.run.id, taskId: created.task.id, operationId })
        this.runner.schedule()
      }
      return { run: mapRun(created.run, created.task), task: created.task }
    } catch (error) {
      if (error instanceof RunIdempotencyKeyReusedError) {
        throw new HttpError({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: '此 Idempotency-Key 已用于不同请求，请生成新的 key。' })
      }
      throw error
    }
  }

  async get(identity: RunServiceIdentity, id: string): Promise<Run> {
    const run = await this.runs.getById(id)
    if (!run) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Run 不存在。' })
    if (run.workspaceId !== identity.workspaceId) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Run 不存在。' })
    const task = await this.tasks.getByWorkspaceAndId(identity.workspaceId, run.taskId)
    if (!task) throw new HttpError({ status: 500, code: 'INTERNAL_ERROR', message: 'Run 缺少关联 Task。' })
    return mapRun(run, task)
  }

  async cancel(identity: RunServiceIdentity, id: string): Promise<Run> {
    const run = await this.runs.getById(id)
    if (!run || run.workspaceId !== identity.workspaceId) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Run 不存在。' })
    const task = await this.tasks.getByWorkspaceAndId(identity.workspaceId, run.taskId)
    if (!task) throw new HttpError({ status: 500, code: 'INTERNAL_ERROR', message: 'Run 缺少关联 Task。' })
    if (isTerminalTaskStatus(task.status as TaskRecord['status'])) {
      throw new HttpError({ status: 409, code: 'RUN_ALREADY_CANCELLED', message: 'Run 已结束，无法取消。' })
    }
    const now = this.now()
    const cancelled = await this.tasks.transition({
      taskId: task.id,
      expectedStatus: task.status,
      status: 'cancelled',
      progress: task.progress,
      eventType: 'cancelled',
      payloadJson: JSON.stringify({ runId: run.id }),
      finishedAt: now,
      updatedAt: now,
    })
    this.runner.cancelRunning(task.id)
    this.events.emit(identity.workspaceId, run.projectId, 'run.cancelled', { runId: run.id, taskId: run.taskId, operationId: run.operationId })
    return mapRun(run, cancelled)
  }

  async retry(identity: RunServiceIdentity, id: string, idempotencyKey: string): Promise<RunWithTask> {
    const original = await this.runs.getById(id)
    if (!original || original.workspaceId !== identity.workspaceId) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Run 不存在。' })
    // retry 新建 Run，不覆盖旧 Run。
    return this.create(identity, original.operationId, {
      projectId: original.projectId,
      sourceArtifactId: original.sourceArtifactId ?? null,
      inputVersionIds: JSON.parse(original.inputVersionIdsJson) as string[],
      config: JSON.parse(original.configJson) as Record<string, unknown>,
      idempotencyKey,
    })
  }

  async getAvailableOperations(identity: RunServiceIdentity, artifactId: string): Promise<OperationDefinition[]> {
    const artifact = await this.artifacts.getByWorkspaceAndId(identity.workspaceId, artifactId)
    if (!artifact || artifact.deletedAt !== null) throw new HttpError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: '内容不存在。' })
    const slots = await this.connectedInputSlots(identity, artifactId)
    return this.registry.getAvailableOperations({ artifact: { kind: artifact.kind, role: artifact.role }, connectedInputs: slots })
  }

  async list(identity: RunServiceIdentity, projectId: string, limit = 50): Promise<Run[]> {
    const project = await this.projects.getByWorkspaceAndId(identity.workspaceId, projectId)
    if (!project) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Project 不存在。' })
    const runs = await this.runs.listByProject(projectId, limit)
    const result: Run[] = []
    for (const run of runs) {
      const task = await this.tasks.getByWorkspaceAndId(identity.workspaceId, run.taskId)
      if (task) result.push(mapRun(run, task))
    }
    return result
  }

  private async connectedInputSlots(identity: RunServiceIdentity, artifactId: string): Promise<Array<{ inputSlot: string }>> {
    const artifact = await this.artifacts.getById(artifactId)
    if (!artifact || artifact.workspaceId !== identity.workspaceId) return []
    const edges = await this.canvas.listEdgesByProject(artifact.projectId)
    return edges.filter((edge) => edge.targetArtifactId === artifactId).map((edge) => ({ inputSlot: edge.inputSlot }))
  }
}
