import { and, asc, desc, eq, gt, inArray, lt, or } from 'drizzle-orm'

import { taskEvents, tasks, type TaskEventRecord, type TaskRecord } from '../db/schema.js'
import { validateJsonText, validateOptionalJsonText } from './json.js'
import type { DatabaseClient } from './types.js'

type TaskEventType = TaskEventRecord['eventType']

export interface NewTaskInput extends Omit<typeof tasks.$inferInsert, 'status' | 'progress' | 'updatedAt'> {
  status?: 'queued'
  progress?: number
  updatedAt?: number
  event: {
    payloadJson: string
    createdAt: number
  }
}

export interface TaskTransition {
  taskId: string
  status: TaskRecord['status']
  progress: number
  eventType: TaskEventType
  payloadJson: string
  updatedAt: number
  startedAt?: number | null
  finishedAt?: number | null
  outputJson?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  resultRefType?: string | null
  resultRefId?: string | null
  expectedStatus?: TaskRecord['status']
}

export interface TaskListCursor { createdAt: number; id: string }
export interface TaskListQuery { workspaceId: string; active?: boolean | undefined; projectId?: string | undefined; type?: string | undefined; cursor?: TaskListCursor | undefined; limit?: number | undefined }
export interface WorkspaceTaskEvent { id: number; taskId: string; projectId: string | null; eventType: TaskEventType; status: TaskRecord['status']; progress: number; createdAt: number }

export class TaskRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getByWorkspaceAndId(workspaceId: string, id: string): Promise<TaskRecord | null> {
    return this.db.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id))).get() ?? null
  }

  async list(query: TaskListQuery): Promise<{ items: TaskRecord[]; hasMore: boolean }> {
    const limit = Math.min(Math.max(query.limit ?? 30, 1), 100)
    const rows = this.db.select().from(tasks).where(and(
      eq(tasks.workspaceId, query.workspaceId),
      query.active === undefined
        ? undefined
        : inArray(tasks.status, query.active ? ['queued', 'running', 'waiting_review'] : ['completed', 'failed', 'cancelled']),
      query.projectId ? eq(tasks.projectId, query.projectId) : undefined,
      query.type ? eq(tasks.type, query.type) : undefined,
      query.cursor ? or(lt(tasks.createdAt, query.cursor.createdAt), and(eq(tasks.createdAt, query.cursor.createdAt), lt(tasks.id, query.cursor.id))) : undefined,
    )).orderBy(desc(tasks.createdAt), desc(tasks.id)).limit(limit + 1).all()
    return { items: rows.slice(0, limit), hasMore: rows.length > limit }
  }

  async enqueue(input: NewTaskInput): Promise<TaskRecord> {
    const { event, ...task } = input
    validateJsonText(task.inputJson, 'task.inputJson')
    validateJsonText(event.payloadJson, 'taskEvent.payloadJson')
    return this.db.transaction((transaction) => {
      const record = transaction
        .insert(tasks)
        .values({ ...task, status: 'queued', progress: task.progress ?? 0, updatedAt: task.updatedAt ?? task.createdAt })
        .returning()
        .get()
      transaction.insert(taskEvents).values({ taskId: record.id, eventType: 'created', ...event }).run()
      return record
    })
  }

  async listActiveByWorkspace(workspaceId: string): Promise<TaskRecord[]> {
    return this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), inArray(tasks.status, ['queued', 'running', 'waiting_review'])))
      .orderBy(asc(tasks.createdAt), asc(tasks.id))
      .all()
  }

  async listActiveByProject(projectId: string, limit = 5): Promise<TaskRecord[]> {
    return this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), inArray(tasks.status, ['queued', 'running', 'waiting_review'])))
      .orderBy(desc(tasks.updatedAt), desc(tasks.id))
      .limit(limit)
      .all()
  }

  async claimNext(now = Date.now()): Promise<TaskRecord | null> {
    return this.db.transaction((transaction) => {
      const queued = transaction
        .select()
        .from(tasks)
        .where(eq(tasks.status, 'queued'))
        .orderBy(asc(tasks.createdAt), asc(tasks.id))
        .limit(1)
        .get()
      if (!queued) return null

      const claimed = transaction
        .update(tasks)
        .set({ status: 'running', startedAt: now, updatedAt: now, attemptCount: queued.attemptCount + 1 })
        .where(and(eq(tasks.id, queued.id), eq(tasks.status, 'queued')))
        .returning()
        .get()
      if (!claimed) return null

      transaction.insert(taskEvents).values({ taskId: claimed.id, eventType: 'started', payloadJson: '{}', createdAt: now }).run()
      return claimed
    })
  }

  async transition(input: TaskTransition): Promise<TaskRecord> {
    validateOptionalJsonText(input.outputJson, 'task.outputJson')
    validateJsonText(input.payloadJson, 'taskEvent.payloadJson')
    return this.db.transaction((transaction) => {
      const task = transaction
        .update(tasks)
        .set({
          status: input.status,
          progress: input.progress,
          updatedAt: input.updatedAt,
          ...(input.startedAt === undefined ? {} : { startedAt: input.startedAt }),
          ...(input.finishedAt === undefined ? {} : { finishedAt: input.finishedAt }),
          ...(input.outputJson === undefined ? {} : { outputJson: input.outputJson }),
          ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
          ...(input.errorMessage === undefined ? {} : { errorMessage: input.errorMessage }),
          ...(input.resultRefType === undefined ? {} : { resultRefType: input.resultRefType }),
          ...(input.resultRefId === undefined ? {} : { resultRefId: input.resultRefId }),
        })
        .where(and(eq(tasks.id, input.taskId), input.expectedStatus ? eq(tasks.status, input.expectedStatus) : undefined))
        .returning()
        .get()

      if (!task) throw new Error(`Task ${input.taskId} state changed before transition`)
      transaction.insert(taskEvents).values({
        taskId: input.taskId,
        eventType: input.eventType,
        payloadJson: input.payloadJson,
        createdAt: input.updatedAt,
      }).run()
      return task
    })
  }

  async appendEvent(input: typeof taskEvents.$inferInsert): Promise<TaskEventRecord> {
    validateJsonText(input.payloadJson, 'taskEvent.payloadJson')
    return this.db.insert(taskEvents).values(input).returning().get()
  }

  async listEventsAfter(taskId: string, eventId: number): Promise<TaskEventRecord[]> {
    return this.db
      .select()
      .from(taskEvents)
      .where(and(eq(taskEvents.taskId, taskId), gt(taskEvents.id, eventId)))
      .orderBy(asc(taskEvents.id))
      .all()
  }

  async listWorkspaceEventsAfter(workspaceId: string, eventId: number, projectId?: string): Promise<WorkspaceTaskEvent[]> {
    return this.db.select({ id: taskEvents.id, taskId: taskEvents.taskId, projectId: tasks.projectId, eventType: taskEvents.eventType, status: tasks.status, progress: tasks.progress, createdAt: taskEvents.createdAt })
      .from(taskEvents).innerJoin(tasks, eq(taskEvents.taskId, tasks.id)).where(and(eq(tasks.workspaceId, workspaceId), gt(taskEvents.id, eventId), projectId ? eq(tasks.projectId, projectId) : undefined)).orderBy(asc(taskEvents.id)).all()
  }

  async workspaceEventIdExists(workspaceId: string, eventId: number): Promise<boolean> {
    return this.db.select({ id: taskEvents.id }).from(taskEvents).innerJoin(tasks, eq(taskEvents.taskId, tasks.id))
      .where(and(eq(tasks.workspaceId, workspaceId), eq(taskEvents.id, eventId))).limit(1).get() !== undefined
  }

  async latestWorkspaceEventId(workspaceId: string): Promise<number> {
    return this.db.select({ id: taskEvents.id }).from(taskEvents).innerJoin(tasks, eq(taskEvents.taskId, tasks.id))
      .where(eq(tasks.workspaceId, workspaceId)).orderBy(desc(taskEvents.id)).limit(1).get()?.id ?? 0
  }

  async deleteWorkspaceEventsBefore(workspaceId: string, cutoff: number): Promise<number> {
    return this.db.delete(taskEvents).where(and(
      lt(taskEvents.createdAt, cutoff),
      inArray(taskEvents.taskId, this.db.select({ id: tasks.id }).from(tasks).where(eq(tasks.workspaceId, workspaceId))),
    )).run().changes
  }

  async recoverRunning(taskId: string, recoverable: boolean, now: number): Promise<TaskRecord | null> {
    return this.db.transaction((transaction) => {
      const task = transaction.update(tasks).set(recoverable
        ? { status: 'queued', startedAt: null, updatedAt: now }
        : { status: 'failed', errorCode: 'TASK_RECOVERY_UNSUPPORTED', errorMessage: 'Task cannot be recovered after restart.', finishedAt: now, updatedAt: now })
        .where(and(eq(tasks.id, taskId), eq(tasks.status, 'running'))).returning().get()
      if (!task) return null
      transaction.insert(taskEvents).values({ taskId, eventType: recoverable ? 'progress' : 'failed', payloadJson: JSON.stringify({ recovery: recoverable ? 'requeued' : 'failed' }), createdAt: now }).run()
      return task
    })
  }
}
