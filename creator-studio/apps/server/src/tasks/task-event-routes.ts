import { idSchema } from '@creator-studio/contracts'
import { streamSSE } from 'hono/streaming'
import type { Hono } from 'hono'
import { HttpError } from '../http/errors.js'
import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import type { TaskRepository } from '../repositories/index.js'

function publicEvent(type: string): string {
  if (type === 'created') return 'task.created'
  if (type === 'completed') return 'task.completed'
  if (type === 'failed') return 'task.failed'
  if (type === 'cancelled') return 'task.cancelled'
  return 'task.updated'
}

function eventStatus(type: string, currentStatus: string): string {
  if (type === 'created') return 'queued'
  if (type === 'started') return 'running'
  if (type === 'waiting_review') return 'waiting_review'
  if (type === 'completed') return 'completed'
  if (type === 'failed') return 'failed'
  if (type === 'cancelled') return 'cancelled'
  return currentStatus
}

function parseCursor(value: string | undefined): number {
  if (value === undefined || value === '') return 0
  const cursor = Number(value)
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: 'Last-Event-ID 必须是非负整数。' })
  }
  return cursor
}

interface TaskEventRouteOptions {
  heartbeatMs?: number
  pollMs?: number
  onConnectionChange?: (activeConnections: number) => void
}

export function configureTaskEventRoutes(app: Hono<HttpBindings>, tasks: TaskRepository, options: TaskEventRouteOptions = {}): void {
  const heartbeatMs = options.heartbeatMs ?? 15_000
  const pollMs = options.pollMs ?? 250
  let activeConnections = 0
  app.get('/task-events', (context) => {
    const projectId = context.req.query('projectId') ? parseWithSchema(idSchema, context.req.query('projectId')) : undefined
    const headerCursor = context.req.header('Last-Event-ID')
    let cursor = parseCursor(headerCursor ?? context.req.query('lastEventId'))
    return streamSSE(context, async (stream) => {
      activeConnections += 1
      options.onConnectionChange?.(activeConnections)
      let lastHeartbeat = Date.now()
      try {
        if (cursor > 0 && !await tasks.workspaceEventIdExists(context.get('workspaceId'), cursor)) {
          cursor = await tasks.latestWorkspaceEventId(context.get('workspaceId'))
          await stream.writeSSE({ id: String(cursor), event: 'stream.reset', data: JSON.stringify({ reason: 'cursor_unavailable' }) })
          lastHeartbeat = Date.now()
        }
        while (!stream.aborted) {
          const events = await tasks.listWorkspaceEventsAfter(context.get('workspaceId'), cursor, projectId)
          for (const event of events) {
            await stream.writeSSE({ id: String(event.id), event: publicEvent(event.eventType), data: JSON.stringify({ taskId: event.taskId, projectId: event.projectId, status: eventStatus(event.eventType, event.status), progress: event.progress, occurredAt: new Date(event.createdAt).toISOString() }) })
            cursor = event.id
            lastHeartbeat = Date.now()
          }
          if (Date.now() - lastHeartbeat >= heartbeatMs) { await stream.write(': heartbeat\n\n'); lastHeartbeat = Date.now() }
          await stream.sleep(pollMs)
        }
      } finally {
        activeConnections -= 1
        options.onConnectionChange?.(activeConnections)
      }
    })
  })
}
