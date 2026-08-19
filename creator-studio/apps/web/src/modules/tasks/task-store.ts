import type { Task } from '@creator-studio/contracts'
import { create } from 'zustand'
import { getLocalizedErrorMessage, i18n } from '../i18n'
import { taskApi } from './task-api'
import { TaskEventStream, type TaskStreamEvent } from './task-stream'

type ConnectionStatus = 'idle' | 'connected' | 'reconnecting' | 'stopped'

interface TaskState {
  tasks: Task[]
  loading: boolean
  error: string | undefined
  connection: ConnectionStatus
  lastEventId: number
  cancellingIds: string[]
  hasMore: boolean
  nextCursor: string | undefined
  loadingMore: boolean
  start: () => Promise<void>
  stop: () => void
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
  applyEvent: (event: TaskStreamEvent) => Promise<void>
  cancelTask: (taskId: string) => Promise<void>
}

let stream: TaskEventStream | undefined
let lifecycle = 0
let starting = false

function upsert(tasks: Task[], task: Task): Task[] {
  const next = tasks.some((item) => item.id === task.id) ? tasks.map((item) => item.id === task.id ? task : item) : [task, ...tasks]
  return next.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function message(error: unknown): string {
  return getLocalizedErrorMessage(error, i18n.t, 'tasks.loadFailed')
}

function reconcileActive(tasks: Task[], active: Task[]): Task[] {
  const terminal = tasks.filter((task) => ['completed', 'failed', 'cancelled'].includes(task.status))
  return active.reduce((snapshot, task) => upsert(snapshot, task), terminal)
}

async function loadAllActive(): Promise<Task[]> {
  const items: Task[] = []
  let cursor: string | undefined
  do {
    const response = await taskApi.list({ active: true, ...(cursor ? { cursor } : {}), limit: 100 })
    for (const task of response.data) if (!items.some((item) => item.id === task.id)) items.push(task)
    cursor = response.meta.hasMore ? response.meta.nextCursor : undefined
  } while (cursor)
  return items
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  error: undefined,
  connection: 'idle',
  lastEventId: 0,
  cancellingIds: [],
  hasMore: false,
  nextCursor: undefined,
  loadingMore: false,

  refresh: async () => {
    const response = await taskApi.list()
    set({ tasks: response.data, error: undefined, hasMore: response.meta.hasMore, nextCursor: response.meta.nextCursor })
  },

  loadMore: async () => {
    const cursor = get().nextCursor
    if (!cursor || get().loadingMore) return
    set({ loadingMore: true, error: undefined })
    try {
      const response = await taskApi.list({ cursor })
      set((state) => ({
        tasks: response.data.reduce((items, task) => upsert(items, task), state.tasks),
        hasMore: response.meta.hasMore,
        nextCursor: response.meta.nextCursor,
        loadingMore: false,
      }))
    } catch (error) {
      set({ loadingMore: false, error: message(error) })
    }
  },

  applyEvent: async (event) => {
    if (event.type === 'stream.reset') {
      const active = await loadAllActive()
      set((state) => ({ tasks: reconcileActive(state.tasks, active), lastEventId: event.id ?? state.lastEventId }))
      return
    }
    if (event.id === undefined || event.id <= get().lastEventId || event.data === undefined) return
    const response = await taskApi.get(event.data.taskId)
    set((state) => ({ tasks: upsert(state.tasks, response.data), lastEventId: event.id ?? state.lastEventId }))
  },

  cancelTask: async (taskId) => {
    if (get().cancellingIds.includes(taskId)) return
    set((state) => ({ cancellingIds: [...state.cancellingIds, taskId], error: undefined }))
    try {
      const response = await taskApi.cancel(taskId)
      set((state) => ({ tasks: upsert(state.tasks, response.data), cancellingIds: state.cancellingIds.filter((id) => id !== taskId) }))
    } catch (error) {
      set((state) => ({ cancellingIds: state.cancellingIds.filter((id) => id !== taskId), error: message(error) }))
    }
  },

  start: async () => {
    if (stream || starting) return
    starting = true
    const version = ++lifecycle
    set({ loading: true, error: undefined })
    try {
      await get().refresh()
      if (version !== lifecycle) {
        if (!starting) set({ loading: false })
        return
      }
      const nextStream = new TaskEventStream({
        onEvent: (event) => get().applyEvent(event),
        beforeReconnect: async () => {
          const active = await loadAllActive()
          set((state) => ({ tasks: reconcileActive(state.tasks, active) }))
        },
        onStatus: (connection) => { if (stream === nextStream) set({ connection }) },
      })
      stream = nextStream
      set({ loading: false })
      void stream.start()
    } catch (error) {
      if (version !== lifecycle) {
        if (!starting) set({ loading: false })
        return
      }
      stream = undefined
      set({ loading: false, error: message(error), connection: 'stopped' })
    } finally {
      if (version === lifecycle) starting = false
    }
  },

  stop: () => {
    lifecycle += 1
    starting = false
    stream?.stop()
    stream = undefined
    set({ connection: 'stopped', loading: false })
  },
}))

export const taskSelectors = {
  tasks: (state: TaskState) => state.tasks,
  loading: (state: TaskState) => state.loading,
  error: (state: TaskState) => state.error,
  connection: (state: TaskState) => state.connection,
  lastEventId: (state: TaskState) => state.lastEventId,
  cancellingIds: (state: TaskState) => state.cancellingIds,
  hasMore: (state: TaskState) => state.hasMore,
  nextCursor: (state: TaskState) => state.nextCursor,
  loadingMore: (state: TaskState) => state.loadingMore,
}

export function resetTaskStoreForTests(): void {
  lifecycle += 1
  starting = false
  stream?.stop()
  stream = undefined
  useTaskStore.setState({ tasks: [], loading: false, error: undefined, connection: 'idle', lastEventId: 0, cancellingIds: [], hasMore: false, nextCursor: undefined, loadingMore: false })
}
