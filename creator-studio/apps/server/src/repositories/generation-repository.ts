import { and, eq } from 'drizzle-orm'
import { generations, taskEvents, tasks, type GenerationRecord, type TaskRecord } from '../db/schema.js'
import { validateJsonText, validateOptionalJsonText } from './json.js'
import type { DatabaseClient } from './types.js'

export class GenerationRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getByTaskId(taskId: string): Promise<GenerationRecord | null> {
    return this.db.select().from(generations).where(eq(generations.taskId, taskId)).get() ?? null
  }

  completeTask(input: { generation: typeof generations.$inferInsert; taskId: string; outputJson: string; finishedAt: number }): { generation: GenerationRecord; task: TaskRecord } {
    validateJsonText(input.generation.requestJson, 'generation.requestJson')
    validateOptionalJsonText(input.generation.responseJson, 'generation.responseJson')
    validateOptionalJsonText(input.generation.usageJson, 'generation.usageJson')
    validateJsonText(input.outputJson, 'task.outputJson')
    return this.db.transaction((transaction) => {
      const generation = transaction.insert(generations).values(input.generation).returning().get()
      const task = transaction.update(tasks).set({
        status: 'completed', progress: 100, outputJson: input.outputJson, resultRefType: 'generation', resultRefId: generation.id,
        finishedAt: input.finishedAt, updatedAt: input.finishedAt,
      }).where(and(eq(tasks.id, input.taskId), eq(tasks.status, 'running'))).returning().get()
      if (!task) throw new Error(`Task ${input.taskId} is no longer running`)
      transaction.insert(taskEvents).values({ taskId: input.taskId, eventType: 'completed', payloadJson: JSON.stringify({ resultRefType: 'generation', resultRefId: generation.id }), createdAt: input.finishedAt }).run()
      return { generation, task }
    })
  }
}
