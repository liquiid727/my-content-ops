import { ConfigRepository } from '../repositories/index.js'
import { SecretStore } from '../settings/secret-store.js'
import type { GenerationProvider, ProviderCapability } from './generation-provider.js'
import { OpenAITextProvider, type HttpJsonClient } from './openai-text-provider.js'
import { SeedGenerationProvider } from './seed-provider.js'
import { SeedMediaProvider } from './seed-media-provider.js'

/**
 * 按 workspace + 能力解析 Provider：
 * - `text_generation`：优先启用且已配置密钥的真实文本 LLM（OpenAI 兼容），无配置回退 Seed。
 * - 媒体能力（image/audio/video）：真实 provider 接入前回退 Seed media（产出占位 PNG/WAV 落 assets），
 *   保证 Issue #10 媒体链路端到端可用。
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
    if (capability !== 'text_generation') {
      return this.mediaFallback.capabilities.has(capability) ? this.mediaFallback : undefined
    }

    const configs = await this.configs.listProviders(workspaceId)
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
}
