import { serializeIsoDateTime, taskSchema, type Task, type TaskStatus } from '@creator-studio/contracts'
import { ZodError } from 'zod'
import { ulid } from 'ulid'
import type { TaskRecord } from '../db/schema.js'
import { HttpError } from '../http/errors.js'
import { ProjectRepository, TaskRepository } from '../repositories/index.js'
import type { TaskListCursor } from '../repositories/task-repository.js'
import type { TaskHandlerRegistry } from './task-handler.js'
import type { TaskRunner } from './task-runner.js'
import { assertTaskTransition, isTerminalTaskStatus } from './task-state-machine.js'

function date(value: number | null): string | null { return value === null ? null : serializeIsoDateTime(new Date(value)) }
function mapTask(record: TaskRecord): Task {
  return taskSchema.parse({
    id: record.id, projectId: record.projectId, type: record.type, status: record.status, progress: record.progress,
    resultRef: record.resultRefType && record.resultRefId ? { type: record.resultRefType, id: record.resultRefId } : null,
    parentTaskId: record.parentTaskId, retryCount: Math.max(record.attemptCount - 1, 0),
    error: record.errorCode && record.errorMessage ? { code: record.errorCode, message: record.errorMessage } : null,
    output: record.outputJson ? JSON.parse(record.outputJson) : null,
    createdAt: date(record.createdAt), startedAt: date(record.startedAt), finishedAt: date(record.finishedAt),
  })
}

function decodeCursor(value?: string): TaskListCursor | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as TaskListCursor
    if (!Number.isSafeInteger(parsed.createdAt) || typeof parsed.id !== 'string') throw new Error('Invalid cursor')
    return parsed
  } catch {
    throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: 'Task cursor 无效。', details: { issues: [{ path: ['query', 'cursor'], code: 'invalid_format', message: 'Invalid task cursor' }] } })
  }
}

export class TaskService {
  constructor(private readonly tasks: TaskRepository, private readonly projects: ProjectRepository, private readonly handlers: TaskHandlerRegistry, private readonly runner: TaskRunner, private readonly now: () => number = Date.now) {}

  async create(identity: { workspaceId: string; creatorProfileId: string }, input: { projectId?: string | null | undefined; type: string; input: unknown }): Promise<Task> {
    const handler = this.handlers.get(input.type)
    if (!handler) throw new HttpError({ status: 422, code: 'TASK_TYPE_UNSUPPORTED', message: `未注册 Task type：${input.type}` })
    let parsed: unknown
    try { parsed = handler.parse(input.input) } catch (error) {
      if (error instanceof ZodError) throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: 'Task input 不符合 handler schema。', details: { issues: error.issues } })
      throw error
    }
    if (input.projectId && !(await this.projects.getByWorkspaceAndId(identity.workspaceId, input.projectId))) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Project 不存在。' })
    const now = this.now()
    const task = await this.tasks.enqueue({ id: ulid(now), workspaceId: identity.workspaceId, projectId: input.projectId ?? null, type: input.type, inputJson: JSON.stringify(parsed), createdBy: identity.creatorProfileId, createdAt: now, event: { payloadJson: '{}', createdAt: now } })
    this.runner.schedule()
    return mapTask(task)
  }

  async get(workspaceId: string, id: string): Promise<Task> {
    const task = await this.tasks.getByWorkspaceAndId(workspaceId, id)
    if (!task) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Task 不存在。' })
    return mapTask(task)
  }

  async list(workspaceId: string, query: { active?: boolean | undefined; projectId?: string | undefined; type?: string | undefined; cursor?: string | undefined; limit: number }) {
    const page = await this.tasks.list({ workspaceId, ...query, cursor: decodeCursor(query.cursor) })
    const last = page.items.at(-1)
    return {
      items: page.items.map(mapTask),
      hasMore: page.hasMore,
      nextCursor: page.hasMore && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString('base64url') : undefined,
    }
  }

  async cancel(workspaceId: string, id: string): Promise<Task> {
    const current = await this.tasks.getByWorkspaceAndId(workspaceId, id)
    if (!current) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Task 不存在。' })
    if (isTerminalTaskStatus(current.status as TaskStatus)) throw new HttpError({ status: 409, code: 'TASK_ALREADY_FINISHED', message: '终态 Task 不能取消。' })
    assertTaskTransition(current.status as TaskStatus, 'cancelled')
    const now = this.now()
    const cancelled = await this.tasks.transition({ taskId: id, expectedStatus: current.status, status: 'cancelled', progress: current.progress, eventType: 'cancelled', payloadJson: '{}', finishedAt: now, updatedAt: now })
    this.runner.cancelRunning(id)
    return mapTask(cancelled)
  }
}
