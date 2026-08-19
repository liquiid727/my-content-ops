import type { OperationDefinition } from '@creator-studio/contracts'

/** Operations that create a downstream artifact/collection from the current node. */
export function nextCreateOperations(operations: OperationDefinition[]): OperationDefinition[] {
  return operations
    .filter((operation) => {
      if (operation.behavior !== 'create') return false
      if (operation.executor === 'operation.not_implemented') return false
      const output = operation.output?.behavior
      return output === 'new_artifact' || output === 'new_collection'
    })
    .sort((a, b) => a.presentation.priority - b.presentation.priority)
}
