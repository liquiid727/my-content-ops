import type { OperationDefinition } from '@creator-studio/contracts'
import { create } from 'zustand'

export type InspectorTab = 'overview' | 'versions' | 'collection'

interface InspectorState {
  /** 当前选中的 CanvasNode id（打开状态由 nodeId 非空表达）。 */
  nodeId: string | null
  /** 选中节点绑定的 artifact。 */
  artifactId: string | null
  tab: InspectorTab
  /** Registry 返回的可用操作（null = 未加载）。 */
  operations: OperationDefinition[] | null
  operationsLoading: boolean
  operationsError: string | null

  openForNode: (nodeId: string, artifactId: string) => void
  close: () => void
  setTab: (tab: InspectorTab) => void
  setOperations: (operations: OperationDefinition[] | null, error?: string | null) => void
  clear: () => void
}

export const useInspectorStore = create<InspectorState>((set) => ({
  nodeId: null,
  artifactId: null,
  tab: 'overview',
  operations: null,
  operationsLoading: false,
  operationsError: null,

  openForNode: (nodeId, artifactId) =>
    set({ nodeId, artifactId, tab: 'overview', operations: null, operationsError: null, operationsLoading: true }),

  close: () => set({ nodeId: null, artifactId: null, operations: null, operationsError: null }),

  setTab: (tab) => set({ tab }),

  setOperations: (operations, error = null) =>
    set({ operations, operationsError: error, operationsLoading: false }),

  clear: () => set({ nodeId: null, artifactId: null, operations: null, operationsError: null, operationsLoading: false }),
}))
