import type { OperationDefinition } from '@creator-studio/contracts'
import { beforeEach, describe, expect, it } from 'vitest'

import { useInspectorStore } from './inspector-store'

const NODE_ID = '01ARZ3NDEKTSV4RRFFQ69G5F01'
const ARTIFACT_ID = '01ARZ3NDEKTSV4RRFFQ69G5F02'

beforeEach(() => {
  useInspectorStore.setState({ nodeId: null, artifactId: null, tab: 'overview', operations: null, operationsLoading: false, operationsError: null })
})

describe('inspector store', () => {
  it('opens for a node and resets operations cache', () => {
    useInspectorStore.getState().setOperations([], null)
    useInspectorStore.getState().openForNode(NODE_ID, ARTIFACT_ID)

    const state = useInspectorStore.getState()
    expect(state.nodeId).toBe(NODE_ID)
    expect(state.artifactId).toBe(ARTIFACT_ID)
    expect(state.tab).toBe('overview')
    expect(state.operations).toBeNull()
    expect(state.operationsLoading).toBe(true)
  })

  it('closes and clears state', () => {
    useInspectorStore.getState().openForNode(NODE_ID, ARTIFACT_ID)
    useInspectorStore.getState().close()

    const state = useInspectorStore.getState()
    expect(state.nodeId).toBeNull()
    expect(state.artifactId).toBeNull()
    expect(state.operations).toBeNull()
  })

  it('stores registry operations and switches tabs', () => {
    const operations: OperationDefinition[] = []
    useInspectorStore.getState().setOperations(operations)
    expect(useInspectorStore.getState().operations).toBe(operations)
    expect(useInspectorStore.getState().operationsLoading).toBe(false)

    useInspectorStore.getState().setTab('versions')
    expect(useInspectorStore.getState().tab).toBe('versions')
  })
})
