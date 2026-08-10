import { createHash } from 'node:crypto'
import { ulid } from 'ulid'
import { GenerationRepository, TaskRepository } from '../repositories/index.js'
import { assertTaskTransition } from './task-state-machine.js'
import type { TaskHandlerRegistry } from './task-handler.js'

export class TaskRunner {
  private draining = false
  private readonly controllers = new Map<string, AbortController>()
  constructor(private readonly tasks: TaskRepository, private readonly generations: GenerationRepository, private readonly handlers: TaskHandlerRegistry, private readonly now: () => number = Date.now) {}

  schedule(): void { queueMicrotask(() => { void this.drain() }) }
  cancelRunning(taskId: string): void { this.controllers.get(taskId)?.abort(new Error('Task cancelled')) }

  async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      let task = await this.tasks.claimNext(this.now())
      while (task) {
        const controller = new AbortController()
        this.controllers.set(task.id, controller)
        try {
          const handler = this.handlers.require(task.type)
          const input = handler.parse(JSON.parse(task.inputJson))
          const result = await handler.execute(input, controller.signal)
          const finishedAt = this.now()
          this.generations.completeTask({
            generation: {
              id: ulid(finishedAt), workspaceId: task.workspaceId, projectId: task.projectId, taskId: task.id,
              providerKey: result.providerKey, model: result.model,
              requestJson: JSON.stringify({ ...result.requestSnapshot as object, sha256: createHash('sha256').update(task.inputJson).digest('hex') }),
              responseJson: JSON.stringify(result.responseSnapshot), usageJson: JSON.stringify(result.usage), status: 'completed', createdAt: task.startedAt ?? finishedAt, finishedAt,
            },
            taskId: task.id, outputJson: JSON.stringify(result.output), finishedAt,
          })
        } catch (error) {
          const current = await this.tasks.getByWorkspaceAndId(task.workspaceId, task.id)
          if (current?.status === 'running') {
            assertTaskTransition('running', 'failed')
            const failedAt = this.now()
            try {
              await this.tasks.transition({ taskId: task.id, expectedStatus: 'running', status: 'failed', progress: current.progress, eventType: 'failed', payloadJson: '{}', errorCode: 'TASK_HANDLER_FAILED', errorMessage: 'Task handler execution failed.', finishedAt: failedAt, updatedAt: failedAt })
            } catch {
              const raced = await this.tasks.getByWorkspaceAndId(task.workspaceId, task.id)
              if (raced?.status === 'running') throw error
            }
          }
        } finally { this.controllers.delete(task.id) }
        task = await this.tasks.claimNext(this.now())
      }
    } finally { this.draining = false }
  }
}
