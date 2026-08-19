import { describe, expect, it, vi } from 'vitest'

import type { OperationCatalog, PreExecuteState } from './catalog.js'
import { createCapabilityHost } from './host.js'

const catalog: OperationCatalog = {
  getById: () => undefined,
  require: () => {
    throw new Error('not found')
  },
  all: () => [],
  getAvailableOperations: () => [],
}

function preExecuteState(): PreExecuteState {
  return {
    workspaceId: 'ws',
    projectId: 'proj',
    runId: 'run',
    operationId: 'generate_outline',
    createdBy: 'creator',
    project: { title: 't', brief: 'b', personalStyleId: null },
    connectedInputs: [],
    config: {},
  }
}

describe('CapabilityHost', () => {
  it('returns the same instance from require after apply', async () => {
    const host = createCapabilityHost()
    await host.apply({ name: 'seed', apply: (h) => h.provide('operations.catalog', catalog) })
    expect(host.require('operations.catalog')).toBe(catalog)
  })

  it('clears provided services after the plugin dispose; require throws synchronously', async () => {
    const host = createCapabilityHost()
    const dispose = await host.apply({ name: 'seed', apply: (h) => h.provide('operations.catalog', catalog) })
    await dispose()
    expect(host.get('operations.catalog')).toBeUndefined()
    expect(() => host.require('operations.catalog')).toThrow()
  })

  it('clears provided services after host.dispose()', async () => {
    const host = createCapabilityHost()
    await host.apply({ name: 'seed', apply: (h) => h.provide('operations.catalog', catalog) })
    await host.dispose()
    expect(host.get('operations.catalog')).toBeUndefined()
    expect(() => host.require('operations.catalog')).toThrow()
  })

  it('throws when provide is called twice for the same key unless disposed first', () => {
    const host = createCapabilityHost()
    const other: OperationCatalog = { ...catalog }
    const dispose = host.provide('operations.catalog', catalog)
    expect(() => host.provide('operations.catalog', other)).toThrow()
    dispose()
    host.provide('operations.catalog', other)
    expect(host.require('operations.catalog')).toBe(other)
  })

  it('disposes applied plugins last-in first-out', async () => {
    const host = createCapabilityHost()
    const order: string[] = []
    await host.apply({ name: 'a', apply: () => () => { order.push('a') } })
    await host.apply({ name: 'b', apply: () => () => { order.push('b') } })
    await host.dispose()
    expect(order).toEqual(['b', 'a'])
  })

  it('awaits an async plugin apply before require', async () => {
    const host = createCapabilityHost()
    await host.apply({
      name: 'async-seed',
      apply: async (h) => {
        await Promise.resolve()
        return h.provide('operations.catalog', catalog)
      },
    })
    expect(host.require('operations.catalog')).toBe(catalog)
  })

  it('returns the original value when a waterfall has no listeners', async () => {
    const host = createCapabilityHost()
    const state = preExecuteState()
    await expect(host.waterfall('operation/pre-execute', state)).resolves.toBe(state)
  })

  it('isolates emit listener exceptions so later listeners still run', () => {
    const host = createCapabilityHost()
    const seen: string[] = []
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    host.on('run/create', () => {
      throw new Error('boom')
    })
    host.on('run/create', (payload) => {
      seen.push(payload.runId)
    })
    host.emit('run/create', { workspaceId: 'w', projectId: 'p', runId: 'r1', operationId: 'op' })
    expect(seen).toEqual(['r1'])
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('throws when registry.register is called twice for the same id unless disposed first', () => {
    const host = createCapabilityHost()
    const registry = host.registry('operations.capability')
    const dispose = registry.register('text_generation', 'text_generation')
    expect(() => registry.register('text_generation', 'text_generation')).toThrow()
    dispose()
    registry.register('text_generation', 'text_generation')
    expect(registry.require('text_generation')).toBe('text_generation')
  })
})
