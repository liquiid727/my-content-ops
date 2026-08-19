import type { OperationDefinition } from '@creator-studio/contracts'
import { create } from 'zustand'

export type InspectorTab = 'overview' | 'comments' | 'versions' | 'collection'

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
  /** 每次 openForNode 自增，强制 useInspectorOperations 对同一 artifact 也重新拉取。 */
  operationsReload: number

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
  operationsReload: 0,

  openForNode: (nodeId, artifactId) =>
    set((state) => ({
      nodeId,
      artifactId,
      tab: 'overview',
      operations: null,
      operationsError: null,
      operationsLoading: true,
      operationsReload: state.operationsReload + 1,
    })),

  close: () => set({ nodeId: null, artifactId: null, operations: null, operationsError: null }),

  setTab: (tab) => set({ tab }),

  setOperations: (operations, error = null) =>
    set({ operations, operationsError: error, operationsLoading: false }),

  clear: () => set({ nodeId: null, artifactId: null, operations: null, operationsError: null, operationsLoading: false }),
}))
