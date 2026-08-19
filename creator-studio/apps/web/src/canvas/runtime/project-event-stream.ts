import { SseParser, reconnectDelay } from '../../modules/tasks/task-stream'
import { ensureTaskSession } from '../../modules/tasks/task-api'

export type ProjectEventType =
  | 'run.created' | 'run.started' | 'run.progress' | 'run.completed' | 'run.failed' | 'run.cancelled'
  | 'artifact.created' | 'artifact.updated' | 'artifact.version.created'
  | 'node.created' | 'node.updated' | 'node.deleted'
  | 'edge.created' | 'edge.deleted'
  | 'stream.reset'

export interface ProjectStreamEvent {
  id?: number
  type: ProjectEventType
  /** 服务端在 payload 上附加 projectId / occurredAt。 */
  data?: Record<string, unknown>
}

interface RawSseEvent { id?: string; event?: string; data?: string }

const PROJECT_EVENT_TYPES: ReadonlySet<string> = new Set<ProjectEventType>([
  'run.created', 'run.started', 'run.progress', 'run.completed', 'run.failed', 'run.cancelled',
  'artifact.created', 'artifact.updated', 'artifact.version.created',
  'node.created', 'node.updated', 'node.deleted',
  'edge.created', 'edge.deleted',
  'stream.reset',
])

interface ProjectEventStreamOptions {
  projectId: string
  onEvent: (event: ProjectStreamEvent) => void | Promise<void>
  beforeReconnect?: () => void | Promise<void>
  onStatus?: (status: 'connected' | 'reconnecting' | 'stopped') => void
  fetcher?: typeof fetch
  inactivityMs?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

/**
 * 订阅 `/api/v1/projects/:id/events` SSE 通道。
 * 与 Foundation TaskEventStream 同构：Last-Event-ID 游标、stream.reset、指数退避重连。
 */
export class ProjectEventStream {
  private active = false
  private controller: AbortController | undefined
  private wakeReconnect: (() => void) | undefined
  private lastEventId = 0
  private readonly fetcher: typeof fetch

  constructor(private readonly options: ProjectEventStreamOptions) {
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
  }

  async start(): Promise<void> {
    if (this.active) return
    this.active = true
    let attempt = 0
    let firstConnection = true
    while (this.active) {
      try {
        if (!firstConnection) await this.options.beforeReconnect?.()
        if (!this.active) break
        firstConnection = false
        await this.consume(() => { attempt = 0 })
        if (this.active) throw new Error('Project event stream closed')
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
    const inactivityMs = this.options.inactivityMs ?? 60_000
    let watchdog = setTimeout(() => controller.abort(), inactivityMs)
    const touch = () => {
      clearTimeout(watchdog)
      watchdog = setTimeout(() => controller.abort(), inactivityMs)
    }
    try {
      const url = `/api/v1/projects/${encodeURIComponent(this.options.projectId)}/events`
      const response = await this.fetcher(url, {
        credentials: 'same-origin',
        headers: { Accept: 'text/event-stream', ...(this.lastEventId > 0 ? { 'Last-Event-ID': String(this.lastEventId) } : {}) },
        signal: controller.signal,
      })
      if (!response.ok || !response.body) throw new Error('Project event stream unavailable')
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
    if (raw.event === undefined || !PROJECT_EVENT_TYPES.has(raw.event)) return
    const type = raw.event as ProjectEventType
    if (type === 'stream.reset') {
      const resetId = Number(raw.id)
      if (Number.isSafeInteger(resetId) && resetId >= 0) this.lastEventId = resetId
      await this.options.onEvent({ type, ...(Number.isSafeInteger(resetId) && resetId >= 0 ? { id: resetId } : {}) })
      return
    }
    const id = Number(raw.id)
    if (!Number.isSafeInteger(id) || id <= this.lastEventId || raw.data === undefined) return
    let payload: unknown
    try { payload = JSON.parse(raw.data) } catch { return }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return
    this.lastEventId = id
    await this.options.onEvent({ id, type, data: payload as Record<string, unknown> })
  }
}
