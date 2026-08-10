import type { TaskStatus } from '@creator-studio/contracts'

const transitions: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
  queued: new Set(['running', 'failed', 'cancelled']),
  running: new Set(['waiting_review', 'completed', 'failed', 'cancelled']),
  waiting_review: new Set(['completed', 'failed', 'cancelled']),
  completed: new Set(), failed: new Set(), cancelled: new Set(),
}

export class InvalidTaskTransitionError extends Error {
  constructor(readonly from: TaskStatus, readonly to: TaskStatus) { super(`Invalid Task transition: ${from} -> ${to}`); this.name = 'InvalidTaskTransitionError' }
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!transitions[from].has(to)) throw new InvalidTaskTransitionError(from, to)
}

export function isTerminalTaskStatus(status: TaskStatus): boolean { return transitions[status].size === 0 }

