import type { Artifact, ArtifactDetail, CanvasNode, Edge } from '@creator-studio/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCanvasStore } from './canvas-store'

const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAC'
const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY'

function node(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: '01ARZ3NDEKTSV4RRFFQ69G5F01',
    projectId: PROJECT_ID,
    artifactId: '01ARZ3NDEKTSV4RRFFQ69G5F02',
    x: 120,
    y: 80,
    width: null,
    height: null,
    collapsed: false,
    zIndex: 0,
    renderer: 'TextNode',
    updatedAt: '2026-08-10T09:00:00.000Z',
    ...overrides,
  }
}

function artifactBase(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: '01ARZ3NDEKTSV4RRFFQ69G5F02',
    projectId: PROJECT_ID,
    kind: 'text',
    role: 'topic',
    currentVersionId: '01ARZ3NDEKTSV4RRFFQ69G5F05',
    revision: 1,
    createdAt: '2026-08-10T09:00:00.000Z',
    updatedAt: '2026-08-10T09:00:00.000Z',
    ...overrides,
  }
}

function edge(overrides: Partial<Edge> = {}): Edge {
  return {
    id: '01ARZ3NDEKTSV4RRFFQ69G5F03',
    projectId: PROJECT_ID,
    sourceArtifactId: '01ARZ3NDEKTSV4RRFFQ69G5F02',
    targetArtifactId: '01ARZ3NDEKTSV4RRFFQ69G5F04',
    inputSlot: 'outline',
    createdAt: '2026-08-10T09:01:00.000Z',
    ...overrides,
  }
}

function artifactDetail(overrides: Partial<ArtifactDetail> = {}): ArtifactDetail {
  return {
    ...artifactBase(),
    currentVersion: {
      id: '01ARZ3NDEKTSV4RRFFQ69G5F05',
      artifactId: '01ARZ3NDEKTSV4RRFFQ69G5F02',
      versionNumber: 1,
      parentVersionId: null,
      contentRef: { type: 'inline', text: 'AI 落地选题' },
      metadata: {},
      source: 'ai',
      operationRunId: null,
      createdBy: '01ARZ3NDEKTSV4RRFFQ69G5F06',
      createdAt: '2026-08-10T09:00:00.000Z',
    },
    ...overrides,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function resetStore() {
  useCanvasStore.setState({
    projectId: null,
    nodes: [],
    edges: [],
    artifacts: {},
    selectedNodeId: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    loading: false,
    error: null,
  })
}

beforeEach(resetStore)
afterEach(() => {
  vi.restoreAllMocks()
  resetStore()
})

describe('canvas store', () => {
  it('loads a graph with nodes, edges, and hydrated artifacts', async () => {
    const n = node()
    const e = edge()
    const detail = artifactDetail()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith(`/projects/${PROJECT_ID}/graph`)) return json({ data: { nodes: [n], edges: [e] }, meta: { requestId: REQUEST_ID } })
      if (url.endsWith(`/artifacts/${n.artifactId}`)) return json({ data: detail, meta: { requestId: REQUEST_ID } })
      throw new Error(`Unexpected fetch ${url}`)
    })

    await useCanvasStore.getState().loadGraph(PROJECT_ID)

    const state = useCanvasStore.getState()
    expect(state.nodes).toHaveLength(1)
    expect(state.edges).toHaveLength(1)
    expect(state.nodes[0]!.data.artifactId).toBe(n.artifactId)
    expect(state.nodes[0]!.data.artifact?.currentVersion?.contentRef).toEqual({ type: 'inline', text: 'AI 落地选题' })
    expect(state.artifacts[n.artifactId]).toStrictEqual(detail)
    expect(state.error).toBeNull()
  })

  it('creates a node and selects it', async () => {
    const n = node({ x: 40, y: 60 })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith(`/projects/${PROJECT_ID}/nodes`) && init?.method === 'POST') {
        return json({ data: { node: n, artifact: artifactBase() }, meta: { requestId: REQUEST_ID } }, 201)
      }
      throw new Error(`Unexpected fetch ${url}`)
    })
    useCanvasStore.setState({ projectId: PROJECT_ID })

    await useCanvasStore.getState().createNode({ kind: 'text', role: 'topic', x: 40, y: 60 })

    const state = useCanvasStore.getState()
    expect(state.nodes).toHaveLength(1)
    expect(state.nodes[0]!.id).toBe(n.id)
    expect(state.nodes[0]!.position).toEqual({ x: 40, y: 60 })
    expect(state.selectedNodeId).toBe(n.id)
  })

  it('persists a dragged node position', async () => {
    const n = node({ x: 10, y: 10 })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith(`/nodes/${n.id}`) && init?.method === 'PATCH') {
        return json({ data: { ...n, x: 220, y: 140 }, meta: { requestId: REQUEST_ID } })
      }
      throw new Error(`Unexpected fetch ${url}`)
    })
    useCanvasStore.setState({ projectId: PROJECT_ID, nodes: [{ id: n.id, type: 'TextNode', position: { x: 10, y: 10 }, data: { artifactId: n.artifactId, kind: 'text', role: 'topic' } }] })

    await useCanvasStore.getState().persistNodePosition(n.id, { x: 220, y: 140 })

    expect(useCanvasStore.getState().nodes[0]!.position).toEqual({ x: 220, y: 140 })
  })

  it('adds an edge between artifacts', async () => {
    const e = edge()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/edges') && init?.method === 'POST') {
        return json({ data: e, meta: { requestId: REQUEST_ID } }, 201)
      }
      throw new Error(`Unexpected fetch ${url}`)
    })

    await useCanvasStore.getState().addEdge({ sourceArtifactId: e.sourceArtifactId, targetArtifactId: e.targetArtifactId, inputSlot: e.inputSlot })

    expect(useCanvasStore.getState().edges).toEqual([{ id: e.id, source: e.sourceArtifactId, target: e.targetArtifactId, label: e.inputSlot }])
  })

  it('selects a node and marks it in the node list', () => {
    const n = node()
    useCanvasStore.setState({
      projectId: PROJECT_ID,
      nodes: [{ id: n.id, type: 'TextNode', position: { x: 0, y: 0 }, data: { artifactId: n.artifactId, kind: 'text', role: 'topic' } }],
    })

    useCanvasStore.getState().selectNode(n.id)

    const state = useCanvasStore.getState()
    expect(state.selectedNodeId).toBe(n.id)
    expect(state.nodes[0]!.selected).toBe(true)
  })
})
