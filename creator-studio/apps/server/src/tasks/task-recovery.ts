import { TaskRepository } from '../repositories/index.js'
import type { TaskHandlerRegistry } from './task-handler.js'

export class TaskRecovery {
  constructor(private readonly tasks: TaskRepository, private readonly handlers: TaskHandlerRegistry, private readonly now: () => number = Date.now) {}
  async recover(workspaceId: string): Promise<{ requeued: number; failed: number }> {
    const running = (await this.tasks.listActiveByWorkspace(workspaceId)).filter((task) => task.status === 'running')
    let requeued = 0; let failed = 0
    for (const task of running) {
      const recoverable = this.handlers.get(task.type)?.recoverable === true
      const result = await this.tasks.recoverRunning(task.id, recoverable, this.now())
      if (result) { if (recoverable) requeued += 1; else failed += 1 }
    }
    return { requeued, failed }
  }
}
