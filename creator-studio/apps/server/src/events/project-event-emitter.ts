import { ProjectEventRepository } from './project-event-repository.js'

/** 操作运行时把 run/artifact/node/edge 事件写入 project_events，供 SSE 订阅。 */
export class ProjectEventEmitter {
  constructor(private readonly events: ProjectEventRepository, private readonly now: () => number = Date.now) {}

  emit(workspaceId: string, projectId: string, eventType: string, payload: unknown): number {
    return this.events.append({ workspaceId, projectId, eventType, payload, createdAt: this.now() }).id
  }
}
