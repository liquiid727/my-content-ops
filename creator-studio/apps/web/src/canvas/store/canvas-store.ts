import { applyEdgeChanges, applyNodeChanges, type Edge, type Node, type NodeChange, type Viewport, type XYPosition } from '@xyflow/react'
import { create } from 'zustand'

import { canvasApi, type ArtifactDetail, type CanvasNode } from '../api/canvas-api'
import { workflowApi } from '../../workflow/workflow-api'
import type { GraphCommand, RecipeCapability, WorkflowSnapshot } from '@creator-studio/contracts'
import { useArtifactStore } from '../artifacts/artifact-store'
import { NODE_DEFAULT_SIZE } from '../nodes/node-role'

export interface CanvasNodeData {
  artifactId: string
  kind: string
  role: string
  artifact?: ArtifactDetail
  subjectType?: 'artifact' | 'recipe'
  recipeId?: string
  capabilityId?: string
  title?: string
  description?: string
  inputPorts?: RecipeCapability['inputPorts']
  outputPorts?: RecipeCapability['outputPorts']
  [key: string]: unknown
}

export type FlowNode = Node<CanvasNodeData, 'TextNode' | 'ImageNode' | 'AudioNode' | 'VideoNode' | 'CollectionNode' | 'ActionNode' | 'RecipeNode'>
export type FlowEdge = Edge<Record<string, unknown>>

/**
 * 历史栈条目。undo/redo 与服务端对齐（moveNode/deleteNode/createNode/createEdge/deleteEdge）。
 * 已知取舍：node-create 的 redo 与 node-delete 的 undo 走 `createNode` 重建节点 —— 服务端生成新 id 与空 artifact，
 * 原内容已被标记 orphan，不会恢复（地基阶段接受该不完美）。
 */
export type CanvasHistoryEntry =
  | { type: 'node-create'; node: FlowNode }
  | { type: 'node-delete'; node: FlowNode }
  | { type: 'node-move'; nodeId: string; from: XYPosition; to: XYPosition }
  | { type: 'edge-create'; edge: FlowEdge }
  | { type: 'edge-delete'; edge: FlowEdge }
  | { type: 'batch'; entries: CanvasHistoryEntry[] }

interface ClipboardNodeRef {
  kind: string
  role: string
  position: XYPosition
}

interface ClipboardEdgeRef {
  sourceIndex: number
  targetIndex: number
  inputSlot: string
}

interface ClipboardPayload {
  nodes: ClipboardNodeRef[]
  edges: ClipboardEdgeRef[]
}

function rendererKey(renderer: string): FlowNode['type'] {
  const known: Record<string, FlowNode['type']> = {
    TextNode: 'TextNode', ImageNode: 'ImageNode', AudioNode: 'AudioNode',
    VideoNode: 'VideoNode', CollectionNode: 'CollectionNode', ActionNode: 'ActionNode',
    RecipeNode: 'RecipeNode',
  }
  return known[renderer] ?? 'TextNode'
}

function toFlowNode(node: CanvasNode, artifact?: ArtifactDetail): FlowNode {
  const type = rendererKey(node.renderer)
  const size = NODE_DEFAULT_SIZE[type] ?? { width: 260, height: 168 }
  return {
    id: node.id,
    type,
    position: { x: node.x, y: node.y },
    width: node.width ?? size.width,
    height: node.height ?? size.height,
    data: { artifactId: node.artifactId, kind: artifact?.kind ?? '', role: artifact?.role ?? '', ...(artifact ? { artifact } : {}) },
  }
}

function toFlowEdge(edge: { id: string; sourceArtifactId: string; targetArtifactId: string; inputSlot: string }): FlowEdge {
  return { id: edge.id, source: edge.sourceArtifactId, target: edge.targetArtifactId, label: edge.inputSlot }
}

/** FlowEdge.label 类型是 ReactNode，但业务上始终是我们写入的 inputSlot 字符串。 */
function edgeInputSlot(edge: FlowEdge): string {
  return edge.label ? String(edge.label) : ''
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
  workflowRevision: number
  capabilities: RecipeCapability[]
  /** 切 Project 缓存：projectId → 上次的 canvas 状态（恢复用）。 */
  projectStates: Record<string, ProjectCanvasState>
  /** undo 栈（后进先出）与 redo 栈。 */
  history: CanvasHistoryEntry[]
  redoStack: CanvasHistoryEntry[]
  /** 复制暂存：节点定义 + 内部边（边按选中节点下标存储，粘贴时映射到新 artifact）。 */
  clipboard: ClipboardPayload | null

  loadGraph: (projectId: string, force?: boolean) => Promise<void>
  applyNodesChange: (changes: NodeChange<FlowNode>[]) => void
  applyEdgesChange: (changes: Parameters<typeof applyEdgeChanges>[0]) => void
  selectNode: (nodeId: string | null) => void
  setViewport: (viewport: Viewport) => void
  createNode: (input: { kind: string; role: string; x?: number; y?: number }) => Promise<void>
  persistNodePosition: (nodeId: string, position: { x: number; y: number }) => Promise<void>
  addEdge: (input: { sourceArtifactId: string; targetArtifactId: string; inputSlot: string }) => Promise<void>
  deleteNode: (nodeId: string) => Promise<void>
  deleteEdge: (edgeId: string) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  copySelection: () => void
  paste: () => Promise<void>
  duplicateSelection: () => Promise<void>
  createRecipeNode: (input: { capabilityId: RecipeCapability['id']; title: string; config?: Record<string, unknown>; x?: number; y?: number }) => Promise<void>
  applyWorkflowCommands: (commands: GraphCommand[]) => Promise<void>
  createExecutionPlan: (recipeNodeIds: string[]) => Promise<string>
}

async function toWorkflowState(snapshot: WorkflowSnapshot, capabilities: RecipeCapability[]) {
  const artifacts = await hydrateArtifacts(snapshot.nodes.flatMap((node) => node.subjectType === 'artifact' ? [node.artifactId] : []))
  const recipeById = new Map(snapshot.recipes.map((recipe) => [recipe.id, recipe]))
  const capabilityById = new Map(capabilities.map((capability) => [capability.id, capability]))
  const nodes: FlowNode[] = snapshot.nodes.map((node) => {
    if (node.subjectType === 'artifact') return toFlowNode({ id: node.id, projectId: node.projectId, artifactId: node.artifactId, x: node.x, y: node.y, width: node.width, height: node.height, collapsed: node.collapsed, zIndex: node.zIndex, renderer: node.renderer, updatedAt: node.updatedAt }, artifacts[node.artifactId])
    const recipe = recipeById.get(node.recipeId)!
    const capability = capabilityById.get(recipe.capabilityId)
    const size = NODE_DEFAULT_SIZE.RecipeNode ?? { width: 208, height: 108 }
    return { id: node.id, type: 'RecipeNode', position: { x: node.x, y: node.y }, width: node.width ?? size.width, height: node.height ?? size.height, data: { artifactId: '', kind: 'recipe', role: recipe.capabilityId, subjectType: 'recipe', recipeId: recipe.id, capabilityId: recipe.capabilityId, title: recipe.title, ...(capability ? { description: capability.description } : {}), inputPorts: capability?.inputPorts ?? [], outputPorts: capability?.outputPorts ?? [] } }
  })
  const edges: FlowEdge[] = snapshot.connections.map((edge) => ({ id: edge.id, source: edge.sourceNodeId, sourceHandle: edge.sourcePort, target: edge.targetNodeId, targetHandle: edge.targetPort, label: edge.targetPort }))
  return { nodes, edges, artifacts }
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

export const useCanvasStore = create<CanvasState>((set, get) => {
  const HISTORY_LIMIT = 100

  const pushHistory = (entry: CanvasHistoryEntry) => {
    const { history } = get()
    set({ history: [...history, entry].slice(-HISTORY_LIMIT), redoStack: [] })
  }

  // --- 内部原语：只改 store，不记历史（undo/redo 重放时复用，避免重放再产生历史） ---

  async function applyCreateNode(input: { kind: string; role: string; x?: number; y?: number }): Promise<FlowNode> {
    const projectId = get().projectId
    if (!projectId) throw new Error('No active project')
    const created = (await canvasApi.createNode(projectId, { ...input, x: input.x ?? 120, y: input.y ?? 120 })).data
    const artifact: ArtifactDetail | undefined = created.artifact ? { ...created.artifact, currentVersion: null } : undefined
    if (artifact) useArtifactStore.getState().setDetail(artifact)
    const flowNode = toFlowNode(created.node, artifact)
    set((state) => {
      const nodes = [...state.nodes, flowNode]
      const artifacts = artifact ? { ...state.artifacts, [artifact.id]: artifact } : state.artifacts
      return { nodes, artifacts, ...syncProject(state, { nodes, artifacts }) }
    })
    return flowNode
  }

  async function applyDeleteNodes(nodeIds: string[]): Promise<void> {
    if (nodeIds.length === 0) return
    const projectId = get().projectId
    const workflowMode = projectId !== null && get().capabilities.length > 0
    let workflowRevision = get().workflowRevision
    if (workflowMode) {
      const snapshot = await workflowApi.commands(projectId, workflowRevision, nodeIds.map((nodeId) => ({ type: 'remove_node', nodeId })))
      workflowRevision = snapshot.revision
    } else {
      await Promise.all(nodeIds.map((nodeId) => canvasApi.deleteNode(nodeId).catch(() => undefined)))
    }
    const removedIds = new Set(nodeIds)
    set((state) => {
      const nodes = state.nodes.filter((node) => !removedIds.has(node.id))
      const edges = state.edges.filter((edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target))
      const selectedNodeId = state.selectedNodeId !== null && removedIds.has(state.selectedNodeId) ? null : state.selectedNodeId
      return { nodes, edges, selectedNodeId, workflowRevision, ...syncProject(state, { nodes, edges, selectedNodeId }) }
    })
  }

  async function applyDeleteNode(nodeId: string): Promise<void> {
    await applyDeleteNodes([nodeId])
  }

  async function applyMoveNode(nodeId: string, position: XYPosition): Promise<void> {
    const projectId = get().projectId
    const workflowMode = projectId !== null && get().capabilities.length > 0
    let updated = position
    let workflowRevision = get().workflowRevision
    if (workflowMode) {
      const snapshot = await workflowApi.commands(projectId, workflowRevision, [{ type: 'move_node', nodeId, position }])
      workflowRevision = snapshot.revision
    } else {
      const legacyNode = (await canvasApi.moveNode(nodeId, position)).data
      updated = { x: legacyNode.x, y: legacyNode.y }
    }
    set((state) => {
      const nodes = state.nodes.map((node) => (node.id === nodeId ? { ...node, position: { x: updated.x, y: updated.y } } : node))
      return { nodes, workflowRevision, ...syncProject(state, { nodes }) }
    })
  }

  async function applyCreateEdge(input: { sourceArtifactId: string; targetArtifactId: string; inputSlot: string }): Promise<FlowEdge> {
    const edge = (await canvasApi.createEdge(input)).data
    const flowEdge = toFlowEdge(edge)
    set((state) => {
      const edges = [...state.edges, flowEdge]
      return { edges, ...syncProject(state, { edges }) }
    })
    return flowEdge
  }

  async function applyDeleteEdges(edgeIds: string[]): Promise<void> {
    if (edgeIds.length === 0) return
    const projectId = get().projectId
    const workflowMode = projectId !== null && get().capabilities.length > 0
    let workflowRevision = get().workflowRevision
    if (workflowMode) {
      const snapshot = await workflowApi.commands(projectId, workflowRevision, edgeIds.map((connectionId) => ({ type: 'disconnect_nodes', connectionId })))
      workflowRevision = snapshot.revision
    } else {
      await Promise.all(edgeIds.map((edgeId) => canvasApi.deleteEdge(edgeId).catch(() => undefined)))
    }
    const removedIds = new Set(edgeIds)
    set((state) => {
      const edges = state.edges.filter((edge) => !removedIds.has(edge.id))
      return { edges, workflowRevision, ...syncProject(state, { edges }) }
    })
  }

  async function applyDeleteEdge(edgeId: string): Promise<void> {
    await applyDeleteEdges([edgeId])
  }

  // --- 历史重放：batch 在 undo 时逆序执行，redo 时正序 ---

  async function replay(entry: CanvasHistoryEntry, direction: 'undo' | 'redo'): Promise<void> {
    if (entry.type === 'batch') {
      const entries = direction === 'undo' ? [...entry.entries].reverse() : entry.entries
      for (const sub of entries) await replay(sub, direction)
      return
    }
    switch (entry.type) {
      case 'node-create':
        if (direction === 'undo') await applyDeleteNode(entry.node.id)
        else await applyCreateNode({ kind: entry.node.data.kind, role: entry.node.data.role, ...entry.node.position })
        break
      case 'node-delete':
        if (direction === 'undo') await applyCreateNode({ kind: entry.node.data.kind, role: entry.node.data.role, ...entry.node.position })
        else await applyDeleteNode(entry.node.id)
        break
      case 'node-move':
        await applyMoveNode(entry.nodeId, direction === 'undo' ? entry.from : entry.to)
        break
      case 'edge-create':
        if (direction === 'undo') await applyDeleteEdge(entry.edge.id)
        else await applyCreateEdge({ sourceArtifactId: entry.edge.source, targetArtifactId: entry.edge.target, inputSlot: edgeInputSlot(entry.edge) })
        break
      case 'edge-delete':
        if (direction === 'undo') await applyCreateEdge({ sourceArtifactId: entry.edge.source, targetArtifactId: entry.edge.target, inputSlot: edgeInputSlot(entry.edge) })
        else await applyDeleteEdge(entry.edge.id)
        break
    }
  }

  // --- 复制 / 粘贴共享逻辑 ---

  function buildPayload(nodes: FlowNode[], edges: FlowEdge[]): ClipboardPayload {
    // 边以 artifactId 相连，而节点以 id 区分 —— 内部边筛选要用 artifactId 集合。
    const selectedArtifactIds = new Set(nodes.map((node) => node.data.artifactId))
    const internalEdges = edges.filter((edge) => selectedArtifactIds.has(edge.source) && selectedArtifactIds.has(edge.target))
    const indexByArtifact = new Map<string, number>()
    nodes.forEach((node, index) => indexByArtifact.set(node.data.artifactId, index))
    return {
      nodes: nodes.map((node) => ({ kind: node.data.kind, role: node.data.role, position: { ...node.position } })),
      edges: internalEdges.map((edge) => ({
        sourceIndex: indexByArtifact.get(edge.source) ?? 0,
        targetIndex: indexByArtifact.get(edge.target) ?? 0,
        inputSlot: edgeInputSlot(edge),
      })),
    }
  }

  async function pastePayload(payload: ClipboardPayload, offset: number): Promise<void> {
    const projectId = get().projectId
    if (!projectId || payload.nodes.length === 0) return
    const created: FlowNode[] = []
    for (const item of payload.nodes) {
      created.push(await applyCreateNode({ kind: item.kind, role: item.role, x: item.position.x + offset, y: item.position.y + offset }))
    }
    const artifactByIndex = new Map<number, string>()
    payload.nodes.forEach((_, index) => artifactByIndex.set(index, created[index]!.data.artifactId))

    const entries: CanvasHistoryEntry[] = created.map((node) => ({ type: 'node-create', node }))
    for (const edgeRef of payload.edges) {
      const sourceArtifactId = artifactByIndex.get(edgeRef.sourceIndex)
      const targetArtifactId = artifactByIndex.get(edgeRef.targetIndex)
      if (!sourceArtifactId || !targetArtifactId) continue
      const edge = await applyCreateEdge({ sourceArtifactId, targetArtifactId, inputSlot: edgeRef.inputSlot })
      entries.push({ type: 'edge-create', edge })
    }
    pushHistory({ type: 'batch', entries })

    const pastedIds = new Set(created.map((node) => node.id))
    set((state) => {
      const nodes = state.nodes.map((node) =>
        pastedIds.has(node.id) ? { ...node, selected: true } : node.selected ? { ...node, selected: false } : node,
      )
      return { nodes, selectedNodeId: created[0]!.id, ...syncProject(state, { nodes, selectedNodeId: created[0]!.id }) }
    })
  }

  return {
    projectId: null,
    nodes: [],
    edges: [],
    artifacts: {},
    selectedNodeId: null,
    viewport: INITIAL_VIEWPORT,
    loading: false,
    error: null,
    workflowRevision: 1,
    capabilities: [],
    projectStates: {},
    history: [],
    redoStack: [],
    clipboard: null,

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
        let mapped: { nodes: FlowNode[]; edges: FlowEdge[]; artifacts: Record<string, ArtifactDetail> }
        let capabilities: RecipeCapability[] = []
        let revision = 1
        try {
          const snapshot = await workflowApi.snapshot(projectId)
          capabilities = await workflowApi.capabilities()
          mapped = await toWorkflowState(snapshot, capabilities)
          revision = snapshot.revision
        } catch {
          // One compatibility cycle: Foundation mocks/servers can still serve the legacy graph.
          const graph = (await canvasApi.graph(projectId)).data
          const artifactMap = await hydrateArtifacts(graph.nodes.map((node) => node.artifactId))
          mapped = { nodes: graph.nodes.map((node) => toFlowNode(node, artifactMap[node.artifactId])), edges: graph.edges.map(toFlowEdge), artifacts: artifactMap }
        }
        const state = {
          nodes: mapped.nodes,
          edges: mapped.edges,
          artifacts: mapped.artifacts,
          selectedNodeId: null,
          viewport: get().viewport,
        }
        set({
          ...state,
          loading: false,
          error: null,
          workflowRevision: revision,
          capabilities,
          projectStates: { ...get().projectStates, [projectId]: state },
        })
      } catch (error) {
        set({ loading: false, error: error instanceof Error ? error.message : String(error) })
      }
    },

    applyNodesChange(changes) {
      const prev = get().nodes
      const next = applyNodeChanges(changes, prev)
      // Delete 键（或受控删除）→ 服务端同步 + 记历史。单个删除记单条，多选删除记 batch。
      const removed = changes.filter((change) => change.type === 'remove')
      const removedIds = new Set(removed.map((change) => change.id))
      const removedNodes = removed
        .map((change) => prev.find((node) => node.id === change.id))
        .filter((node): node is FlowNode => node !== undefined)
      if (removedNodes.length > 0) {
        const entries: CanvasHistoryEntry[] = removedNodes.map((node) => ({ type: 'node-delete', node }))
        void applyDeleteNodes(removedNodes.map((node) => node.id)).catch((error) => {
          set({ error: error instanceof Error ? error.message : String(error) })
          const projectId = get().projectId
          if (projectId) void get().loadGraph(projectId, true)
        })
        pushHistory(entries.length === 1 ? entries[0]! : { type: 'batch', entries })
      }
      const selection = changes.find((change) => change.type === 'select')
      set((state) => {
        const selectedNodeId = selection?.type === 'select'
          ? selection.selected ? selection.id : null
          : state.selectedNodeId !== null && removedIds.has(state.selectedNodeId) ? null : state.selectedNodeId
        return {
          nodes: next,
          selectedNodeId,
          ...syncProject(state, { nodes: next, selectedNodeId }),
        }
      })
    },

    applyEdgesChange(changes) {
      const prev = get().edges
      const next = applyEdgeChanges(changes, prev)
      // 边删除（选中边按 Delete）→ 服务端同步 + 记历史，与节点删除对称。
      const removedEdges = changes
        .filter((change) => change.type === 'remove')
        .map((change) => prev.find((edge) => edge.id === change.id))
        .filter((edge): edge is FlowEdge => edge !== undefined)
      if (removedEdges.length > 0) {
        const entries: CanvasHistoryEntry[] = removedEdges.map((edge) => ({ type: 'edge-delete', edge }))
        void applyDeleteEdges(removedEdges.map((edge) => edge.id)).catch((error) => {
          set({ error: error instanceof Error ? error.message : String(error) })
          const projectId = get().projectId
          if (projectId) void get().loadGraph(projectId, true)
        })
        pushHistory(entries.length === 1 ? entries[0]! : { type: 'batch', entries })
      }
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
      const flowNode = await applyCreateNode(input)
      pushHistory({ type: 'node-create', node: flowNode })
      set((state) => {
        const nodes = state.nodes.map((node) =>
          node.id === flowNode.id ? { ...node, selected: true } : node.selected ? { ...node, selected: false } : node,
        )
        return { nodes, selectedNodeId: flowNode.id, ...syncProject(state, { nodes, selectedNodeId: flowNode.id }) }
      })
    },

    async persistNodePosition(nodeId, position) {
      const current = get().nodes.find((node) => node.id === nodeId)?.position
      const projectId = get().projectId
      if (!projectId) return
      try {
        const snapshot = await workflowApi.commands(projectId, get().workflowRevision, [{ type: 'move_node', nodeId, position }])
        set({ workflowRevision: snapshot.revision })
      } catch {
        await applyMoveNode(nodeId, position)
      }
      if (current) pushHistory({ type: 'node-move', nodeId, from: current, to: position })
    },

    async addEdge(input) {
      const edge = await applyCreateEdge(input)
      pushHistory({ type: 'edge-create', edge })
    },

    async deleteNode(nodeId) {
      const node = get().nodes.find((candidate) => candidate.id === nodeId)
      if (!node) return
      await applyDeleteNode(nodeId)
      pushHistory({ type: 'node-delete', node })
    },

    async deleteEdge(edgeId) {
      const edge = get().edges.find((candidate) => candidate.id === edgeId)
      if (!edge) return
      await applyDeleteEdge(edgeId)
      pushHistory({ type: 'edge-delete', edge })
    },

    async undo() {
      const entry = get().history[get().history.length - 1]
      if (!entry) return
      await replay(entry, 'undo')
      set((state) => ({ history: state.history.slice(0, -1), redoStack: [...state.redoStack, entry] }))
    },

    async redo() {
      const entry = get().redoStack[get().redoStack.length - 1]
      if (!entry) return
      await replay(entry, 'redo')
      set((state) => ({ history: [...state.history, entry], redoStack: state.redoStack.slice(0, -1) }))
    },

    copySelection() {
      const selected = get().nodes.filter((node) => node.selected)
      if (selected.length === 0) return
      set({ clipboard: buildPayload(selected, get().edges) })
    },

    async paste() {
      const payload = get().clipboard
      if (!payload) return
      await pastePayload(payload, 40)
    },

    async duplicateSelection() {
      const selected = get().nodes.filter((node) => node.selected)
      if (selected.length === 0) return
      const payload = buildPayload(selected, get().edges)
      await pastePayload(payload, 48)
    },

    async createRecipeNode(input) {
      const projectId = get().projectId
      if (!projectId) return
      const snapshot = await workflowApi.commands(projectId, get().workflowRevision, [{ type: 'create_recipe_node', capabilityId: input.capabilityId, title: input.title, config: input.config ?? {}, position: { x: input.x ?? 140, y: input.y ?? 140 } }])
      const mapped = await toWorkflowState(snapshot, get().capabilities)
      set({ ...mapped, workflowRevision: snapshot.revision })
    },

    async applyWorkflowCommands(commands) {
      const projectId = get().projectId
      if (!projectId) return
      const snapshot = await workflowApi.commands(projectId, get().workflowRevision, commands)
      const mapped = await toWorkflowState(snapshot, get().capabilities)
      set({ ...mapped, workflowRevision: snapshot.revision })
    },

    async createExecutionPlan(recipeNodeIds) {
      const projectId = get().projectId
      if (!projectId) throw new Error('No active project')
      const plan = await workflowApi.createPlan(projectId, get().workflowRevision, recipeNodeIds)
      await workflowApi.executePlan(plan.id)
      return plan.id
    },
  }
})
