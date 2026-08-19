import { ConfigRepository } from '../repositories/index.js'
import { SecretStore } from '../settings/secret-store.js'
import type { GenerationProvider, ProviderCapability } from './generation-provider.js'
import { OpenAIImageProvider } from './openai-image-provider.js'
import { OpenAITextProvider, type HttpJsonClient } from './openai-text-provider.js'
import { SeedGenerationProvider } from './seed-provider.js'
import { SeedMediaProvider } from './seed-media-provider.js'

/**
 * 按 workspace + 能力解析 Provider：
 * - `text_generation`：优先启用且已配置密钥的真实文本 LLM（OpenAI 兼容），无配置回退 Seed。
 * - `image_generation`：读取 imageModel，使用 OpenAI Images-compatible adapter。
 * - Seed media 只在 test 或显式 demo 模式启用，不冒充生产输出。
 */
export class ProviderService {
  constructor(
    private readonly configs: ConfigRepository,
    private readonly secrets: SecretStore,
    private readonly http: HttpJsonClient,
    private readonly fallback: GenerationProvider = new SeedGenerationProvider(),
    private readonly mediaFallback: GenerationProvider = new SeedMediaProvider(),
  ) {}

  async resolve(workspaceId: string, capability: ProviderCapability): Promise<GenerationProvider | undefined> {
    const configs = await this.configs.listProviders(workspaceId)
    if (capability === 'image_generation') {
      for (const config of configs) {
        if (!config.enabled || !config.secretRef || !(await this.secrets.has(config.secretRef))) continue
        const apiKey = await this.secrets.get(config.secretRef)
        if (!apiKey) continue
        const parsed = JSON.parse(config.configJson) as { model?: string; imageModel?: string; baseUrl?: string }
        const model = parsed.imageModel ?? (config.providerKey.includes('image') ? parsed.model : undefined)
        if (!model) continue
        return new OpenAIImageProvider({ key: config.providerKey, apiKey, model, ...(parsed.baseUrl ? { baseUrl: parsed.baseUrl } : {}) })
      }
      return this.demoMedia(capability)
    }
    if (capability !== 'text_generation') return this.demoMedia(capability)

    for (const config of configs) {
      if (!config.enabled || !config.secretRef) continue
      if (!(await this.secrets.has(config.secretRef))) continue
      const apiKey = await this.secrets.get(config.secretRef)
      if (apiKey === undefined) continue
      const parsed = JSON.parse(config.configJson) as { model?: string; baseUrl?: string }
      if (!parsed.model) continue
      return new OpenAITextProvider({
        key: config.providerKey,
        apiKey,
        model: parsed.model,
        ...(parsed.baseUrl ? { baseUrl: parsed.baseUrl } : {}),
      }, this.http)
    }
    return this.fallback
  }

  private demoMedia(capability: ProviderCapability): GenerationProvider | undefined {
    const enabled = process.env.CREATOR_STUDIO_DEMO_MEDIA === 'true' || process.env.NODE_ENV === 'test'
    return enabled && this.mediaFallback.capabilities.has(capability) ? this.mediaFallback : undefined
  }
}
