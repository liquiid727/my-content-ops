import { and, asc, eq, gt, lt } from 'drizzle-orm'

import { projectEvents, type ProjectEventRecord } from '../db/schema.js'
import { validateJsonText } from '../repositories/json.js'
import type { DatabaseClient } from '../repositories/types.js'

export interface ProjectEventInput {
  workspaceId: string
  projectId: string
  eventType: string
  payload: unknown
  createdAt: number
}

export class ProjectEventRepository {
  constructor(private readonly db: DatabaseClient) {}

  append(input: ProjectEventInput): ProjectEventRecord {
    const payloadJson = JSON.stringify(input.payload)
    validateJsonText(payloadJson, 'projectEvent.payloadJson')
    return this.db.insert(projectEvents).values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      eventType: input.eventType,
      payloadJson,
      createdAt: input.createdAt,
    }).returning().get()
  }

  listAfter(workspaceId: string, projectId: string, eventId: number): ProjectEventRecord[] {
    return this.db
      .select()
      .from(projectEvents)
      .where(and(
        eq(projectEvents.workspaceId, workspaceId),
        eq(projectEvents.projectId, projectId),
        gt(projectEvents.id, eventId),
      ))
      .orderBy(asc(projectEvents.id))
      .all()
  }

  exists(workspaceId: string, projectId: string, eventId: number): boolean {
    return this.db
      .select({ id: projectEvents.id })
      .from(projectEvents)
      .where(and(
        eq(projectEvents.workspaceId, workspaceId),
        eq(projectEvents.projectId, projectId),
        eq(projectEvents.id, eventId),
      ))
      .limit(1)
      .get() !== undefined
  }

  latestId(workspaceId: string, projectId: string): number {
    return this.db
      .select({ id: projectEvents.id })
      .from(projectEvents)
      .where(and(eq(projectEvents.workspaceId, workspaceId), eq(projectEvents.projectId, projectId)))
      .orderBy(projectEvents.id)
      .all()
      .at(-1)?.id ?? 0
  }

  deleteBefore(workspaceId: string, cutoff: number): number {
    return this.db
      .delete(projectEvents)
      .where(and(
        eq(projectEvents.workspaceId, workspaceId),
        lt(projectEvents.createdAt, cutoff),
      ))
      .run().changes
  }
}
