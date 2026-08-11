export type ProviderCapability = 'text_generation' | 'image_generation' | 'audio_generation' | 'video_generation'

export interface GenerationRequest { prompt: string }
export interface GenerationResult { model: string; text: string; usage: { inputUnits: number; outputUnits: number } }
export interface GenerationProvider {
  readonly key: string
  readonly capabilities: ReadonlySet<ProviderCapability>
  generate(request: GenerationRequest, signal: AbortSignal): Promise<GenerationResult>
}

export class GenerationProviderRegistry {
  constructor(private readonly providers: readonly GenerationProvider[]) {}
  require(capability: ProviderCapability): GenerationProvider {
    const provider = this.providers.find((candidate) => candidate.capabilities.has(capability))
    if (!provider) throw new Error(`No provider registered for ${capability}`)
    return provider
  }
}

