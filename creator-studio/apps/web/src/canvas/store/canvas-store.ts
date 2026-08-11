import { applyEdgeChanges, applyNodeChanges, type Edge, type Node, type NodeChange, type Viewport } from '@xyflow/react'
import { create } from 'zustand'

import { canvasApi, type ArtifactDetail, type CanvasNode } from '../api/canvas-api'

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
    data: { artifactId: node.artifactId, kind: artifact?.kind ?? '', role: artifact?.role ?? '', ...(artifact ? { artifact } : {}) },
  }
}

function toFlowEdge(edge: { id: string; sourceArtifactId: string; targetArtifactId: string; inputSlot: string }): FlowEdge {
  return { id: edge.id, source: edge.sourceArtifactId, target: edge.targetArtifactId, label: edge.inputSlot }
}

interface CanvasState {
  projectId: string | null
  nodes: FlowNode[]
  edges: FlowEdge[]
  artifacts: Record<string, ArtifactDetail>
  selectedNodeId: string | null
  viewport: Viewport
  loading: boolean
  error: string | null

  loadGraph: (projectId: string) => Promise<void>
  applyNodesChange: (changes: NodeChange<FlowNode>[]) => void
  applyEdgesChange: (changes: Parameters<typeof applyEdgeChanges>[0]) => void
  selectNode: (nodeId: string | null) => void
  setViewport: (viewport: Viewport) => void
  createNode: (input: { kind: string; role: string; x?: number; y?: number }) => Promise<void>
  persistNodePosition: (nodeId: string, position: { x: number; y: number }) => Promise<void>
  addEdge: (input: { sourceArtifactId: string; targetArtifactId: string; inputSlot: string }) => Promise<void>
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  projectId: null,
  nodes: [],
  edges: [],
  artifacts: {},
  selectedNodeId: null,
  viewport: { x: 0, y: 0, zoom: 1 },
  loading: false,
  error: null,

  async loadGraph(projectId) {
    if (get().projectId === projectId && get().nodes.length > 0 && !get().error) return
    set({ loading: true, error: null, projectId })
    try {
      const graph = (await canvasApi.graph(projectId)).data
      const artifacts = await Promise.all(
        graph.nodes.map((node) => canvasApi.artifact(node.artifactId).then((envelope) => envelope.data).catch(() => undefined)),
      )
      const artifactMap: Record<string, ArtifactDetail> = {}
      for (const artifact of artifacts) if (artifact) artifactMap[artifact.id] = artifact
      set({
        nodes: graph.nodes.map((node) => toFlowNode(node, artifactMap[node.artifactId])),
        edges: graph.edges.map(toFlowEdge),
        artifacts: artifactMap,
        selectedNodeId: null,
        loading: false,
        error: null,
      })
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) })
    }
  },

  applyNodesChange(changes) {
    const next = applyNodeChanges(changes, get().nodes)
    // 同步 selectedNodeId
    const selection = changes.find((change) => change.type === 'select')
    set({ nodes: next })
    if (selection?.type === 'select') set({ selectedNodeId: selection.selected ? selection.id : null })
  },

  applyEdgesChange(changes) {
    set({ edges: applyEdgeChanges(changes, get().edges) })
  },

  selectNode(nodeId) {
    set((state) => ({
      selectedNodeId: nodeId,
      nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, selected: true } : { ...node, selected: false })),
    }))
  },

  setViewport(viewport) {
    set({ viewport })
  },

  async createNode(input) {
    const projectId = get().projectId
    if (!projectId) return
    const created = (await canvasApi.createNode(projectId, { ...input, x: input.x ?? 120, y: input.y ?? 120 })).data
    const createdArtifact: ArtifactDetail | undefined = created.artifact ? { ...created.artifact, currentVersion: null } : undefined
    set((state) => ({
      nodes: [...state.nodes, toFlowNode(created.node, createdArtifact)],
      ...(createdArtifact ? { artifacts: { ...state.artifacts, [createdArtifact.id]: createdArtifact } } : {}),
      selectedNodeId: created.node.id,
    }))
  },

  async persistNodePosition(nodeId, position) {
    const updated = (await canvasApi.moveNode(nodeId, position)).data
    set((state) => ({
      nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, position: { x: updated.x, y: updated.y } } : node)),
    }))
  },

  async addEdge(input) {
    const edge = (await canvasApi.createEdge(input)).data
    set((state) => ({ edges: [...state.edges, toFlowEdge(edge)] }))
  },
}))
