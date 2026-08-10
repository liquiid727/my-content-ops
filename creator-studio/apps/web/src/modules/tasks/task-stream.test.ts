// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTaskApiSessionForTests } from './task-api'
import { reconnectDelay, SseParser, TaskEventStream } from './task-stream'
import { resetTaskStoreForTests, useTaskStore } from './task-store'

const TASK_A = '01ARZ3NDEKTSV4RRFFQ69G5FAC'
const TASK_B = '01ARZ3NDEKTSV4RRFFQ69G5FAD'
const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY'

function sse(id: number, taskId: string): string {
  return `id: ${id}\nevent: task.updated\ndata: {"taskId":"${taskId}","projectId":null,"status":"running","progress":${id},"occurredAt":"2026-08-09T09:00:00.000Z"}\n\n`
}

function eventResponse(text: string): Response {
  const bytes = new TextEncoder().encode(text)
  return new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function bootstrap() {
  return { data: { workspace: { id: '01ARZ3NDEKTSV4RRFFQ69G5FAA', name: 'Studio' }, creatorProfile: { id: '01ARZ3NDEKTSV4RRFFQ69G5FAB', displayName: 'Creator', preferences: { theme: 'dark', locale: 'zh-CN' } }, activeTasks: [], capabilities: { connectors: false, providers: false }, settings: { providers: [], connectors: [] } }, meta: { requestId: REQUEST_ID } }
}

function task(id: string, createdAt: string) {
  return { id, projectId: null, type: 'seed_generation', status: 'completed', progress: 100, resultRef: null, parentTaskId: null, retryCount: 0, error: null, output: null, createdAt, startedAt: createdAt, finishedAt: createdAt }
}

beforeEach(() => {
  resetTaskApiSessionForTests()
  resetTaskStoreForTests()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(bootstrap()))
})

afterEach(() => {
  resetTaskStoreForTests()
  vi.restoreAllMocks()
})

describe('Task event stream client', () => {
  it('parses fragmented SSE blocks while ignoring heartbeat comments', () => {
    const parser = new SseParser()
    expect(parser.push(': heart')).toEqual([])
    expect(parser.push('beat\n\nid: 7\nevent: task.updated\ndata: one\ndata: two\n\n')).toEqual([{ id: '7', event: 'task.updated', data: 'one\ntwo' }])
  })

  it('uses capped exponential reconnect delays', () => {
    expect([1, 2, 3, 8].map((attempt) => reconnectDelay(attempt, 500, 4_000))).toEqual([500, 1_000, 2_000, 4_000])
  })

  it('reconnects with Last-Event-ID, snapshots first, and ignores duplicate IDs', async () => {
    const headers: Array<string | null> = []
    const received: number[] = []
    let fetchCount = 0
    const fetcher: typeof fetch = async (_input, init) => {
      headers.push(new Headers(init?.headers).get('Last-Event-ID'))
      fetchCount += 1
      return fetchCount === 1 ? eventResponse(sse(1, TASK_A)) : eventResponse(`${sse(1, TASK_A)}${sse(2, TASK_B)}`)
    }
    let snapshots = 0
    const stream = new TaskEventStream({
      fetcher,
      baseDelayMs: 1,
      maxDelayMs: 2,
      beforeReconnect: () => { snapshots += 1 },
      onEvent: (event) => {
        if (event.id) received.push(event.id)
        if (event.id === 2) stream.stop()
      },
    })
    await stream.start()
    expect(headers).toEqual([null, '1'])
    expect(snapshots).toBe(1)
    expect(received).toEqual([1, 2])
  })

  it('treats inactivity as disconnection and stops the terminal connection cleanly', async () => {
    let aborted = false
    let reconnects = 0
    const fetcher: typeof fetch = async (_input, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () => { aborted = true; controller.error(new DOMException('aborted', 'AbortError')) }, { once: true })
      },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    const stream = new TaskEventStream({
      fetcher,
      inactivityMs: 5,
      baseDelayMs: 1,
      maxDelayMs: 1,
      onEvent: () => undefined,
      beforeReconnect: () => { reconnects += 1; stream.stop() },
    })
    await stream.start()
    expect(aborted).toBe(true)
    expect(reconnects).toBe(1)
  })

  it('adopts a stream.reset cursor before reconnecting', async () => {
    const headers: Array<string | null> = []
    let calls = 0
    const stream = new TaskEventStream({
      baseDelayMs: 1,
      maxDelayMs: 1,
      beforeReconnect: () => undefined,
      fetcher: async (_input, init) => {
        headers.push(new Headers(init?.headers).get('Last-Event-ID'))
        calls += 1
        return calls === 1
          ? eventResponse('id: 7\nevent: stream.reset\ndata: {"reason":"cursor_unavailable"}\n\n')
          : eventResponse(sse(8, TASK_A))
      },
      onEvent: (event) => { if (event.id === 8) stream.stop() },
    })
    await stream.start()
    expect(headers).toEqual([null, '7'])
  })

  it('loads the REST snapshot before opening the first subscription', async () => {
    const calls: string[] = []
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/bootstrap')) return json(bootstrap())
      if (url.endsWith('/tasks')) return json({ data: [], meta: { requestId: REQUEST_ID, hasMore: false } })
      if (url.endsWith('/task-events')) return new Response(new ReadableStream({ start(controller) { streamController = controller } }), { status: 200 })
      throw new Error(`Unexpected request: ${url}`)
    })
    await useTaskStore.getState().start()
    await vi.waitFor(() => expect(calls).toContain('/api/v1/task-events'))
    expect(calls.indexOf('/api/v1/tasks')).toBeLessThan(calls.indexOf('/api/v1/task-events'))
    useTaskStore.getState().stop()
    streamController?.close()
  })

  it('appends a cursor page without hiding or duplicating Task history', async () => {
    const calls: string[] = []
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/bootstrap')) return json(bootstrap())
      if (url.endsWith('/tasks')) return json({ data: [task(TASK_A, '2026-08-09T09:00:02.000Z')], meta: { requestId: REQUEST_ID, hasMore: true, nextCursor: 'next-page' } })
      if (url.includes('/tasks?')) {
        expect(new URL(url, 'http://local.test').searchParams.get('cursor')).toBe('next-page')
        return json({ data: [task(TASK_B, '2026-08-09T09:00:01.000Z')], meta: { requestId: REQUEST_ID, hasMore: false } })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    await useTaskStore.getState().refresh()
    await useTaskStore.getState().loadMore()

    expect(calls.filter((url) => url.includes('/tasks'))).toHaveLength(2)
    expect(useTaskStore.getState().tasks.map((item) => item.id)).toEqual([TASK_A, TASK_B])
    expect(useTaskStore.getState()).toMatchObject({ hasMore: false, nextCursor: undefined, loadingMore: false })
  })

  it('single-flights startup and clears loading when a pending snapshot is cancelled', async () => {
    let releaseSnapshot!: () => void
    const snapshotGate = new Promise<void>((resolve) => { releaseSnapshot = resolve })
    let taskRequests = 0
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/bootstrap')) return json(bootstrap())
      if (url.endsWith('/tasks')) {
        taskRequests += 1
        await snapshotGate
        return json({ data: [], meta: { requestId: REQUEST_ID, hasMore: false } })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const first = useTaskStore.getState().start()
    const second = useTaskStore.getState().start()
    await vi.waitFor(() => expect(taskRequests).toBe(1))
    expect(useTaskStore.getState().loading).toBe(true)
    useTaskStore.getState().stop()
    expect(useTaskStore.getState().loading).toBe(false)
    releaseSnapshot()
    await Promise.all([first, second])
    expect(taskRequests).toBe(1)
    expect(useTaskStore.getState().loading).toBe(false)
  })
})
