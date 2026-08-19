import { taskEventDataSchema, taskEventTypeSchema, type TaskEventData, type TaskEventType } from '@creator-studio/contracts'
import { ensureTaskSession } from './task-api'

export interface TaskStreamEvent {
  id?: number
  type: TaskEventType
  data?: TaskEventData
}

interface RawSseEvent { id?: string; event?: string; data?: string }

export class SseParser {
  private buffer = ''

  push(chunk: string): RawSseEvent[] {
    this.buffer = (this.buffer + chunk).replaceAll('\r\n', '\n')
    const blocks = this.buffer.split('\n\n')
    this.buffer = blocks.pop() ?? ''
    return blocks.map((block) => this.parseBlock(block)).filter((event): event is RawSseEvent => event !== undefined)
  }

  private parseBlock(block: string): RawSseEvent | undefined {
    const result: RawSseEvent = {}
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue
      const separator = line.indexOf(':')
      const field = separator < 0 ? line : line.slice(0, separator)
      const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '')
      if (field === 'id') result.id = value
      if (field === 'event') result.event = value
      if (field === 'data') data.push(value)
    }
    if (data.length > 0) result.data = data.join('\n')
    return result.id !== undefined || result.event !== undefined || result.data !== undefined ? result : undefined
  }
}

export function reconnectDelay(attempt: number, baseMs = 500, capMs = 10_000): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1))
}

interface TaskEventStreamOptions {
  onEvent: (event: TaskStreamEvent) => void | Promise<void>
  beforeReconnect: () => void | Promise<void>
  onStatus?: (status: 'connected' | 'reconnecting' | 'stopped') => void
  fetcher?: typeof fetch
  inactivityMs?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

export class TaskEventStream {
  private active = false
  private controller: AbortController | undefined
  private wakeReconnect: (() => void) | undefined
  private lastEventId = 0
  private readonly fetcher: typeof fetch

  constructor(private readonly options: TaskEventStreamOptions) {
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
  }

  async start(): Promise<void> {
    if (this.active) return
    this.active = true
    let attempt = 0
    let firstConnection = true
    while (this.active) {
      try {
        if (!firstConnection) await this.options.beforeReconnect()
        if (!this.active) break
        firstConnection = false
        await this.consume(() => { attempt = 0 })
        if (this.active) throw new Error('Task event stream closed')
      } catch {
        if (!this.active) break
        attempt += 1
        this.options.onStatus?.('reconnecting')
        await this.waitForReconnect(reconnectDelay(attempt, this.options.baseDelayMs, this.options.maxDelayMs))
      }
    }
    this.options.onStatus?.('stopped')
  }

  stop(): void {
    this.active = false
    this.controller?.abort()
    this.wakeReconnect?.()
  }

  private async waitForReconnect(delayMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { this.wakeReconnect = undefined; resolve() }, delayMs)
      this.wakeReconnect = () => { clearTimeout(timer); this.wakeReconnect = undefined; resolve() }
    })
  }

  private async consume(onOpen: () => void): Promise<void> {
    await ensureTaskSession()
    if (!this.active) return
    const controller = new AbortController()
    this.controller = controller
    const inactivityMs = this.options.inactivityMs ?? 45_000
    let watchdog = setTimeout(() => controller.abort(), inactivityMs)
    const touch = () => {
      clearTimeout(watchdog)
      watchdog = setTimeout(() => controller.abort(), inactivityMs)
    }
    try {
      const response = await this.fetcher('/api/v1/task-events', {
        credentials: 'same-origin',
        headers: { Accept: 'text/event-stream', ...(this.lastEventId > 0 ? { 'Last-Event-ID': String(this.lastEventId) } : {}) },
        signal: controller.signal,
      })
      if (!response.ok || !response.body) throw new Error('Task event stream unavailable')
      onOpen()
      this.options.onStatus?.('connected')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const parser = new SseParser()
      while (this.active) {
        const { done, value } = await reader.read()
        if (done) return
        touch()
        for (const raw of parser.push(decoder.decode(value, { stream: true }))) await this.apply(raw)
      }
      await reader.cancel()
    } finally {
      clearTimeout(watchdog)
      if (this.controller === controller) this.controller = undefined
    }
  }

  private async apply(raw: RawSseEvent): Promise<void> {
    const type = taskEventTypeSchema.safeParse(raw.event)
    if (!type.success) return
    if (type.data === 'stream.reset') {
      const resetId = Number(raw.id)
      if (Number.isSafeInteger(resetId) && resetId >= 0) this.lastEventId = resetId
      await this.options.onEvent({ type: type.data, ...(Number.isSafeInteger(resetId) && resetId >= 0 ? { id: resetId } : {}) })
      return
    }
    const id = Number(raw.id)
    if (!Number.isSafeInteger(id) || id <= this.lastEventId || raw.data === undefined) return
    let payload: unknown
    try { payload = JSON.parse(raw.data) } catch { return }
    const data = taskEventDataSchema.safeParse(payload)
    if (!data.success) return
    this.lastEventId = id
    await this.options.onEvent({ id, type: type.data, data: data.data })
  }
}
