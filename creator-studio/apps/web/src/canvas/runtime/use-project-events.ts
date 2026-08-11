import { useEffect, useRef, useState } from 'react'

import { runApi } from '../api/run-api'
import { applyProjectEvent } from './apply-project-event'
import { ProjectEventStream, type ProjectStreamEvent } from './project-event-stream'
import { useRunStore } from './run-store'

export type ProjectEventsStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'stopped'

async function hydrateRuns(projectId: string): Promise<void> {
  const runs = await runApi.list(projectId).catch(() => [])
  useRunStore.getState().hydrateRuns(projectId, runs)
}

/**
 * 订阅当前 project 的 SSE 事件流：
 * - 连接前用 `GET /runs?projectId=` 水合一次 RunStore（避免漏掉连接前已进行中的 Run）；
 * - 事件经 `applyProjectEvent` 归并进 Canvas/Artifact/Run store（Canvas 节流刷新）；
 * - 断开按指数退避重连，stream.reset 触发全量重拉。
 */
export function useProjectEvents(projectId: string): ProjectEventsStatus {
  const [status, setStatus] = useState<ProjectEventsStatus>('idle')
  const streamRef = useRef<ProjectEventStream | undefined>(undefined)

  useEffect(() => {
    const current = projectId
    let mounted = true

    const start = async () => {
      useRunStore.getState().clearProject(current)
      await hydrateRuns(current)
      if (!mounted) return
      setStatus('connecting')
      const stream = new ProjectEventStream({
        projectId: current,
        onEvent: (event: ProjectStreamEvent) => applyProjectEvent(current, event),
        beforeReconnect: async () => {
          useRunStore.getState().clearProject(current)
          await hydrateRuns(current)
        },
        onStatus: (next) => {
          if (!mounted) return
          if (next === 'connected') setStatus('connected')
          else if (next === 'reconnecting') setStatus('reconnecting')
          else setStatus('stopped')
        },
      })
      streamRef.current = stream
      void stream.start()
    }
    void start()

    return () => {
      mounted = false
      streamRef.current?.stop()
      streamRef.current = undefined
      useRunStore.getState().clearProject(current)
    }
  }, [projectId])

  return status
}
