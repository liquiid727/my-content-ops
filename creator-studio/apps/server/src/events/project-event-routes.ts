import { idSchema } from '@creator-studio/contracts'
import { streamSSE } from 'hono/streaming'
import type { Hono } from 'hono'

import { HttpError } from '../http/errors.js'
import type { HttpBindings } from '../http/types.js'
import { parseWithSchema } from '../http/validation.js'
import { ProjectRepository } from '../repositories/project-repository.js'
import { ProjectEventRepository } from './project-event-repository.js'

interface ProjectEventRouteOptions {
  heartbeatMs?: number
  pollMs?: number
}

function parseCursor(value: string | undefined): number {
  if (value === undefined || value === '') return 0
  const cursor = Number(value)
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: 'Last-Event-ID 必须是非负整数。' })
  }
  return cursor
}

export function configureProjectEventRoutes(
  app: Hono<HttpBindings>,
  events: ProjectEventRepository,
  projects: ProjectRepository,
  options: ProjectEventRouteOptions = {},
): void {
  const heartbeatMs = options.heartbeatMs ?? 15_000
  const pollMs = options.pollMs ?? 250

  app.get('/projects/:projectId/events', async (context) => {
    const projectId = parseWithSchema(idSchema, context.req.param('projectId'))
    const workspaceId = context.get('workspaceId')
    const project = await projects.getByWorkspaceAndId(workspaceId, projectId)
    if (!project) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Project 不存在。' })

    const headerCursor = context.req.header('Last-Event-ID')
    let cursor = parseCursor(headerCursor ?? context.req.query('lastEventId'))
    return streamSSE(context, async (stream) => {
      let lastHeartbeat = Date.now()
      try {
        if (cursor > 0 && !events.exists(workspaceId, projectId, cursor)) {
          cursor = events.latestId(workspaceId, projectId)
          await stream.writeSSE({ id: String(cursor), event: 'stream.reset', data: JSON.stringify({ reason: 'cursor_unavailable' }) })
          lastHeartbeat = Date.now()
        }
        while (!stream.aborted) {
          const records = events.listAfter(workspaceId, projectId, cursor)
          for (const record of records) {
            const payload = JSON.parse(record.payloadJson) as unknown
            await stream.writeSSE({
              id: String(record.id),
              event: record.eventType,
              data: JSON.stringify({ ...(payload as object), projectId, occurredAt: new Date(record.createdAt).toISOString() }),
            })
            cursor = record.id
            lastHeartbeat = Date.now()
          }
          if (Date.now() - lastHeartbeat >= heartbeatMs) { await stream.write(': heartbeat\n\n'); lastHeartbeat = Date.now() }
          await stream.sleep(pollMs)
        }
      } finally {
        // stream closed
      }
    })
  })
}
