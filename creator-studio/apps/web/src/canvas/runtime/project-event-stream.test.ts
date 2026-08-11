// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTaskApiSessionForTests } from '../../modules/tasks/task-api'
import { ProjectEventStream, type ProjectStreamEvent } from './project-event-stream'

const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAC'
const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY'

function sse(id: number, event: string, data: string): string {
  return `id: ${id}\nevent: ${event}\ndata: ${data}\n\n`
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

function runCreated(id: number, runId: string): string {
  return sse(id, 'run.created', JSON.stringify({ runId, operationId: 'generate_outline', projectId: PROJECT_ID }))
}

beforeEach(() => {
  resetTaskApiSessionForTests()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(bootstrap()))
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('Project event stream client', () => {
  it('connects to the project events URL and forwards run events', async () => {
    const urls: string[] = []
    const received: ProjectStreamEvent[] = []
    const fetcher: typeof fetch = async (input) => {
      urls.push(String(input))
      return eventResponse(runCreated(1, 'run_1'))
    }
    const stream = new ProjectEventStream({
      projectId: PROJECT_ID,
      fetcher,
      onEvent: (event) => { received.push(event); stream.stop() },
    })
    await stream.start()
    expect(urls).toContain(`/api/v1/projects/${PROJECT_ID}/events`)
    expect(received[0]).toMatchObject({ id: 1, type: 'run.created', data: { runId: 'run_1', projectId: PROJECT_ID } })
  })

  it('ignores non-canvas event types and malformed payloads', async () => {
    const received: ProjectStreamEvent[] = []
    const fetcher: typeof fetch = async () => eventResponse(
      'id: 1\nevent: task.updated\ndata: {"taskId":"t1"}\n\n' +
      'id: 2\nevent: run.created\ndata: not-json\n\n' +
      'id: 3\nevent: run.created\ndata: "string"\n\n',
    )
    const stream = new ProjectEventStream({
      projectId: PROJECT_ID,
      fetcher,
      baseDelayMs: 1,
      maxDelayMs: 1,
      onEvent: (event) => { received.push(event) },
    })
    const stopTimer = setTimeout(() => stream.stop(), 10)
    await stream.start()
    clearTimeout(stopTimer)
    expect(received).toEqual([])
  })

  it('reconnects with Last-Event-ID and dedupes already-seen ids', async () => {
    const headers: Array<string | null> = []
    const received: number[] = []
    let fetchCount = 0
    const fetcher: typeof fetch = async (_input, init) => {
      headers.push(new Headers(init?.headers).get('Last-Event-ID'))
      fetchCount += 1
      return fetchCount === 1 ? eventResponse(runCreated(1, 'run_1')) : eventResponse(`${runCreated(1, 'run_1')}${runCreated(2, 'run_2')}`)
    }
    const stream = new ProjectEventStream({
      projectId: PROJECT_ID,
      fetcher,
      baseDelayMs: 1,
      maxDelayMs: 2,
      beforeReconnect: () => undefined,
      onEvent: (event) => {
        if (event.id) received.push(event.id)
        if (event.id === 2) stream.stop()
      },
    })
    await stream.start()
    expect(headers).toEqual([null, '1'])
    expect(received).toEqual([1, 2])
  })

  it('adopts a stream.reset cursor before reconnecting', async () => {
    const headers: Array<string | null> = []
    let calls = 0
    const stream = new ProjectEventStream({
      projectId: PROJECT_ID,
      baseDelayMs: 1,
      maxDelayMs: 1,
      beforeReconnect: () => undefined,
      fetcher: async (_input, init) => {
        headers.push(new Headers(init?.headers).get('Last-Event-ID'))
        calls += 1
        return calls === 1
          ? eventResponse('id: 7\nevent: stream.reset\ndata: {"reason":"cursor_unavailable"}\n\n')
          : eventResponse(runCreated(8, 'run_8'))
      },
      onEvent: (event) => { if (event.id === 8) stream.stop() },
    })
    await stream.start()
    expect(headers).toEqual([null, '7'])
  })
})
