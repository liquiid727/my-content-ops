import type { GenerationProvider, GenerationRequest, GenerationResult, ProviderCapability } from './generation-provider.js'

/** 极小的 HTTP 抽象，便于测试注入 mock（生产用全局 `fetch`）。 */
export interface HttpJsonClient {
  post(url: string, init: { headers: Record<string, string>; body: string; signal?: AbortSignal }): Promise<{ status: number; json(): Promise<unknown> }>
}

export const fetchHttpClient: HttpJsonClient = {
  post: (url, init) => fetch(url, { method: 'POST', headers: init.headers, body: init.body, signal: init.signal ?? null }),
}

export interface OpenAITextConfig {
  key: string
  apiKey: string
  model: string
  baseUrl?: string
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

/**
 * OpenAI 兼容 Chat Completions 文本 provider。
 * 模型 ID / baseUrl 来自 provider_configs 配置，不在代码中硬编码；
 * 仅接受非 2xx 时抛出 `PROVIDER_HTTP_ERROR`，由 Task 失败路径转为可读错误。
 */
export class OpenAITextProvider implements GenerationProvider {
  readonly key: string
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set(['text_generation'])
  private readonly baseUrl: string

  constructor(private readonly config: OpenAITextConfig, private readonly http: HttpJsonClient) {
    this.key = config.key
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
  }

  async generate(request: GenerationRequest, signal: AbortSignal): Promise<GenerationResult> {
    const response = await this.http.post(`${this.baseUrl}/chat/completions`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: request.prompt }],
        ...(request.config ? { ...request.config } : {}),
      }),
      signal,
    })

    if (response.status >= 400) {
      let detail: unknown
      try { detail = await response.json() } catch { detail = null }
      throw new Error(`PROVIDER_HTTP_ERROR:status=${response.status}:${JSON.stringify(detail)}`)
    }

    const data = (await response.json()) as {
      model?: string
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const text = data.choices?.[0]?.message?.content ?? ''
    const usage = {
      inputUnits: data.usage?.prompt_tokens ?? 0,
      outputUnits: data.usage?.completion_tokens ?? 0,
    }
    return { model: data.model ?? this.config.model, text, usage }
  }
}
