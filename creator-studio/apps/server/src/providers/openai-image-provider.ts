import type { GenerationProvider, GenerationRequest, GenerationResult, MediaCapability, MediaResult, ProviderCapability } from './generation-provider.js'

export interface OpenAIImageConfig { key: string; apiKey: string; model: string; baseUrl?: string }
export interface ImageHttpClient { fetch(url: string, init: RequestInit): Promise<Response> }
const defaultHttp: ImageHttpClient = { fetch: (url, init) => fetch(url, init) }
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
type ImageInput = { bytes: Uint8Array; mimeType: string; name?: string }

function imageInputs(value: unknown): ImageInput[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is ImageInput => typeof item === 'object' && item !== null && (item as ImageInput).bytes instanceof Uint8Array && typeof (item as ImageInput).mimeType === 'string')
}
function outputMimeType(format: unknown): string { return format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png' }

/** OpenAI Images-compatible generation/edit adapter. Model and endpoint root are configuration, not domain constants. */
export class OpenAIImageProvider implements GenerationProvider {
  readonly key: string
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set(['image_generation'])
  private readonly baseUrl: string

  constructor(private readonly config: OpenAIImageConfig, private readonly http: ImageHttpClient = defaultHttp) {
    this.key = config.key
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
  }
  async generate(): Promise<GenerationResult> { throw new Error('OpenAIImageProvider does not support text generation') }

  async generateMedia(capability: MediaCapability, request: GenerationRequest, signal: AbortSignal): Promise<MediaResult> {
    if (capability !== 'image_generation') throw new Error(`OpenAIImageProvider does not support ${capability}`)
    const config = request.config ?? {}
    const inputs = imageInputs(config.inputImages)
    const mask = imageInputs(config.mask)[0]
    const isEdit = inputs.length > 0 || mask !== undefined
    const allowed = ['size', 'quality', 'background', 'output_format', 'moderation', 'n'] as const
    let response: Response
    if (isEdit) {
      const form = new FormData()
      form.set('model', this.config.model); form.set('prompt', request.prompt)
      for (const input of inputs) form.append('image[]', new Blob([Buffer.from(input.bytes)], { type: input.mimeType }), input.name ?? 'reference.png')
      if (mask) form.set('mask', new Blob([Buffer.from(mask.bytes)], { type: mask.mimeType }), mask.name ?? 'mask.png')
      for (const key of allowed) if (config[key] !== undefined) form.set(key, String(config[key]))
      response = await this.http.fetch(`${this.baseUrl}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${this.config.apiKey}` }, body: form, signal })
    } else {
      const body: Record<string, unknown> = { model: this.config.model, prompt: request.prompt }
      for (const key of allowed) if (config[key] !== undefined) body[key] = config[key]
      response = await this.http.fetch(`${this.baseUrl}/images/generations`, { method: 'POST', headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
    }
    if (!response.ok) { const detail = await response.text().catch(() => ''); throw new Error(`PROVIDER_HTTP_ERROR:status=${response.status}:${detail.slice(0, 1_000)}`) }
    const payload = await response.json() as { data?: Array<{ b64_json?: string; url?: string }>; usage?: { input_tokens?: number; output_tokens?: number } }
    const output = payload.data?.[0]
    if (!output) throw new Error('PROVIDER_INVALID_RESPONSE:no image data')
    let bytes: Uint8Array
    if (output.b64_json) bytes = Buffer.from(output.b64_json, 'base64')
    else if (output.url) { const download = await this.http.fetch(output.url, { method: 'GET', signal }); if (!download.ok) throw new Error(`PROVIDER_DOWNLOAD_ERROR:status=${download.status}`); bytes = new Uint8Array(await download.arrayBuffer()) }
    else throw new Error('PROVIDER_INVALID_RESPONSE:no image content')
    const size = typeof config.size === 'string' ? config.size.match(/^(\d+)x(\d+)$/) : null
    return { model: this.config.model, mimeType: outputMimeType(config.output_format), bytes, ...(size ? { width: Number(size[1]), height: Number(size[2]) } : {}), usage: { inputUnits: payload.usage?.input_tokens ?? request.prompt.length, outputUnits: payload.usage?.output_tokens ?? bytes.byteLength } }
  }
}
