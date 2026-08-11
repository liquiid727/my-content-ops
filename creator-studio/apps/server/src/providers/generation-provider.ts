export type ProviderCapability = 'text_generation' | 'image_generation' | 'audio_generation' | 'video_generation'

export interface GenerationRequest { prompt: string; config?: Record<string, unknown> }
export interface GenerationResult { model: string; text: string; usage: { inputUnits: number; outputUnits: number } }

/** 媒体生成结果：二进制由执行方落 `assets`/file store，Version contentRef 指向 asset。 */
export interface MediaResult {
  model: string
  mimeType: string
  bytes: Uint8Array
  width?: number | null
  height?: number | null
  durationMs?: number | null
  usage: { inputUnits: number; outputUnits: number }
}

export type MediaCapability = 'image_generation' | 'audio_generation' | 'video_generation'

export interface GenerationProvider {
  readonly key: string
  readonly capabilities: ReadonlySet<ProviderCapability>
  generate(request: GenerationRequest, signal: AbortSignal): Promise<GenerationResult>
  /** 媒体能力：真实 provider 未配置时由 Seed fallback 产出占位文件。 */
  generateMedia?(capability: MediaCapability, request: GenerationRequest, signal: AbortSignal): Promise<MediaResult>
}

export class GenerationProviderRegistry {
  constructor(private readonly providers: readonly GenerationProvider[]) {}
  require(capability: ProviderCapability): GenerationProvider {
    const provider = this.providers.find((candidate) => candidate.capabilities.has(capability))
    if (!provider) throw new Error(`No provider registered for ${capability}`)
    return provider
  }
}
