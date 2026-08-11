import { applyEdgeChanges, applyNodeChanges, type Edge, type Node, type NodeChange, type Viewport } from '@xyflow/react'
import { create } from 'zustand'

import { canvasApi, type ArtifactDetail, type CanvasNode } from '../api/canvas-api'
import { useArtifactStore } from '../artifacts/artifact-store'

export interface CanvasNodeData {
  artifactId: string
  kind: string
  role: string
  artifact?: ArtifactDetail
  [key: string]: unknown
}

export type FlowNode = Node<CanvasNodeData, 'TextNode' | 'ImageNode' | 'AudioNode' | 'VideoNode' | 'CollectionNode' | 'ActionNode'>
export type FlowEdge = Edge<Record<string, unknown>>

function rendererKey(renderer: string): FlowNode['type'] {
  const known: Record<string, FlowNode['type']> = {
    TextNode: 'TextNode', ImageNode: 'ImageNode', AudioNode: 'AudioNode',
    VideoNode: 'VideoNode', CollectionNode: 'CollectionNode', ActionNode: 'ActionNode',
  }
  return known[renderer] ?? 'TextNode'
}

function toFlowNode(node: CanvasNode, artifact?: ArtifactDetail): FlowNode {
  return {
    id: node.id,
    type: rendererKey(node.renderer),
    position: { x: node.x, y: node.y },
    // 显式给默认尺寸：React Flow `onlyRenderVisibleElements` 用节点尺寸判断视口可见性，
    // 新加入且尚未测量过的节点若为 0×0 会被当作不可见而剔除。
    width: 224,
    height: 88,
    data: { artifactId: node.artifactId, kind: artifact?.kind ?? '', role: artifact?.role ?? '', ...(artifact ? { artifact } : {}) },
  }
}

function toFlowEdge(edge: { id: string; sourceArtifactId: string; targetArtifactId: string; inputSlot: string }): FlowEdge {
  return { id: edge.id, source: edge.sourceArtifactId, target: edge.targetArtifactId, label: edge.inputSlot }
}

/** 经 ArtifactStore 取摘要（缓存优先），返回 id → detail 映射。 */
async function hydrateArtifacts(artifactIds: string[]): Promise<Record<string, ArtifactDetail>> {
  const store = useArtifactStore.getState()
  const entries = await Promise.all(
    [...new Set(artifactIds)].map(async (id) => {
      const detail = await store.getArtifact(id).catch(() => undefined)
      return [id, detail] as const
    }),
  )
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, ArtifactDetail] => entry[1] !== undefined))
}

/** 单个 project 的 Canvas 状态快照（切回时恢复 viewport/selection，不重新挂载重 Canvas）。 */
interface ProjectCanvasState {
  nodes: FlowNode[]
  edges: FlowEdge[]
  artifacts: Record<string, ArtifactDetail>
  selectedNodeId: string | null
  viewport: Viewport
}

const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }

interface CanvasState {
  projectId: string | null
  nodes: FlowNode[]
  edges: FlowEdge[]
  artifacts: Record<string, ArtifactDetail>
  selectedNodeId: string | null
  viewport: Viewport
  loading: boolean
  error: string | null
  /** 切 Project 缓存：projectId → 上次的 canvas 状态（恢复用）。 */
  projectStates: Record<string, ProjectCanvasState>

  loadGraph: (projectId: string, force?: boolean) => Promise<void>
  applyNodesChange: (changes: NodeChange<FlowNode>[]) => void
  applyEdgesChange: (changes: Parameters<typeof applyEdgeChanges>[0]) => void
  selectNode: (nodeId: string | null) => void
  setViewport: (viewport: Viewport) => void
  createNode: (input: { kind: string; role: string; x?: number; y?: number }) => Promise<void>
  persistNodePosition: (nodeId: string, position: { x: number; y: number }) => Promise<void>
  addEdge: (input: { sourceArtifactId: string; targetArtifactId: string; inputSlot: string }) => Promise<void>
}

function syncProject(state: CanvasState, patch: Partial<ProjectCanvasState>): Partial<Pick<CanvasState, 'projectStates'>> {
  const projectId = state.projectId
  if (!projectId) return {}
  return {
    projectStates: {
      ...state.projectStates,
      [projectId]: { nodes: state.nodes, edges: state.edges, artifacts: state.artifacts, selectedNodeId: state.selectedNodeId, viewport: state.viewport, ...patch },
    },
  }
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  projectId: null,
  nodes: [],
  edges: [],
  artifacts: {},
  selectedNodeId: null,
  viewport: INITIAL_VIEWPORT,
  loading: false,
  error: null,
  projectStates: {},

  async loadGraph(projectId, force = false) {
    // 切回已缓存 project：恢复上次的 nodes/edges/selection/viewport，避免重新 fetch + 重挂载。
    const cached = get().projectStates[projectId]
    if (!force && cached) {
      set({
        projectId,
        nodes: cached.nodes,
        edges: cached.edges,
        artifacts: cached.artifacts,
        selectedNodeId: cached.selectedNodeId,
        viewport: cached.viewport,
        loading: false,
        error: null,
      })
      return
    }
    // 切换 project：先清空画布，避免把上一个 project 的节点短暂渲染在 B 上。
    if (get().projectId !== projectId) set({ nodes: [], edges: [], selectedNodeId: null })
    set({ loading: true, error: null, projectId })
    try {
      const graph = (await canvasApi.graph(projectId)).data
      const artifactMap = await hydrateArtifacts(graph.nodes.map((node) => node.artifactId))
      const nodes = graph.nodes.map((node) => toFlowNode(node, artifactMap[node.artifactId]))
      const state = {
        nodes,
        edges: graph.edges.map(toFlowEdge),
        artifacts: artifactMap,
        selectedNodeId: null,
        viewport: get().viewport,
      }
      set({
        ...state,
        loading: false,
        error: null,
        projectStates: { ...get().projectStates, [projectId]: state },
      })
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) })
    }
  },

  applyNodesChange(changes) {
    const next = applyNodeChanges(changes, get().nodes)
    // 同步 selectedNodeId
    const selection = changes.find((change) => change.type === 'select')
    set((state) => ({
      nodes: next,
      ...(selection?.type === 'select' ? { selectedNodeId: selection.selected ? selection.id : null } : {}),
      ...syncProject(state, { nodes: next, ...(selection?.type === 'select' ? { selectedNodeId: selection.selected ? selection.id : null } : {}) }),
    }))
  },

  applyEdgesChange(changes) {
    const next = applyEdgeChanges(changes, get().edges)
    set((state) => ({ edges: next, ...syncProject(state, { edges: next }) }))
  },

  selectNode(nodeId) {
    // 只记录 id；节点自身的 selected 标志由 React Flow 经 applyNodesChange 维护，
    // 这里不能重建 node 对象，否则 onSelectionChange → selectNode 会无限循环（React #185）。
    set((state) => ({ selectedNodeId: nodeId, ...syncProject(state, { selectedNodeId: nodeId }) }))
  },

  setViewport(viewport) {
    set((state) => ({ viewport, ...syncProject(state, { viewport }) }))
  },

  async createNode(input) {
    const projectId = get().projectId
    if (!projectId) return
    const created = (await canvasApi.createNode(projectId, { ...input, x: input.x ?? 120, y: input.y ?? 120 })).data
    const createdArtifact: ArtifactDetail | undefined = created.artifact ? { ...created.artifact, currentVersion: null } : undefined
    if (createdArtifact) useArtifactStore.getState().setDetail(createdArtifact)
    set((state) => {
      const nodes = [...state.nodes.map((node) => (node.selected ? { ...node, selected: false } : node)), { ...toFlowNode(created.node, createdArtifact), selected: true }]
      const artifacts = createdArtifact ? { ...state.artifacts, [createdArtifact.id]: createdArtifact } : state.artifacts
      return { nodes, artifacts, selectedNodeId: created.node.id, ...syncProject(state, { nodes, artifacts, selectedNodeId: created.node.id }) }
    })
  },

  async persistNodePosition(nodeId, position) {
    const updated = (await canvasApi.moveNode(nodeId, position)).data
    set((state) => {
      const nodes = state.nodes.map((node) => (node.id === nodeId ? { ...node, position: { x: updated.x, y: updated.y } } : node))
      return { nodes, ...syncProject(state, { nodes }) }
    })
  },

  async addEdge(input) {
    const edge = (await canvasApi.createEdge(input)).data
    set((state) => {
      const edges = [...state.edges, toFlowEdge(edge)]
      return { edges, ...syncProject(state, { edges }) }
    })
  },
}))
