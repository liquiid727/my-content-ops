import type { GenerationProvider, GenerationRequest, GenerationResult } from './generation-provider.js'

export class SeedGenerationProvider implements GenerationProvider {
  readonly key = 'seed'
  readonly capabilities = new Set<'text_generation'>(['text_generation'])

  async generate(request: GenerationRequest, signal: AbortSignal): Promise<GenerationResult> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 5)
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason ?? new Error('Generation cancelled')) }, { once: true })
    })
    const text = `Seed result generated for ${request.prompt.length} input characters.`
    return { model: 'seed-text-v1', text, usage: { inputUnits: request.prompt.length, outputUnits: text.length } }
  }
}
