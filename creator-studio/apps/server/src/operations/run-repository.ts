import { and, desc, eq } from 'drizzle-orm'
import { ulid } from 'ulid'

import { idempotencyRecords, runs, taskEvents, tasks, type RunRecord, type TaskRecord } from '../db/schema.js'
import { validateJsonText } from '../repositories/json.js'
import type { DatabaseClient } from '../repositories/types.js'

export class RunNotFoundError extends Error {
  constructor(readonly runId: string) {
    super(`Run ${runId} was not found`)
    this.name = 'RunNotFoundError'
  }
}

export class RunIdempotencyKeyReusedError extends Error {
  constructor() {
    super('The idempotency key was already used for a different run request')
    this.name = 'RunIdempotencyKeyReusedError'
  }
}

export interface IdempotentRunCreate {
  idempotency: {
    id: string
    key: string
    requestHash: string
    expiresAt: number
    createdAt: number
  }
  run: typeof runs.$inferInsert
  task: typeof tasks.$inferInsert
}

export class RunRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getById(id: string): Promise<RunRecord | null> {
    return this.db.select().from(runs).where(eq(runs.id, id)).get() ?? null
  }

  async getByTaskId(taskId: string): Promise<RunRecord | null> {
    return this.db.select().from(runs).where(eq(runs.taskId, taskId)).get() ?? null
  }

  async listByProject(projectId: string, limit = 50): Promise<RunRecord[]> {
    return this.db
      .select()
      .from(runs)
      .where(eq(runs.projectId, projectId))
      .orderBy(desc(runs.createdAt), desc(runs.id))
      .limit(limit)
      .all()
  }

  createIdempotent(input: IdempotentRunCreate): { run: RunRecord; task: TaskRecord; replayed: boolean } {
    validateJsonText(input.run.inputVersionIdsJson ?? '[]', 'run.inputVersionIdsJson')
    validateJsonText(input.run.sourceArtifactIdsJson ?? '[]', 'run.sourceArtifactIdsJson')
    validateJsonText(input.run.knowledgeSourceIdsJson ?? '[]', 'run.knowledgeSourceIdsJson')
    validateJsonText(input.run.configJson ?? '{}', 'run.configJson')
    validateJsonText(input.task.inputJson ?? '{}', 'task.inputJson')

    return this.db.transaction((transaction) => {
      const existing = transaction
        .select()
        .from(idempotencyRecords)
        .where(and(
          eq(idempotencyRecords.workspaceId, input.run.workspaceId),
          eq(idempotencyRecords.key, input.idempotency.key),
        ))
        .get()

      if (existing) {
        if (existing.requestHash !== input.idempotency.requestHash) {
          throw new RunIdempotencyKeyReusedError()
        }
        const run = existing.resourceId
          ? transaction.select().from(runs).where(eq(runs.id, existing.resourceId)).get()
          : undefined
        if (!run) throw new Error('Completed run idempotency record is missing its resource')
        const task = transaction.select().from(tasks).where(eq(tasks.id, run.taskId)).get()
        if (!task) throw new Error('Completed run idempotency record is missing its task')
        return { run, task, replayed: true }
      }

      const task = transaction.insert(tasks).values(input.task).returning().get()
      transaction.insert(taskEvents).values({
        taskId: task.id,
        eventType: 'created',
        payloadJson: '{}',
        createdAt: input.task.createdAt,
      }).run()
      const run = transaction.insert(runs).values({ ...input.run, taskId: task.id }).returning().get()
      transaction.insert(idempotencyRecords).values({
        ...input.idempotency,
        workspaceId: input.run.workspaceId,
        responseStatus: 202,
        responseJson: JSON.stringify({ runId: run.id, taskId: task.id }),
        resourceType: 'run',
        resourceId: run.id,
      }).run()
      return { run, task, replayed: false }
    })
  }

  /** 任务完成后回填输出（新产出 artifact/version）。 */
  updateOutputs(runId: string, output: { outputVersionIds?: string[]; outputArtifactIds?: string[] }, now = Date.now()): RunRecord {
    const updated = this.db
      .update(runs)
      .set({
        ...(output.outputVersionIds !== undefined ? { outputVersionIdsJson: JSON.stringify(output.outputVersionIds) } : {}),
        ...(output.outputArtifactIds !== undefined ? { outputArtifactIdsJson: JSON.stringify(output.outputArtifactIds) } : {}),
        updatedAt: now,
      })
      .where(eq(runs.id, runId))
      .returning()
      .get()
    if (!updated) throw new RunNotFoundError(runId)
    return updated
  }

  newId(now: number): string { return ulid(now) }
}
