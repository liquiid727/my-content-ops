import { useArtifactStore } from '../artifacts/artifact-store'
import { useCanvasStore } from '../store/canvas-store'
import type { ProjectStreamEvent } from './project-event-stream'
import { useRunStore, type RunEventType } from './run-store'

/** 画布结构变化（node/edge）的节流刷新窗口：文本生成不按 token 刷 Node，完成后一次刷新。 */
const GRAPH_REFRESH_THROTTLE_MS = 500

let graphRefreshTimer: ReturnType<typeof setTimeout> | undefined

/** node/edge 结构事件 → 节流重拉 graph，避免逐事件刷新。 */
export function scheduleGraphRefresh(projectId: string): void {
  if (graphRefreshTimer) clearTimeout(graphRefreshTimer)
  graphRefreshTimer = setTimeout(() => {
    graphRefreshTimer = undefined
    void useCanvasStore.getState().loadGraph(projectId, true)
  }, GRAPH_REFRESH_THROTTLE_MS)
}

async function refreshNodeArtifact(artifactId: string): Promise<void> {
  const canvas = useCanvasStore.getState()
  const affected = canvas.nodes.filter((node) => node.data.artifactId === artifactId)
  if (affected.length === 0) return
  const detail = await useArtifactStore.getState().refreshArtifact(artifactId).catch(() => null)
  if (!detail) return
  useCanvasStore.setState((state) => ({
    nodes: state.nodes.map((node) => (node.data.artifactId === artifactId ? { ...node, data: { ...node.data, artifact: detail, kind: detail.kind, role: detail.role } } : node)),
    artifacts: { ...state.artifacts, [artifactId]: detail },
  }))
}

/**
 * 把一个 SSE 项目事件应用到 Canvas/Artifact/Run 三个 store。
 * run.* → RunStore；artifact.* → ArtifactStore 失效 + 节点 preview 刷新；
 * node/edge.* → 节流重拉 graph；stream.reset → 全量重拉。
 */
export async function applyProjectEvent(projectId: string, event: ProjectStreamEvent): Promise<void> {
  const data = event.data ?? {}
  switch (event.type) {
    case 'run.created':
    case 'run.started':
    case 'run.progress':
    case 'run.completed':
    case 'run.failed':
    case 'run.cancelled':
      useRunStore.getState().applyRunEvent(event.type as RunEventType, data)
      return
    case 'artifact.created': {
      const artifactId = data.artifactId !== undefined ? String(data.artifactId) : undefined
      if (artifactId) useArtifactStore.getState().invalidate(artifactId)
      return
    }
    case 'artifact.version.created':
    case 'artifact.updated': {
      const artifactId = data.artifactId !== undefined ? String(data.artifactId) : undefined
      if (!artifactId) return
      useArtifactStore.getState().invalidate(artifactId)
      await refreshNodeArtifact(artifactId)
      return
    }
    case 'node.created':
    case 'node.updated':
    case 'node.deleted':
    case 'edge.created':
    case 'edge.deleted':
      scheduleGraphRefresh(projectId)
      return
    case 'stream.reset':
      await useCanvasStore.getState().loadGraph(projectId, true)
      return
  }
}

/** 便于测试：清掉节流定时器。 */
export function clearGraphRefreshTimer(): void {
  if (graphRefreshTimer) {
    clearTimeout(graphRefreshTimer)
    graphRefreshTimer = undefined
  }
}
