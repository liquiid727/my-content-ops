import { runSchema, serializeIsoDateTime, type OperationDefinition, type Run } from '@creator-studio/contracts'
import { createHash } from 'node:crypto'
import { ulid } from 'ulid'

import type { ArtifactRecord, RunRecord, TaskRecord } from '../db/schema.js'
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
import { operationTaskInputSchema, rendererByKind, type OperationTaskInput } from './operation-task-handler.js'

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

export interface RunServiceIdentity {
  workspaceId: string
  creatorProfileId: string
}

export interface CreateRunInput {
  projectId: string
  sourceArtifactId?: string | null
  /** 画布多选的全部源 artifact（多源生成）；单源时可只传 sourceArtifactId。 */
  sourceArtifactIds?: string[]
  inputVersionIds?: string[]
  knowledgeSourceIds?: string[]
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
    sourceArtifactIds: JSON.parse(run.sourceArtifactIdsJson ?? '[]') as string[],
    inputVersionIds: JSON.parse(run.inputVersionIdsJson) as string[],
    knowledgeSourceIds: JSON.parse(run.knowledgeSourceIdsJson) as string[],
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

    // 多源解析：sourceArtifactIds（画布多选）∪ sourceArtifactId（主源，向后兼容单源调用）。
    const orderedIds: string[] = []
    for (const id of [input.sourceArtifactId ?? null, ...(input.sourceArtifactIds ?? [])]) {
      if (id && !orderedIds.includes(id)) orderedIds.push(id)
    }
    const sourceArtifacts: Array<import('../db/schema.js').ArtifactRecord> = []
    for (const id of orderedIds) {
      const artifact = await this.artifacts.getByWorkspaceAndId(identity.workspaceId, id)
      if (!artifact || artifact.deletedAt !== null) throw new HttpError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: '内容不存在。' })
      if (artifact.projectId !== input.projectId) throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '内容不属于该 Project。' })
      sourceArtifacts.push(artifact)
    }
    const primaryArtifact = sourceArtifacts.find((artifact) => artifact.id === input.sourceArtifactId) ?? sourceArtifacts[0]

    if (primaryArtifact) {
      const available = sourceArtifacts.length > 1
        ? this.registry.getAvailableOperationsForSet(
          sourceArtifacts.map((artifact) => ({ kind: artifact.kind, role: artifact.role })),
          await this.connectedInputSlotsForSet(identity, sourceArtifacts),
        )
        : this.registry.getAvailableOperations({
          artifact: { kind: primaryArtifact.kind, role: primaryArtifact.role },
          connectedInputs: await this.connectedInputSlots(identity, primaryArtifact.id),
        })
      if (!available.some((op) => op.id === operationId)) {
        throw new HttpError({ status: 422, code: 'OPERATION_NOT_AVAILABLE', message: `Operation ${operationId} 对当前内容不可执行。` })
      }
    }

    const now = this.now()
    const runId = ulid(now)
    const taskId = ulid(now + 1)
    const sourceArtifactId = primaryArtifact?.id ?? null

    // create 类操作在 Run 创建时即落地占位输出（loading 节点 + 全部源连线），生成完成后原地回填内容。
    const placeholder = this.planPlaceholder(definition, sourceArtifacts, now + 3)
    const taskInput: OperationTaskInput = operationTaskInputSchema.parse({
      workspaceId: identity.workspaceId,
      projectId: input.projectId,
      runId,
      operationId,
      createdBy: identity.creatorProfileId,
      sourceArtifactId,
      sourceArtifactIds: sourceArtifacts.map((artifact) => artifact.id),
      inputVersionIds: input.inputVersionIds ?? [],
      knowledgeSourceIds: input.knowledgeSourceIds ?? [],
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
          sourceArtifactId,
          sourceArtifactIdsJson: JSON.stringify(sourceArtifacts.map((artifact) => artifact.id)),
          inputVersionIdsJson: JSON.stringify(input.inputVersionIds ?? []),
          knowledgeSourceIdsJson: JSON.stringify(input.knowledgeSourceIds ?? []),
          outputArtifactIdsJson: placeholder ? JSON.stringify([placeholder.artifactId]) : null,
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
        if (placeholder) await this.materializePlaceholder(identity, input.projectId, placeholder, created.run.id, sourceArtifacts.map((artifact) => artifact.id))
        this.events.emit(identity.workspaceId, input.projectId, 'run.created', {
          runId: created.run.id,
          taskId: created.task.id,
          operationId,
          sourceArtifactId,
          sourceArtifactIds: sourceArtifacts.map((artifact) => artifact.id),
          ...(placeholder ? { outputArtifactIds: [placeholder.artifactId] } : {}),
        })
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

  /**
   * 为 create 类操作规划占位输出：目标 artifact id、画布节点 id、每个源一条边。
   * 返回 null 表示该操作不产出新节点（new_version / side_effect）。
   */
  private planPlaceholder(
    definition: OperationDefinition,
    sourceArtifacts: Array<import('../db/schema.js').ArtifactRecord>,
    idBase: number,
  ): { artifactId: string; kind: ArtifactRecord['kind']; role: string; nodeId: string; edgeIds: string[] } | null {
    const behavior = definition.output?.behavior
    if (behavior !== 'new_artifact' && behavior !== 'new_collection') return null
    const kind = (behavior === 'new_collection' ? 'collection' : definition.output?.kind ?? sourceArtifacts[0]?.kind ?? 'text') as ArtifactRecord['kind']
    const role = definition.output?.role ?? 'draft'
    return {
      artifactId: ulid(idBase),
      kind,
      role,
      nodeId: ulid(idBase + 1),
      edgeIds: sourceArtifacts.map((_, index) => ulid(idBase + 2 + index)),
    }
  }

  /** 落地占位：artifact + 画布节点（源节点质心右侧 340px）+ 每个源 artifact 一条边，并按序发事件。 */
  private async materializePlaceholder(
    identity: RunServiceIdentity,
    projectId: string,
    placeholder: { artifactId: string; kind: ArtifactRecord['kind']; role: string; nodeId: string; edgeIds: string[] },
    runId: string,
    sourceArtifactIds: string[],
  ): Promise<void> {
    const now = this.now()
    const renderer = rendererByKind[placeholder.kind] ?? 'TextNode'
    await this.artifacts.create({
      id: placeholder.artifactId,
      workspaceId: identity.workspaceId,
      projectId,
      kind: placeholder.kind,
      role: placeholder.role,
      currentVersionId: null,
      createdBy: identity.creatorProfileId,
      createdAt: now,
      updatedAt: now,
    })
    this.events.emit(identity.workspaceId, projectId, 'artifact.created', { runId, artifactId: placeholder.artifactId, kind: placeholder.kind, role: placeholder.role })

    // 落点 = 全部源节点质心右侧；无源节点（如纯 config 驱动）时退回 (0, 0)。
    let anchorX = 0
    let anchorY = 0
    let anchorCount = 0
    for (const artifactId of sourceArtifactIds) {
      const nodes = await this.canvas.getNodesByArtifact(artifactId)
      const node = nodes[0]
      if (!node) continue
      anchorX += node.x
      anchorY += node.y
      anchorCount += 1
    }
    const x = anchorCount ? Math.round(anchorX / anchorCount) + 340 : 0
    const y = anchorCount ? Math.round(anchorY / anchorCount) : 0
    await this.canvas.createNode({
      id: placeholder.nodeId,
      projectId,
      artifactId: placeholder.artifactId,
      x,
      y,
      width: null,
      height: null,
      collapsed: false,
      zIndex: 0,
      renderer,
      createdAt: now,
      updatedAt: now,
    })
    this.events.emit(identity.workspaceId, projectId, 'node.created', { runId, artifactId: placeholder.artifactId, nodeId: placeholder.nodeId })

    for (const [index, artifactId] of sourceArtifactIds.entries()) {
      const edge = await this.canvas.createEdge({
        id: placeholder.edgeIds[index] ?? ulid(now + index),
        projectId,
        sourceArtifactId: artifactId,
        targetArtifactId: placeholder.artifactId,
        inputSlot: placeholder.role,
        createdAt: now,
      })
      this.events.emit(identity.workspaceId, projectId, 'edge.created', { runId, sourceArtifactId: artifactId, targetArtifactId: placeholder.artifactId, edgeId: edge.id })
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
    this.events.emit(identity.workspaceId, run.projectId, 'run.cancelled', { runId: run.id, taskId: run.taskId, operationId: run.operationId, sourceArtifactId: run.sourceArtifactId })
    return mapRun(run, cancelled)
  }

  async retry(identity: RunServiceIdentity, id: string, idempotencyKey: string): Promise<RunWithTask> {
    const original = await this.runs.getById(id)
    if (!original || original.workspaceId !== identity.workspaceId) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Run 不存在。' })
    // retry 新建 Run，不覆盖旧 Run。
    return this.create(identity, original.operationId, {
      projectId: original.projectId,
      sourceArtifactId: original.sourceArtifactId ?? null,
      sourceArtifactIds: JSON.parse(original.sourceArtifactIdsJson ?? '[]') as string[],
      inputVersionIds: JSON.parse(original.inputVersionIdsJson) as string[],
      knowledgeSourceIds: JSON.parse(original.knowledgeSourceIdsJson) as string[],
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

  /** 画布多选集合的可用操作：任一选中 artifact 满足 kinds/roles 即可用。 */
  async getAvailableOperationsForSet(identity: RunServiceIdentity, projectId: string, artifactIds: string[]): Promise<OperationDefinition[]> {
    const project = await this.projects.getByWorkspaceAndId(identity.workspaceId, projectId)
    if (!project) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Project 不存在。' })
    const artifacts: Array<{ id: string; kind: string; role: string }> = []
    for (const artifactId of artifactIds) {
      const artifact = await this.artifacts.getByWorkspaceAndId(identity.workspaceId, artifactId)
      if (!artifact || artifact.deletedAt !== null) throw new HttpError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: '内容不存在。' })
      if (artifact.projectId !== projectId) throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '内容不属于该 Project。' })
      artifacts.push({ id: artifact.id, kind: artifact.kind, role: artifact.role })
    }
    const slots: Array<{ inputSlot: string }> = []
    for (const artifact of artifacts) slots.push(...await this.connectedInputSlots(identity, artifact.id))
    return this.registry.getAvailableOperationsForSet(artifacts, slots)
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

  /** 集合内所有 artifact 的已连输入 slot 并集（多选可用性过滤用）。 */
  private async connectedInputSlotsForSet(identity: RunServiceIdentity, artifacts: ArtifactRecord[]): Promise<Array<{ inputSlot: string }>> {
    const slots: Array<{ inputSlot: string }> = []
    for (const artifact of artifacts) slots.push(...await this.connectedInputSlots(identity, artifact.id))
    return slots
  }
}
