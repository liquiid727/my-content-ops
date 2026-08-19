import { createHash } from 'node:crypto'
import { z } from 'zod'
import { ulid } from 'ulid'

import type { ArtifactVersion } from '@creator-studio/contracts'
import type { ArtifactRecord, AssetRecord, TaskRecord } from '../db/schema.js'
import { assembleContext, ContextService } from '../context/index.js'
import { ProjectEventEmitter } from '../events/project-event-emitter.js'
import { ArtifactRepository } from '../artifacts/artifact-repository.js'
import { CanvasRepository } from '../canvas/canvas-repository.js'
import { ProjectRepository } from '../repositories/project-repository.js'
import { TaskRepository } from '../repositories/task-repository.js'
import { AssetFileStore } from '../assets/file-store.js'
import { AssetRepository } from '../repositories/asset-repository.js'
import { ProviderService } from '../providers/index.js'
import type { MediaResult } from '../providers/generation-provider.js'
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
  /** 画布多选的全部源 artifact（多源生成）；sourceArtifactId 为主源。 */
  sourceArtifactIds: z.array(z.string().min(1)).default([]),
  inputVersionIds: z.array(z.string()).default([]),
  knowledgeSourceIds: z.array(z.string()).default([]),
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

export const rendererByKind: Record<string, string> = {
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
    private readonly assets: AssetRepository,
    private readonly files: AssetFileStore,
    private readonly providers: ProviderService,
    private readonly events: ProjectEventEmitter,
    private readonly contexts: ContextService,
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

    this.emitRunEvent(input, 'run.started', { runId: input.runId, operationId: input.operationId, sourceArtifactId: input.sourceArtifactId })

    const [sourceVersion, sourceArtifact, connectedInputs, sourceArtifacts] = await this.loadInputs(input)
    const projectRecord = await this.projects.getByWorkspaceAndId(input.workspaceId, input.projectId)
    const provider = await this.selectProvider(input.workspaceId, input.operationId)
    const personalStyleText = await this.contexts.resolveOperationStyle(input.workspaceId, projectRecord ?? undefined, input.createdBy, input.operationId)
    const externalKnowledge = await this.contexts.resolveOperationKnowledge(input.workspaceId, input.projectId, input.knowledgeSourceIds)

    const context = assembleContext({
      project: {
        title: projectRecord?.title ?? '',
        brief: projectRecord?.brief ?? '',
        contentType: projectRecord?.contentType ?? null,
        targetPlatform: projectRecord?.targetPlatform ?? null,
      },
      scope: definition.id,
      operationLabel: definition.label,
      personalStyleText,
      ...(sourceVersion ? { sourceVersion } : {}),
      connectedInputs,
      externalKnowledgeText: externalKnowledge.text,
      config: input.config,
    })

    // 多选集合中的图片素材 → 参考图（image-to-image）；主源图片走 hydrateImageConfig 的 sourceVersion 路径。
    const userReferenceIds = Array.isArray(input.config.referenceAssetIds) ? input.config.referenceAssetIds.filter((id): id is string => typeof id === 'string') : []
    const collectedReferenceIds: string[] = []
    for (const artifact of sourceArtifacts) {
      if (artifact.id === sourceArtifact?.id) continue
      if (artifact.kind !== 'image' && artifact.kind !== 'collection') continue
      const version = artifact.currentVersionId ? await this.artifacts.getVersionById(artifact.currentVersionId) : undefined
      if (version?.contentRefType === 'asset' && version.contentRefId) collectedReferenceIds.push(version.contentRefId)
    }
    const referenceAssetIds = [...userReferenceIds, ...collectedReferenceIds.filter((id) => !userReferenceIds.includes(id))].slice(0, 8)
    const executorConfig = await this.hydrateImageConfig(
      input.workspaceId,
      referenceAssetIds.length > 0 ? { ...input.config, referenceAssetIds } : input.config,
      sourceVersion,
    )

    let mediaSerial = 0
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
        config: executorConfig,
        contextText: context.text,
        ...(provider ? { provider } : {}),
        saveMedia: async (media, role) => this.saveMediaAsset(input.workspaceId, input.projectId, input.createdBy, media, role, now + mediaSerial++),
      },
      signal,
    )

    const applied = await this.applyResult(input, definition, result, sourceArtifact, now)

    return {
      providerKey: result.generation?.providerKey ?? 'manual',
      model: result.generation?.model ?? 'none',
      requestSnapshot: { ...((result.generation?.requestSnapshot as Record<string, unknown> | undefined) ?? {}), knowledgeCitations: externalKnowledge.citations, referenceAssetIds },
      responseSnapshot: result.generation?.responseSnapshot ?? { outputBehavior: result.outputBehavior },
      usage: result.generation?.usage ?? {},
      output: {
        runId: input.runId,
        operationId: input.operationId,
        outputBehavior: result.outputBehavior,
        outputArtifactIds: applied.outputArtifactIds,
        outputVersionIds: applied.outputVersionIds,
        knowledgeCitations: externalKnowledge.citations,
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
    this.emitRunEvent(input, 'run.completed', { runId: input.runId, operationId: input.operationId, sourceArtifactId: input.sourceArtifactId, output: result.output })
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
      sourceArtifactId: input.sourceArtifactId,
      error: { code, message: safeError },
    })
  }

  private async loadInputs(input: OperationTaskInput): Promise<[ArtifactVersion | undefined, ArtifactRecord | undefined, ArtifactVersion[], ArtifactRecord[]]> {
    // 全部源 artifact（多选集合），主源在前；旧 run 只有 sourceArtifactId。
    const orderedIds: string[] = []
    for (const id of [input.sourceArtifactId ?? null, ...input.sourceArtifactIds]) {
      if (id && !orderedIds.includes(id)) orderedIds.push(id)
    }
    const sourceArtifacts: ArtifactRecord[] = []
    for (const id of orderedIds) {
      const artifact = await this.artifacts.getById(id)
      if (artifact && artifact.deletedAt === null) sourceArtifacts.push(artifact)
    }
    const primary = sourceArtifacts.find((artifact) => artifact.id === input.sourceArtifactId) ?? sourceArtifacts[0]

    let sourceVersion: ArtifactVersion | undefined
    if (primary?.currentVersionId) {
      const version = await this.artifacts.getVersionById(primary.currentVersionId)
      if (version) sourceVersion = mapVersionRecord(version)
    }

    // 上下文输入 = 主源的上游连线 + 多选集合中的其余源（去重，按 artifactId）。
    const connectedInputs: ArtifactVersion[] = []
    const seenArtifactIds = new Set<string>()
    const pushVersion = async (artifactId: string) => {
      if (seenArtifactIds.has(artifactId)) return
      seenArtifactIds.add(artifactId)
      const artifact = await this.artifacts.getById(artifactId)
      if (!artifact?.currentVersionId) return
      const version = await this.artifacts.getVersionById(artifact.currentVersionId)
      if (version) connectedInputs.push(mapVersionRecord(version))
    }
    if (primary) {
      seenArtifactIds.add(primary.id)
      const edges = await this.canvas.listEdgesByProject(primary.projectId)
      const incoming = edges.filter((edge) => edge.targetArtifactId === primary.id)
      for (const edge of incoming) await pushVersion(edge.sourceArtifactId)
    }
    for (const artifact of sourceArtifacts) {
      if (artifact.id === primary?.id) continue
      await pushVersion(artifact.id)
    }
    if (!primary && connectedInputs.length === 0 && input.inputVersionIds.length > 0) {
      for (const versionId of input.inputVersionIds) {
        const version = await this.artifacts.getVersionById(versionId)
        if (version) connectedInputs.push(mapVersionRecord(version))
      }
    }
    return [sourceVersion, primary, connectedInputs, sourceArtifacts]
  }

  private async selectProvider(workspaceId: string, operationId: string) {
    const capability = operationCapability[operationId]
    if (!capability) return undefined
    const provider = await this.providers.resolve(workspaceId, capability)
    if (!provider) throw new OperationProviderUnavailableError(capability)
    return provider
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
    // Run 创建时已落地的占位 artifact（loading 节点）：直接复用，跳过重复的 artifact/node/edge 创建。
    const runRecord = await this.runs.getById(input.runId)
    const placeholderArtifactId = runRecord?.outputArtifactIdsJson ? (JSON.parse(runRecord.outputArtifactIdsJson) as string[])[0] : undefined
    const placeholder = placeholderArtifactId ? await this.artifacts.getById(placeholderArtifactId) : undefined
    const reuse = placeholder && placeholder.projectId === input.projectId ? placeholder : undefined

    switch (result.outputBehavior) {
      case 'new_artifact': {
        const role = result.role ?? definition.output?.role ?? 'draft'
        const artifact = reuse ?? await this.artifacts.create({
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
        if (!reuse) this.emitRunEvent(input, 'artifact.created', { runId: input.runId, artifactId: artifact.id, kind, role })
        if (result.contentRef) {
          const { version } = this.artifacts.createVersion(this.versionInput(artifact.id, input, result, now))
          outputs.outputVersionIds.push(version.id)
          this.emitRunEvent(input, 'artifact.version.created', { runId: input.runId, artifactId: artifact.id, versionId: version.id })
        }

        if (!reuse) {
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
        const artifact = reuse ?? await this.artifacts.create({
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
        if (!reuse) this.emitRunEvent(input, 'artifact.created', { runId: input.runId, artifactId: artifact.id, kind: 'collection', role })

        const candidates = result.candidates && result.candidates.length > 0 ? result.candidates : (result.contentRef ? [result] : [])
        for (let index = 0; index < candidates.length; index += 1) {
          const candidate = candidates[index]!
          const candidateArtifact = await this.artifacts.create({
            id: ulid(now + index + 1),
            workspaceId: input.workspaceId,
            projectId,
            kind: 'image',
            role: candidate.role ?? role,
            currentVersionId: null,
            createdBy: input.createdBy,
            createdAt: now + index + 1,
            updatedAt: now + index + 1,
          })
          const { version } = this.artifacts.createVersion(this.versionInput(candidateArtifact.id, input, candidate, now + candidates.length + index + 10))
          // Compatibility projection: legacy Collection readers still see candidate versions
          // while V1 stores each candidate as its own durable image Artifact.
          this.artifacts.createVersion(this.versionInput(artifact.id, input, candidate, now + candidates.length * 2 + index + 20))
          this.artifacts.addCollectionItem(artifact.id, candidateArtifact.id, index, index === 0)
          outputs.outputVersionIds.push(version.id)
          this.emitRunEvent(input, 'artifact.version.created', { runId: input.runId, artifactId: candidateArtifact.id, collectionArtifactId: artifact.id, versionId: version.id })
        }

        if (!reuse) {
          const sourceNodes = input.sourceArtifactId ? await this.canvas.getNodesByArtifact(input.sourceArtifactId) : []
          const anchor = sourceNodes[0]
          const node = await this.canvas.createNode({
            id: ulid(now + candidates.length + 2),
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
              id: ulid(now + candidates.length + 3),
              projectId,
              sourceArtifactId: input.sourceArtifactId,
              targetArtifactId: artifact.id,
              inputSlot: role,
              createdAt: now,
            })
            outputs.edgeIds.push(edge.id)
            this.emitRunEvent(input, 'edge.created', { runId: input.runId, sourceArtifactId: input.sourceArtifactId, targetArtifactId: artifact.id, edgeId: edge.id })
          }
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

  private async hydrateImageConfig(workspaceId: string, config: Record<string, unknown>, sourceVersion: ArtifactVersion | undefined): Promise<Record<string, unknown>> {
    const referenceIds = Array.isArray(config.referenceAssetIds) ? config.referenceAssetIds.filter((id): id is string => typeof id === 'string').slice(0, 8) : []
    const sourceAssetId = typeof config.overrideSourceAssetId === 'string' ? config.overrideSourceAssetId : sourceVersion?.contentRef?.type === 'asset' ? sourceVersion.contentRef.id : undefined
    const ids = [...(sourceAssetId ? [sourceAssetId] : []), ...referenceIds]
    const inputImages: Array<{ bytes: Uint8Array; mimeType: string; name: string }> = []
    for (const id of ids) {
      const asset = await this.assets.getByWorkspaceAndId(workspaceId, id)
      if (!asset || asset.kind !== 'image') continue
      inputImages.push({ bytes: await this.files.read(asset.storagePath), mimeType: asset.mimeType, name: asset.displayName })
    }
    let mask: Array<{ bytes: Uint8Array; mimeType: string; name: string }> = []
    if (typeof config.maskAssetId === 'string') {
      const asset = await this.assets.getByWorkspaceAndId(workspaceId, config.maskAssetId)
      if (asset?.kind === 'image') mask = [{ bytes: await this.files.read(asset.storagePath), mimeType: asset.mimeType, name: asset.displayName }]
    }
    const safe = { ...config }
    delete safe.referenceAssetIds
    delete safe.maskAssetId
    delete safe.overrideSourceAssetId
    return { ...safe, ...(inputImages.length ? { inputImages } : {}), ...(mask.length ? { mask } : {}) }
  }

  private emitRunEvent(input: OperationTaskInput, eventType: string, payload: Record<string, unknown>): void {
    this.events.emit(input.workspaceId, input.projectId, eventType, payload)
  }

  /** 把媒体生成结果写入 file store + assets 表，返回 assetId（Version.contentRef 指向它）。 */
  private async saveMediaAsset(workspaceId: string, projectId: string, createdBy: string, media: MediaResult, role: string, now: number): Promise<string> {
    const temporary = await this.files.writeTemporary(media.bytes)
    let record: AssetRecord | undefined
    try {
      const id = ulid(now)
      const extension = media.mimeType === 'image/png' ? 'png' : media.mimeType === 'image/jpeg' ? 'jpg' : media.mimeType === 'image/webp' ? 'webp' : media.mimeType === 'image/gif' ? 'gif' : media.mimeType === 'audio/wav' ? 'wav' : media.mimeType === 'audio/mpeg' ? 'mp3' : media.mimeType === 'video/mp4' ? 'mp4' : 'bin'
      const displayName = `${role}-${id.slice(-6)}.${extension}`
      const storagePath = this.files.storagePath(id, displayName)
      const kind = (media.mimeType.startsWith('image/') ? 'image' : media.mimeType.startsWith('audio/') ? 'audio' : media.mimeType.startsWith('video/') ? 'video' : 'document') as AssetRecord['kind']
      record = await this.assets.create({
        id,
        workspaceId,
        projectId,
        kind,
        source: 'generated',
        displayName,
        mimeType: media.mimeType,
        sizeBytes: media.bytes.byteLength,
        storagePath,
        sha256: createHash('sha256').update(media.bytes).digest('hex'),
        width: media.width ?? null,
        height: media.height ?? null,
        durationMs: media.durationMs ?? null,
        createdBy,
        createdAt: now,
        updatedAt: now,
      })
      try { await this.files.commit(temporary, storagePath) } catch (error) { await this.assets.hardDelete(id); throw error }
      return record.id
    } finally {
      await this.files.cleanup(temporary)
    }
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
