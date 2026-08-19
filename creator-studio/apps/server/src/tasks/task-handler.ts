import { seedTaskInputSchema } from '@creator-studio/contracts'
import type { z } from 'zod'
import type { TaskRecord } from '../db/schema.js'
import type { GenerationProviderRegistry } from '../providers/index.js'

export interface TaskHandlerResult { providerKey: string; model: string; requestSnapshot: unknown; responseSnapshot: unknown; usage: unknown; output: unknown }
export interface TaskHandler {
  readonly type: string
  readonly recoverable: boolean
  parse(input: unknown): unknown
  execute(input: unknown, signal: AbortSignal): Promise<TaskHandlerResult>
  /** 可选：自定义成功完成路径（默认写 generation + 标记 completed）。 */
  onCompleted?(input: unknown, result: TaskHandlerResult, task: TaskRecord, finishedAt: number): Promise<void>
  /** 可选：自定义失败路径（默认仅由 TaskRunner 标记 failed）。 */
  onFailed?(input: unknown, task: TaskRecord, error: unknown): Promise<void>
}

export class TaskHandlerRegistry {
  private readonly handlers = new Map<string, TaskHandler>()
  register(handler: TaskHandler): this { if (this.handlers.has(handler.type)) throw new Error(`Task handler already registered: ${handler.type}`); this.handlers.set(handler.type, handler); return this }
  get(type: string): TaskHandler | undefined { return this.handlers.get(type) ?? this.matchPrefix(type) }
  require(type: string): TaskHandler {
    const handler = this.get(type)
    if (!handler) throw new Error(`TASK_TYPE_UNSUPPORTED:${type}`)
    return handler
  }
  /** 最长前缀匹配：`operation.generate_outline` → handler `operation`。 */
  private matchPrefix(type: string): TaskHandler | undefined {
    let best: TaskHandler | undefined
    for (const handler of this.handlers.values()) {
      if (handler.type === type) return handler
      if (type.startsWith(`${handler.type}.`) && (!best || handler.type.length > best.type.length)) {
        best = handler
      }
    }
    return best
  }
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
