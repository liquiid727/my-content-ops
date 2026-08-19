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
    projectStates: {},
    history: [],
    redoStack: [],
    clipboard: null,
  })
}

function flowNode(overrides: { id?: string; artifactId?: string; x?: number; y?: number; kind?: string; role?: string; selected?: boolean } = {}) {
  return {
    id: overrides.id ?? '01ARZ3NDEKTSV4RRFFQ69G5F01',
    type: 'TextNode' as const,
    position: { x: overrides.x ?? 120, y: overrides.y ?? 80 },
    data: { artifactId: overrides.artifactId ?? '01ARZ3NDEKTSV4RRFFQ69G5F02', kind: overrides.kind ?? 'text', role: overrides.role ?? 'topic' },
    ...(overrides.selected ? { selected: true } : {}),
  }
}

/** 模拟服务端：nodes/edges 的内存仓库 + 画布 REST 路由。id 需满足契约的 ULID 格式。 */
function fakeUlid(seed: number): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  let value = ''
  let n = seed
  for (let i = 0; i < 26; i += 1) {
    value += alphabet[n % 32]
    n = Math.floor(n / 32)
  }
  return value
}

function makeServerMock(server: { nodes: CanvasNode[]; edges: Edge[] }) {
  let nodeSeq = 100
  let edgeSeq = 100
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = (init?.method ?? 'GET') as string
    if (/\/projects\/.+\/nodes$/.test(url) && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { kind: string; role: string; x: number; y: number }
      const id = fakeUlid(nodeSeq)
      const artifactId = fakeUlid(nodeSeq + 5000)
      nodeSeq += 1
      const artifact = { ...artifactBase(), id: artifactId, kind: body.kind, role: body.role }
      const created = { ...node(), id, artifactId, x: body.x, y: body.y }
      server.nodes.push(created)
      return json({ data: { node: created, artifact }, meta: { requestId: REQUEST_ID } }, 201)
    }
    if (/\/nodes\/[^/]+$/.test(url) && method === 'DELETE') {
      const id = url.split('/').pop()
      server.nodes = server.nodes.filter((candidate) => candidate.id !== id)
      return new Response(null, { status: 204 })
    }
    if (/\/nodes\/[^/]+$/.test(url) && method === 'PATCH') {
      const body = JSON.parse(String(init?.body)) as { x: number; y: number }
      const id = url.split('/').pop()
      const existing = server.nodes.find((candidate) => candidate.id === id)!
      const updated = { ...existing, x: body.x, y: body.y }
      server.nodes = server.nodes.map((candidate) => (candidate.id === id ? updated : candidate))
      return json({ data: updated, meta: { requestId: REQUEST_ID } })
    }
    if (url.endsWith('/edges') && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { sourceArtifactId: string; targetArtifactId: string; inputSlot: string }
      const created = { ...edge(), id: fakeUlid(edgeSeq + 9000), ...body }
      edgeSeq += 1
      server.edges.push(created)
      return json({ data: created, meta: { requestId: REQUEST_ID } }, 201)
    }
    if (/\/edges\/[^/]+$/.test(url) && method === 'DELETE') {
      const id = url.split('/').pop()
      server.edges = server.edges.filter((candidate) => candidate.id !== id)
      return new Response(null, { status: 204 })
    }
    throw new Error(`Unexpected fetch ${method} ${url}`)
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
    expect(state.nodes[0]!.width).toBe(260)
    expect(state.nodes[0]!.height).toBe(168)
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

  it('tracks selectedNodeId without rewriting node objects (React Flow owns `selected`)', () => {
    const n = node()
    useCanvasStore.setState({
      projectId: PROJECT_ID,
      nodes: [{ id: n.id, type: 'TextNode', position: { x: 0, y: 0 }, data: { artifactId: n.artifactId, kind: 'text', role: 'topic' } }],
    })
    const before = useCanvasStore.getState().nodes[0]

    useCanvasStore.getState().selectNode(n.id)

    const state = useCanvasStore.getState()
    expect(state.selectedNodeId).toBe(n.id)
    expect(state.nodes[0]).toBe(before) // 不重建 node 对象 → 避免 React Flow 选择反馈循环
  })

  it('caches per-project canvas state and restores viewport/selection on switch-back (Issue #12)', async () => {
    const PROJECT_B = '01ARZ3NDEKTSV4RRFFQ69G5FDD'
    const nodeB = node({ id: '01ARZ3NDEKTSV4RRFFQ69G5F11', artifactId: '01ARZ3NDEKTSV4RRFFQ69G5F12', projectId: PROJECT_B, x: 320, y: 200 })
    let graphACalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith(`/projects/${PROJECT_ID}/graph`)) {
        graphACalls += 1
        return json({ data: { nodes: [node()], edges: [edge()] }, meta: { requestId: REQUEST_ID } })
      }
      if (url.endsWith(`/projects/${PROJECT_B}/graph`)) {
        return json({ data: { nodes: [nodeB], edges: [] }, meta: { requestId: REQUEST_ID } })
      }
      if (url.includes('/artifacts/')) return json({ data: artifactDetail(), meta: { requestId: REQUEST_ID } })
      throw new Error(`Unexpected fetch ${url}`)
    })

    // A 首载 + 保存 viewport/selection
    await useCanvasStore.getState().loadGraph(PROJECT_ID)
    useCanvasStore.getState().setViewport({ x: 480, y: 240, zoom: 1.6 })
    useCanvasStore.getState().selectNode(node().artifactId)

    // 切到 B：画布换成 B 的节点
    await useCanvasStore.getState().loadGraph(PROJECT_B)
    expect(useCanvasStore.getState().projectId).toBe(PROJECT_B)
    expect(useCanvasStore.getState().nodes[0]!.data.artifactId).toBe(nodeB.artifactId)
    expect(useCanvasStore.getState().selectedNodeId).toBeNull()

    // 切回 A：命中缓存，不再 fetch，恢复节点/viewport/selection
    await useCanvasStore.getState().loadGraph(PROJECT_ID)
    const state = useCanvasStore.getState()
    expect(graphACalls).toBe(1) // 第二次 loadGraph(A) 走缓存
    expect(state.nodes).toHaveLength(1)
    expect(state.viewport).toEqual({ x: 480, y: 240, zoom: 1.6 })
    expect(state.selectedNodeId).toBe(node().artifactId)
  })
})

describe('undo / redo', () => {
  it('undoes and redoes a node move via PATCH', async () => {
    const n1 = node({ x: 10, y: 10 })
    const server = { nodes: [n1], edges: [] }
    makeServerMock(server)
    useCanvasStore.setState({ projectId: PROJECT_ID, nodes: [flowNode({ id: n1.id, artifactId: n1.artifactId, x: 10, y: 10 })] })

    await useCanvasStore.getState().persistNodePosition(n1.id, { x: 220, y: 140 })
    expect(useCanvasStore.getState().nodes[0]!.position).toEqual({ x: 220, y: 140 })
    expect(useCanvasStore.getState().history).toHaveLength(1)

    await useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().nodes[0]!.position).toEqual({ x: 10, y: 10 })
    expect(server.nodes[0]!.x).toBe(10)

    await useCanvasStore.getState().redo()
    expect(useCanvasStore.getState().nodes[0]!.position).toEqual({ x: 220, y: 140 })
    expect(server.nodes[0]!.x).toBe(220)
  })

  it('undoes node creation (DELETE) and redoes it (POST with fresh node)', async () => {
    const server = { nodes: [], edges: [] }
    makeServerMock(server)
    useCanvasStore.setState({ projectId: PROJECT_ID })

    await useCanvasStore.getState().createNode({ kind: 'text', role: 'topic', x: 40, y: 60 })
    expect(useCanvasStore.getState().nodes).toHaveLength(1)
    expect(useCanvasStore.getState().history).toHaveLength(1)

    await useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().nodes).toHaveLength(0)
    expect(server.nodes).toHaveLength(0)

    await useCanvasStore.getState().redo()
    expect(useCanvasStore.getState().nodes).toHaveLength(1)
    expect(server.nodes).toHaveLength(1)
  })

  it('undoes edge creation via DELETE /edges/:id and redoes it', async () => {
    const server = { nodes: [], edges: [] }
    makeServerMock(server)
    useCanvasStore.setState({ projectId: PROJECT_ID })
    const sourceArtifactId = fakeUlid(7001)
    const targetArtifactId = fakeUlid(7002)

    await useCanvasStore.getState().addEdge({ sourceArtifactId, targetArtifactId, inputSlot: 'outline' })
    expect(useCanvasStore.getState().edges).toHaveLength(1)

    await useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().edges).toHaveLength(0)
    expect(server.edges).toHaveLength(0)

    await useCanvasStore.getState().redo()
    expect(useCanvasStore.getState().edges).toHaveLength(1)
    expect(server.edges).toHaveLength(1)
  })

  it('a new mutation clears the redo stack', async () => {
    const n1 = node({ x: 10, y: 10 })
    const server = { nodes: [n1], edges: [] }
    makeServerMock(server)
    useCanvasStore.setState({ projectId: PROJECT_ID, nodes: [flowNode({ id: n1.id, artifactId: n1.artifactId, x: 10, y: 10 })] })

    await useCanvasStore.getState().persistNodePosition(n1.id, { x: 220, y: 140 })
    await useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().redoStack).toHaveLength(1)

    await useCanvasStore.getState().createNode({ kind: 'text', role: 'script', x: 8, y: 8 })
    expect(useCanvasStore.getState().redoStack).toHaveLength(0)
  })
})

describe('copy / paste / duplicate / delete sync', () => {
  it('copies selected nodes + internal edge and pastes server-backed copies as one undo step', async () => {
    const server = { nodes: [], edges: [] }
    makeServerMock(server)
    useCanvasStore.setState({
      projectId: PROJECT_ID,
      nodes: [
        flowNode({ id: 'n1', artifactId: 'art-a', x: 0, y: 0, kind: 'text', role: 'topic', selected: true }),
        flowNode({ id: 'n2', artifactId: 'art-b', x: 240, y: 0, kind: 'text', role: 'script', selected: true }),
      ],
      edges: [{ id: 'e1', source: 'art-a', target: 'art-b', label: 'outline' }],
    })

    useCanvasStore.getState().copySelection()
    expect(useCanvasStore.getState().clipboard?.nodes).toHaveLength(2)

    await useCanvasStore.getState().paste()
    const state = useCanvasStore.getState()
    expect(state.nodes).toHaveLength(4)
    expect(state.edges).toHaveLength(2)
    expect(state.nodes.filter((n) => n.selected)).toHaveLength(2)
    expect(server.nodes).toHaveLength(2)
    expect(server.edges).toHaveLength(1)
    expect(state.history).toHaveLength(1) // 批量条目

    await useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().nodes).toHaveLength(2)
    expect(useCanvasStore.getState().edges).toHaveLength(1)
    expect(server.nodes).toHaveLength(0)
    expect(server.edges).toHaveLength(0)
  })

  it('duplicates the selection with an offset without touching clipboard', async () => {
    const server = { nodes: [], edges: [] }
    makeServerMock(server)
    useCanvasStore.setState({
      projectId: PROJECT_ID,
      nodes: [flowNode({ id: 'n1', artifactId: 'art-a', x: 100, y: 100, selected: true })],
    })

    await useCanvasStore.getState().duplicateSelection()

    const state = useCanvasStore.getState()
    expect(state.nodes).toHaveLength(2)
    expect(state.clipboard).toBeNull()
    const original = state.nodes.find((n) => n.id === 'n1')!
    const copy = state.nodes.find((n) => n.id !== 'n1')!
    expect(copy.position).toEqual({ x: original.position.x + 48, y: original.position.y + 48 })
  })

  it('syncs Delete-key removals to the server and records history', async () => {
    const server = { nodes: [node({ id: 'n1', artifactId: 'art-a' })], edges: [] }
    makeServerMock(server)
    useCanvasStore.setState({ projectId: PROJECT_ID, nodes: [flowNode({ id: 'n1', artifactId: 'art-a' })] })

    useCanvasStore.getState().applyNodesChange([{ id: 'n1', type: 'remove' }])

    expect(useCanvasStore.getState().nodes).toHaveLength(0)
    expect(useCanvasStore.getState().history).toHaveLength(1)
    await vi.waitFor(() => expect(server.nodes).toHaveLength(0))
  })

  it('context-menu deleteNode removes locally, syncs, and can be undone', async () => {
    const server = { nodes: [node({ id: 'n1', artifactId: 'art-a' })], edges: [] }
    makeServerMock(server)
    useCanvasStore.setState({ projectId: PROJECT_ID, nodes: [flowNode({ id: 'n1', artifactId: 'art-a', selected: true })] })

    await useCanvasStore.getState().deleteNode('n1')

    expect(useCanvasStore.getState().nodes).toHaveLength(0)
    expect(useCanvasStore.getState().selectedNodeId).toBeNull()
    expect(server.nodes).toHaveLength(0)

    await useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().nodes).toHaveLength(1)
    expect(server.nodes).toHaveLength(1)
  })
})
