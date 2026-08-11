import { z } from 'zod'
import { ulid } from 'ulid'

import type { ArtifactVersion } from '@creator-studio/contracts'
import type { ArtifactRecord, TaskRecord } from '../db/schema.js'
import { assembleContext } from '../context/assembler.js'
import { ProjectEventEmitter } from '../events/project-event-emitter.js'
import { ArtifactRepository } from '../artifacts/artifact-repository.js'
import { CanvasRepository } from '../canvas/canvas-repository.js'
import { ProjectRepository } from '../repositories/project-repository.js'
import { TaskRepository } from '../repositories/task-repository.js'
import { GenerationProviderRegistry } from '../providers/generation-provider.js'
import { OperationRegistry } from './registry.js'
import { operationCapability } from './definitions.js'
import { executors, OperationProviderUnavailableError, type ExecutorResult } from './executors.js'
import { RunRepository } from './run-repository.js'
import type { TaskHandler, TaskHandlerResult } from '../tasks/task-handler.js'

export const operationTaskInputSchema = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  runId: z.string().min(1),
  operationId: z.string().min(1),
  createdBy: z.string().min(1),
  sourceArtifactId: z.string().min(1).nullable().optional(),
  inputVersionIds: z.array(z.string()).default([]),
  config: z.record(z.string(), z.unknown()).default({}),
}).strict()
export type OperationTaskInput = z.infer<typeof operationTaskInputSchema>

interface AppliedOutputs {
  outputArtifactIds: string[]
  outputVersionIds: string[]
  nodeIds: string[]
  edgeIds: string[]
  sideEffect?: { kind: string; detail: string }
}

const rendererByKind: Record<string, string> = {
  text: 'TextNode', image: 'ImageNode', audio: 'AudioNode', video: 'VideoNode', collection: 'CollectionNode', action: 'ActionNode',
}

export class OperationTaskHandler implements TaskHandler {
  readonly type = 'operation'
  readonly recoverable = false

  constructor(
    private readonly registry: OperationRegistry,
    private readonly artifacts: ArtifactRepository,
    private readonly canvas: CanvasRepository,
    private readonly runs: RunRepository,
    private readonly projects: ProjectRepository,
    private readonly tasks: TaskRepository,
    private readonly providers: GenerationProviderRegistry,
    private readonly events: ProjectEventEmitter,
    private readonly now: () => number = Date.now,
  ) {}

  parse(input: unknown): OperationTaskInput {
    return operationTaskInputSchema.parse(input)
  }

  async execute(raw: unknown, signal: AbortSignal): Promise<TaskHandlerResult> {
    const input = this.parse(raw)
    const now = this.now()
    const definition = this.registry.require(input.operationId)
    const executor = executors[definition.executor]
    if (!executor) throw new Error(`OPERATION_EXECUTOR_MISSING:${definition.executor}`)

    this.emitRunEvent(input, 'run.started', { runId: input.runId, operationId: input.operationId })

    const [sourceVersion, sourceArtifact, connectedInputs] = await this.loadInputs(input)
    const projectRecord = await this.projects.getByWorkspaceAndId(input.workspaceId, input.projectId)
    const provider = this.selectProvider(input.operationId)

    const context = assembleContext({
      project: {
        title: projectRecord?.title ?? '',
        brief: projectRecord?.brief ?? '',
        contentType: projectRecord?.contentType ?? null,
        targetPlatform: projectRecord?.targetPlatform ?? null,
      },
      scope: definition.id,
      operationLabel: definition.label,
      ...(sourceVersion ? { sourceVersion } : {}),
      connectedInputs,
      config: input.config,
    })

    const result = await executor.execute(
      {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        runId: input.runId,
        operationId: input.operationId,
        createdBy: input.createdBy,
        ...(sourceVersion ? { sourceArtifact: sourceVersion } : {}),
        ...(sourceArtifact ? { sourceKind: sourceArtifact.kind, sourceRole: sourceArtifact.role } : {}),
        connectedInputs,
        config: input.config,
        contextText: context.text,
        ...(provider ? { provider } : {}),
      },
      signal,
    )

    const applied = await this.applyResult(input, definition, result, sourceArtifact, now)

    return {
      providerKey: result.generation?.providerKey ?? 'manual',
      model: result.generation?.model ?? 'none',
      requestSnapshot: result.generation?.requestSnapshot ?? {},
      responseSnapshot: result.generation?.responseSnapshot ?? { outputBehavior: result.outputBehavior },
      usage: result.generation?.usage ?? {},
      output: {
        runId: input.runId,
        operationId: input.operationId,
        outputBehavior: result.outputBehavior,
        outputArtifactIds: applied.outputArtifactIds,
        outputVersionIds: applied.outputVersionIds,
        ...(applied.sideEffect ? { sideEffect: applied.sideEffect } : {}),
      },
    }
  }

  async onCompleted(raw: unknown, result: TaskHandlerResult, task: TaskRecord, finishedAt: number): Promise<void> {
    const input = this.parse(raw)
    await this.tasks.transition({
      taskId: task.id,
      expectedStatus: 'running',
      status: 'completed',
      progress: 100,
      eventType: 'completed',
      payloadJson: JSON.stringify({ runId: input.runId, operationId: input.operationId }),
      outputJson: JSON.stringify(result.output),
      finishedAt,
      updatedAt: finishedAt,
    })
    this.emitRunEvent(input, 'run.completed', { runId: input.runId, operationId: input.operationId, output: result.output })
  }

  async onFailed(raw: unknown, task: TaskRecord, error: unknown): Promise<void> {
    const input = this.parse(raw)
    const now = this.now()
    const safeError = error instanceof Error ? error.message : String(error)
    const code = this.errorCode(error)
    try {
      await this.tasks.transition({
        taskId: task.id,
        expectedStatus: 'running',
        status: 'failed',
        progress: task.progress,
        eventType: 'failed',
        payloadJson: JSON.stringify({ runId: input.runId, operationId: input.operationId }),
        errorCode: code,
        errorMessage: safeError,
        finishedAt: now,
        updatedAt: now,
      })
    } catch {
      // TaskRunner 会随后再尝试一次 transition，静默即可。
    }
    this.emitRunEvent(input, 'run.failed', {
      runId: input.runId,
      operationId: input.operationId,
      error: { code, message: safeError },
    })
  }

  private async loadInputs(input: OperationTaskInput): Promise<[ArtifactVersion | undefined, ArtifactRecord | undefined, ArtifactVersion[]]> {
    let sourceVersion: ArtifactVersion | undefined
    let sourceArtifact: ArtifactRecord | undefined
    if (input.sourceArtifactId) {
      const artifact = await this.artifacts.getById(input.sourceArtifactId)
      if (artifact) {
        sourceArtifact = artifact
        if (artifact.currentVersionId) {
          const version = await this.artifacts.getVersionById(artifact.currentVersionId)
          if (version) sourceVersion = mapVersionRecord(version)
        }
      }
    }
    const connectedInputs: ArtifactVersion[] = []
    if (sourceArtifact) {
      const edges = await this.canvas.listEdgesByProject(sourceArtifact.projectId)
      const incoming = edges.filter((edge) => edge.targetArtifactId === input.sourceArtifactId)
      for (const edge of incoming) {
        const upArtifact = await this.artifacts.getById(edge.sourceArtifactId)
        if (upArtifact?.currentVersionId) {
          const version = await this.artifacts.getVersionById(upArtifact.currentVersionId)
          if (version) connectedInputs.push(mapVersionRecord(version))
        }
      }
    } else if (input.inputVersionIds.length > 0) {
      for (const versionId of input.inputVersionIds) {
        const version = await this.artifacts.getVersionById(versionId)
        if (version) connectedInputs.push(mapVersionRecord(version))
      }
    }
    return [sourceVersion, sourceArtifact, connectedInputs]
  }

  private selectProvider(operationId: string) {
    const capability = operationCapability[operationId]
    if (!capability) return undefined
    try {
      return this.providers.require(capability)
    } catch {
      throw new OperationProviderUnavailableError(capability)
    }
  }

  private async applyResult(
    input: OperationTaskInput,
    definition: ReturnType<OperationRegistry['require']>,
    result: ExecutorResult,
    sourceArtifact: ArtifactRecord | undefined,
    now: number,
  ): Promise<AppliedOutputs> {
    const outputs: AppliedOutputs = { outputArtifactIds: [], outputVersionIds: [], nodeIds: [], edgeIds: [] }
    const projectId = input.projectId
    const kind = (result.kind ?? definition.output?.kind ?? sourceArtifact?.kind ?? 'text') as ArtifactRecord['kind']

    switch (result.outputBehavior) {
      case 'new_artifact': {
        const role = result.role ?? definition.output?.role ?? 'draft'
        const artifact = await this.artifacts.create({
          id: ulid(now),
          workspaceId: input.workspaceId,
          projectId,
          kind,
          role,
          currentVersionId: null,
          createdBy: input.createdBy,
          createdAt: now,
          updatedAt: now,
        })
        outputs.outputArtifactIds.push(artifact.id)
        this.emitRunEvent(input, 'artifact.created', { runId: input.runId, artifactId: artifact.id, kind, role })
        if (result.contentRef) {
          const { version } = this.artifacts.createVersion(this.versionInput(artifact.id, input, result, now))
          outputs.outputVersionIds.push(version.id)
          this.emitRunEvent(input, 'artifact.version.created', { runId: input.runId, artifactId: artifact.id, versionId: version.id })
        }

        const sourceNodes = input.sourceArtifactId ? await this.canvas.getNodesByArtifact(input.sourceArtifactId) : []
        const anchor = sourceNodes[0]
        const node = await this.canvas.createNode({
          id: ulid(now + 1),
          projectId,
          artifactId: artifact.id,
          x: anchor ? anchor.x + 340 : 0,
          y: anchor ? anchor.y : 0,
          width: null,
          height: null,
          collapsed: false,
          zIndex: 0,
          renderer: rendererByKind[kind] ?? 'TextNode',
          createdAt: now,
          updatedAt: now,
        })
        outputs.nodeIds.push(node.id)
        this.emitRunEvent(input, 'node.created', { runId: input.runId, artifactId: artifact.id, nodeId: node.id })

        if (input.sourceArtifactId && sourceArtifact) {
          const edge = await this.canvas.createEdge({
            id: ulid(now + 2),
            projectId,
            sourceArtifactId: input.sourceArtifactId,
            targetArtifactId: artifact.id,
            inputSlot: role,
            createdAt: now,
          })
          outputs.edgeIds.push(edge.id)
          this.emitRunEvent(input, 'edge.created', { runId: input.runId, sourceArtifactId: input.sourceArtifactId, targetArtifactId: artifact.id, edgeId: edge.id })
        }
        break
      }
      case 'new_version': {
        if (!input.sourceArtifactId) throw new Error('OPERATION_INPUT_REQUIRED:new_version needs sourceArtifactId')
        const { version } = this.artifacts.createVersion(this.versionInput(input.sourceArtifactId, input, result, now))
        outputs.outputVersionIds.push(version.id)
        this.emitRunEvent(input, 'artifact.version.created', { runId: input.runId, artifactId: input.sourceArtifactId, versionId: version.id })
        break
      }
      case 'new_collection': {
        const role = result.role ?? definition.output?.role ?? 'cover'
        const artifact = await this.artifacts.create({
          id: ulid(now),
          workspaceId: input.workspaceId,
          projectId,
          kind: 'collection',
          role,
          currentVersionId: null,
          createdBy: input.createdBy,
          createdAt: now,
          updatedAt: now,
        })
        outputs.outputArtifactIds.push(artifact.id)
        this.emitRunEvent(input, 'artifact.created', { runId: input.runId, artifactId: artifact.id, kind: 'collection', role })

        if (result.contentRef) {
          const { version } = this.artifacts.createVersion(this.versionInput(artifact.id, input, result, now))
          outputs.outputVersionIds.push(version.id)
          this.emitRunEvent(input, 'artifact.version.created', { runId: input.runId, artifactId: artifact.id, versionId: version.id })
        }

        const sourceNodes = input.sourceArtifactId ? await this.canvas.getNodesByArtifact(input.sourceArtifactId) : []
        const anchor = sourceNodes[0]
        const node = await this.canvas.createNode({
          id: ulid(now + 1),
          projectId,
          artifactId: artifact.id,
          x: anchor ? anchor.x + 340 : 0,
          y: anchor ? anchor.y : 0,
          width: null,
          height: null,
          collapsed: false,
          zIndex: 0,
          renderer: 'CollectionNode',
          createdAt: now,
          updatedAt: now,
        })
        outputs.nodeIds.push(node.id)
        this.emitRunEvent(input, 'node.created', { runId: input.runId, artifactId: artifact.id, nodeId: node.id })

        if (input.sourceArtifactId && sourceArtifact) {
          const edge = await this.canvas.createEdge({
            id: ulid(now + 2),
            projectId,
            sourceArtifactId: input.sourceArtifactId,
            targetArtifactId: artifact.id,
            inputSlot: role,
            createdAt: now,
          })
          outputs.edgeIds.push(edge.id)
          this.emitRunEvent(input, 'edge.created', { runId: input.runId, sourceArtifactId: input.sourceArtifactId, targetArtifactId: artifact.id, edgeId: edge.id })
        }
        break
      }
      case 'side_effect': {
        if (result.sideEffect) outputs.sideEffect = result.sideEffect
        break
      }
    }

    this.runs.updateOutputs(input.runId, {
      outputArtifactIds: outputs.outputArtifactIds,
      outputVersionIds: outputs.outputVersionIds,
    }, now)
    return outputs
  }

  private emitRunEvent(input: OperationTaskInput, eventType: string, payload: Record<string, unknown>): void {
    this.events.emit(input.workspaceId, input.projectId, eventType, payload)
  }

  private versionInput(artifactId: string, input: OperationTaskInput, result: ExecutorResult, now: number): Parameters<ArtifactRepository['createVersion']>[0] {
    return {
      artifactId,
      ...(result.contentRef !== undefined && result.contentRef !== null ? { contentRef: result.contentRef } : {}),
      ...(result.metadata !== undefined ? { metadata: result.metadata } : {}),
      source: 'ai',
      operationRunId: input.runId,
      createdBy: input.createdBy,
      createdAt: now,
    }
  }

  private errorCode(error: unknown): string {
    if (error instanceof OperationProviderUnavailableError) return 'OPERATION_PROVIDER_UNAVAILABLE'
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('NOT_IMPLEMENTED')) return 'OPERATION_NOT_IMPLEMENTED'
    if (message.includes('Abort') || message.includes('aborted')) return 'OPERATION_CANCELLED'
    return 'OPERATION_FAILED'
  }
}

function mapVersionRecord(record: {
  id: string; artifactId: string; versionNumber: number; parentVersionId: string | null; contentRefType: 'asset' | 'inline' | null; contentRefId: string | null; inlineText: string | null; metadataJson: string; source: 'ai' | 'user' | 'import' | 'system'; operationRunId: string | null; createdBy: string; createdAt: number
}): ArtifactVersion {
  return {
    id: record.id,
    artifactId: record.artifactId,
    versionNumber: record.versionNumber,
    parentVersionId: record.parentVersionId,
    contentRef: record.contentRefType === 'asset' && record.contentRefId
      ? { type: 'asset', id: record.contentRefId }
      : record.contentRefType === 'inline'
        ? { type: 'inline', text: record.inlineText ?? '' }
        : null,
    metadata: record.metadataJson ? JSON.parse(record.metadataJson) as Record<string, unknown> : {},
    source: record.source,
    operationRunId: record.operationRunId,
    createdBy: record.createdBy,
    createdAt: new Date(record.createdAt).toISOString(),
  }
}
