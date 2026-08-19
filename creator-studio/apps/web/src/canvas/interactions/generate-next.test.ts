import type { OperationDefinition } from '@creator-studio/contracts'
import { describe, expect, it } from 'vitest'

import { nextCreateOperations } from './generate-next'

function operation(partial: Partial<OperationDefinition> & Pick<OperationDefinition, 'id' | 'behavior'>): OperationDefinition {
  return {
    label: partial.id,
    description: partial.id,
    input: {},
    output: { kind: 'text', role: 'outline', behavior: 'new_artifact' },
    executor: `operation.${partial.id}`,
    defaultConfig: {},
    presentation: { group: 'generate', priority: 10, placement: 'secondary', danger: false },
    ...partial,
  }
}

describe('nextCreateOperations', () => {
  it('keeps implemented create operations that spawn a new node', () => {
    const next = nextCreateOperations([
      operation({ id: 'generate_cover', behavior: 'create', output: { kind: 'image', role: 'cover', behavior: 'new_collection' }, presentation: { group: 'media', priority: 20, placement: 'secondary', danger: false } }),
      operation({ id: 'polish', behavior: 'transform', output: { behavior: 'new_version' } }),
      operation({ id: 'generate_article', behavior: 'create', executor: 'operation.not_implemented' }),
      operation({ id: 'generate_outline', behavior: 'create', presentation: { group: 'generate', priority: 5, placement: 'primary', danger: false } }),
    ])
    expect(next.map((item) => item.id)).toEqual(['generate_outline', 'generate_cover'])
  })
})
