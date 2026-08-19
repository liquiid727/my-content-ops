import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useArtifactStore } from '../artifacts/artifact-store'
import { useCanvasStore } from '../store/canvas-store'
import { applyProjectEvent, clearGraphRefreshTimer } from './apply-project-event'
import { useRunStore } from './run-store'

const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAC'
const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY'
const ARTIFACT_ID = '01ARZ3NDEKTSV4RRFFQ69G5F02'
const NODE_ID = '01ARZ3NDEKTSV4RRFFQ69G5F01'

function graphBody() {
  return {
    data: {
      nodes: [{ id: NODE_ID, projectId: PROJECT_ID, artifactId: ARTIFACT_ID, x: 10, y: 20, width: null, height: null, collapsed: false, zIndex: 0, renderer: 'TextNode', updatedAt: '2026-08-10T09:00:00.000Z' }],
      edges: [],
    },
    meta: { requestId: REQUEST_ID },
  }
}

function artifactBody(text: string) {
  return {
    data: {
      id: ARTIFACT_ID,
      projectId: PROJECT_ID,
      kind: 'text',
      role: 'topic',
      currentVersionId: '01ARZ3NDEKTSV4RRFFQ69G5F05',
      revision: 2,
      createdAt: '2026-08-10T09:00:00.000Z',
      updatedAt: '2026-08-10T09:01:00.000Z',
      currentVersion: {
        id: '01ARZ3NDEKTSV4RRFFQ69G5F05',
        artifactId: ARTIFACT_ID,
        versionNumber: 2,
        parentVersionId: null,
        contentRef: { type: 'inline', text },
        metadata: {},
        source: 'ai',
        operationRunId: null,
        createdBy: '01ARZ3NDEKTSV4RRFFQ69G5F06',
        createdAt: '2026-08-10T09:01:00.000Z',
      },
    },
    meta: { requestId: REQUEST_ID },
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function resetStores() {
  useCanvasStore.setState({ projectId: null, nodes: [], edges: [], artifacts: {}, selectedNodeId: null, viewport: { x: 0, y: 0, zoom: 1 }, loading: false, error: null })
  useArtifactStore.setState({ byId: {}, versions: {}, loading: {} })
  useRunStore.setState({ byId: {}, activeByProject: {} })
}

beforeEach(() => {
  resetStores()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  clearGraphRefreshTimer()
  vi.restoreAllMocks()
  resetStores()
})

describe('applyProjectEvent', () => {
  it('forwards run events to the run store', async () => {
    const runId = '01ARZ3NDEKTSV4RRFFQ69G5F10'
    await applyProjectEvent(PROJECT_ID, { type: 'run.created', data: { runId, operationId: 'generate_outline', projectId: PROJECT_ID } })
    await applyProjectEvent(PROJECT_ID, { type: 'run.started', data: { runId, operationId: 'generate_outline', projectId: PROJECT_ID } })
    await applyProjectEvent(PROJECT_ID, { type: 'run.completed', data: { runId, operationId: 'generate_outline', output: '大纲', projectId: PROJECT_ID } })

    const run = useRunStore.getState().byId[runId]!
    expect(run.status).toBe('completed')
    expect(run.output).toBe('大纲')
    expect(useRunStore.getState().activeByProject[PROJECT_ID]).toEqual([])
  })

  it('invalidates artifact cache and refreshes node preview on version.created', async () => {
    useCanvasStore.setState({
      projectId: PROJECT_ID,
      nodes: [{ id: NODE_ID, type: 'TextNode', position: { x: 0, y: 0 }, data: { artifactId: ARTIFACT_ID, kind: 'text', role: 'topic' } }],
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith(`/artifacts/${ARTIFACT_ID}`)) return json(artifactBody('新内容'))
      throw new Error(`Unexpected fetch ${url}`)
    })

    await applyProjectEvent(PROJECT_ID, { type: 'artifact.version.created', data: { runId: 'r1', artifactId: ARTIFACT_ID, versionId: 'v2', projectId: PROJECT_ID } })

    const node = useCanvasStore.getState().nodes[0]!
    const ref = node.data.artifact?.currentVersion?.contentRef
    expect(ref).toEqual({ type: 'inline', text: '新内容' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throttles structural node/edge events into a single graph refetch', async () => {
    useCanvasStore.setState({ projectId: PROJECT_ID })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith(`/projects/${PROJECT_ID}/graph`)) return json(graphBody())
      if (url.endsWith(`/artifacts/${ARTIFACT_ID}`)) return json(artifactBody('大纲'))
      throw new Error(`Unexpected fetch ${url}`)
    })

    await applyProjectEvent(PROJECT_ID, { type: 'node.created', data: { runId: 'r1', artifactId: ARTIFACT_ID, nodeId: NODE_ID, projectId: PROJECT_ID } })
    await applyProjectEvent(PROJECT_ID, { type: 'edge.created', data: { runId: 'r1', sourceArtifactId: ARTIFACT_ID, targetArtifactId: ARTIFACT_ID, edgeId: 'e1', projectId: PROJECT_ID } })
    expect(fetchMock).not.toHaveBeenCalled()

    await vi.runAllTimersAsync()

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith(`/projects/${PROJECT_ID}/graph`))).toHaveLength(1)
    expect(useCanvasStore.getState().nodes).toHaveLength(1)
  })

  it('refetches the graph on stream.reset', async () => {
    useCanvasStore.setState({ projectId: PROJECT_ID })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith(`/projects/${PROJECT_ID}/graph`)) return json(graphBody())
      if (url.endsWith(`/artifacts/${ARTIFACT_ID}`)) return json(artifactBody('大纲'))
      throw new Error(`Unexpected fetch ${url}`)
    })

    await applyProjectEvent(PROJECT_ID, { type: 'stream.reset', data: { reason: 'cursor_unavailable' } })

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith(`/projects/${PROJECT_ID}/graph`))).toHaveLength(1)
    expect(useCanvasStore.getState().nodes).toHaveLength(1)
  })
})
