import type { ArtifactVersion, ContentRef } from '@creator-studio/contracts'

import type { GenerationProvider, MediaResult } from '../providers/generation-provider.js'

export interface ExecutorContext {
  workspaceId: string
  projectId: string
  runId: string
  operationId: string
  createdBy: string
  sourceArtifact?: ArtifactVersion
  sourceKind?: string
  sourceRole?: string
  connectedInputs: ArtifactVersion[]
  config: Record<string, unknown>
  contextText: string
  provider?: GenerationProvider
  /** 把媒体生成结果落 assets/file store，返回 assetId。 */
  saveMedia?: (media: MediaResult, role: string) => Promise<string>
}

export interface GenerationTrace {
  providerKey: string
  model: string
  requestSnapshot: unknown
  responseSnapshot: unknown
  usage: unknown
}

export interface ExecutorResult {
  outputBehavior: 'new_artifact' | 'new_version' | 'new_collection' | 'side_effect'
  contentRef?: ContentRef | null
  role?: string
  /** 新建 Artifact 的 kind（缺省取 operation output.kind 或源 artifact kind）。 */
  kind?: string
  metadata?: Record<string, unknown>
  sideEffect?: { kind: string; detail: string }
  candidates?: ExecutorResult[]
  generation?: GenerationTrace
}

export interface OperationExecutor {
  execute(ctx: ExecutorContext, signal: AbortSignal): Promise<ExecutorResult>
}

export class OperationProviderUnavailableError extends Error {
  constructor(readonly capability: string) {
    super(`No provider available for ${capability}`)
    this.name = 'OperationProviderUnavailableError'
  }
}

function requireProvider(ctx: ExecutorContext): GenerationProvider {
  if (!ctx.provider) throw new OperationProviderUnavailableError('required capability')
  return ctx.provider
}

function requireMediaProvider(ctx: ExecutorContext, capability: 'image_generation' | 'audio_generation' | 'video_generation'): NonNullable<GenerationProvider['generateMedia']> {
  const provider = requireProvider(ctx)
  if (!provider.generateMedia) throw new OperationProviderUnavailableError(capability)
  return provider.generateMedia.bind(provider)
}

function requireSaveMedia(ctx: ExecutorContext): (media: MediaResult, role: string) => Promise<string> {
  if (!ctx.saveMedia) throw new Error('OPERATION_MEDIA_SINK_MISSING')
  return ctx.saveMedia
}

/** 文本生成类 executor：System+上下文 → provider.generate → inline 文本结果。 */
function createTextExecutor(instruction: string, behavior: 'new_artifact' | 'new_version'): OperationExecutor {
  return {
    async execute(ctx, signal) {
      const provider = requireProvider(ctx)
      const prompt = `${ctx.contextText}\n\n## 任务指令\n${instruction}`
      const result = await provider.generate({ prompt }, signal)
      return {
        outputBehavior: behavior,
        contentRef: { type: 'inline', text: result.text },
        metadata: { model: result.model, operationId: ctx.operationId },
        generation: {
          providerKey: provider.key,
          model: result.model,
          requestSnapshot: { promptLength: prompt.length },
          responseSnapshot: { text: result.text },
          usage: result.usage,
        },
      }
    },
  }
}

export const executors: Record<string, OperationExecutor> = {
  'operation.generate_outline': createTextExecutor(
    '根据「选题」生成一份结构清晰的内容大纲。大纲用分级标题组织，包含核心论点、展开要点与收尾。控制在 5~10 个要点。',
    'new_artifact',
  ),
  'operation.generate_script': createTextExecutor(
    '根据「大纲」撰写一段可直接口播的脚本。口语化、有节奏、有钩子，段落间用空行分隔。避免书面语。',
    'new_artifact',
  ),
  'operation.polish': createTextExecutor(
    '润色给定的文本：提升表达自然度与感染力，保留原意与结构，不要改变事实。',
    'new_version',
  ),
  'operation.research': createTextExecutor(
    '对给定选题做桌面调研式补充：给出背景、关键数据或论点支撑，组织成结构化笔记。',
    'new_version',
  ),
  'operation.rewrite': createTextExecutor('用另一种表达方式重写给定文本，保留原意。', 'new_version'),
  'operation.expand': createTextExecutor('扩写给定文本，补充细节、例子与过渡，使内容更丰满。', 'new_version'),
  'operation.shorten': createTextExecutor('精简给定文本，保留核心信息，删去冗余。', 'new_version'),
  'operation.generate_article': createTextExecutor('根据大纲生成一篇完整图文稿。', 'new_artifact'),
  'operation.generate_cover': {
    async execute(ctx, signal) {
      const generateMedia = requireMediaProvider(ctx, 'image_generation')
      const saveMedia = requireSaveMedia(ctx)
      const count = typeof ctx.config.count === 'number' ? Math.max(1, Math.min(6, Math.floor(ctx.config.count))) : 3
      const prompt = `${ctx.contextText}\n\n## 任务指令\n为脚本生成封面主视觉。`
      const candidates: ExecutorResult[] = []
      for (let index = 0; index < count; index += 1) {
        const media = await generateMedia('image_generation', { prompt, config: { index } }, signal)
        const assetId = await saveMedia(media, 'cover')
        candidates.push({
          outputBehavior: 'new_collection',
          kind: 'image',
          role: 'cover',
          contentRef: { type: 'asset', id: assetId },
          metadata: { model: media.model, candidate: index, mimeType: media.mimeType, width: media.width ?? null, height: media.height ?? null },
        })
      }
      const first = candidates[0]
      return {
        outputBehavior: 'new_collection',
        kind: 'image',
        role: 'cover',
        candidates,
        metadata: first?.metadata ?? {},
        generation: {
          providerKey: ctx.provider?.key ?? 'seed-media',
          model: String(first?.metadata?.model ?? 'seed-image-v1'),
          requestSnapshot: { promptLength: prompt.length, count },
          responseSnapshot: { assetCount: candidates.length },
          usage: { inputUnits: prompt.length, outputUnits: candidates.length },
        },
      }
    },
  },
  'operation.generate_voice': {
    async execute(ctx, signal) {
      const generateMedia = requireMediaProvider(ctx, 'audio_generation')
      const saveMedia = requireSaveMedia(ctx)
      const prompt = `${ctx.contextText}\n\n## 任务指令\n为脚本生成配音旁白文本。`
      const media = await generateMedia('audio_generation', { prompt }, signal)
      const assetId = await saveMedia(media, 'voice')
      return {
        outputBehavior: 'new_artifact',
        kind: 'audio',
        role: 'voice',
        contentRef: { type: 'asset', id: assetId },
        metadata: { model: media.model, mimeType: media.mimeType, durationMs: media.durationMs ?? null },
        generation: { providerKey: ctx.provider?.key ?? 'seed-media', model: media.model, requestSnapshot: { promptLength: prompt.length }, responseSnapshot: { assetId }, usage: media.usage },
      }
    },
  },
  'operation.edit': {
    async execute(ctx) {
      const text = typeof ctx.config.text === 'string' ? ctx.config.text : ''
      return { outputBehavior: 'new_version', contentRef: { type: 'inline', text }, metadata: { manual: true } }
    },
  },
  'operation.branch': {
    async execute(ctx) {
      return {
        outputBehavior: 'new_artifact',
        kind: ctx.sourceKind ?? 'text',
        role: ctx.sourceRole ?? 'topic',
        contentRef: ctx.sourceArtifact?.contentRef ?? { type: 'inline', text: '' },
        metadata: { branchOf: ctx.sourceArtifact?.id },
      }
    },
  },
  'operation.publish': {
    async execute() {
      return {
        outputBehavior: 'side_effect',
        sideEffect: { kind: 'publish', detail: '发布任务已创建（MVP 骨架，未接真实平台）' },
        metadata: { skeleton: true },
      }
    },
  },
  'operation.not_implemented': {
    async execute() {
      throw new Error('OPERATION_NOT_IMPLEMENTED')
    },
  },
}
