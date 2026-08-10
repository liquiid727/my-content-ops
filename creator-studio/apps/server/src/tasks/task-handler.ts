import { seedTaskInputSchema } from '@creator-studio/contracts'
import type { z } from 'zod'
import type { GenerationProviderRegistry } from '../providers/index.js'

export interface TaskHandlerResult { providerKey: string; model: string; requestSnapshot: unknown; responseSnapshot: unknown; usage: unknown; output: unknown }
export interface TaskHandler { readonly type: string; readonly recoverable: boolean; parse(input: unknown): unknown; execute(input: unknown, signal: AbortSignal): Promise<TaskHandlerResult> }

export class TaskHandlerRegistry {
  private readonly handlers = new Map<string, TaskHandler>()
  register(handler: TaskHandler): this { if (this.handlers.has(handler.type)) throw new Error(`Task handler already registered: ${handler.type}`); this.handlers.set(handler.type, handler); return this }
  get(type: string): TaskHandler | undefined { return this.handlers.get(type) }
  require(type: string): TaskHandler { const handler = this.get(type); if (!handler) throw new Error(`TASK_TYPE_UNSUPPORTED:${type}`); return handler }
}

export class SeedTaskHandler implements TaskHandler {
  readonly type = 'seed_generation'
  readonly recoverable = true
  constructor(private readonly providers: GenerationProviderRegistry) {}
  parse(input: unknown): z.infer<typeof seedTaskInputSchema> { return seedTaskInputSchema.parse(input) }
  async execute(raw: unknown, signal: AbortSignal): Promise<TaskHandlerResult> {
    const input = this.parse(raw)
    const provider = this.providers.require('text_generation')
    const result = await provider.generate(input, signal)
    return {
      providerKey: provider.key, model: result.model,
      requestSnapshot: { promptLength: input.prompt.length },
      responseSnapshot: { text: result.text }, usage: result.usage,
      output: { text: result.text },
    }
  }
}
