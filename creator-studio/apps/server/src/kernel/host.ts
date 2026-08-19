// Host is an in-process service map + events. It does not hold Database or Hono.

import type { HostRegistries, HostServices, HostWaterfalls } from './catalog.js'
import type { CapabilityHost, Dispose, Registry } from './types.js'

function createRegistry<T>(): Registry<T> {
  const items = new Map<string, T>()
  return {
    register(id, value) {
      if (items.has(id)) throw new Error(`Already registered: ${id}`)
      items.set(id, value)
      return () => {
        if (items.get(id) === value) items.delete(id)
      }
    },
    get(id) {
      return items.get(id)
    },
    require(id) {
      const value = items.get(id)
      if (value === undefined) throw new Error(`Not registered: ${id}`)
      return value
    },
    list() {
      return [...items.entries()].map(([id, value]) => ({ id, value }))
    },
  }
}

export function createCapabilityHost(): CapabilityHost {
  const services = new Map<string, unknown>()
  const registries = new Map<string, Registry<unknown>>()
  const listeners = new Map<string, Set<(payload: never) => void>>()
  const waterfalls = new Map<string, Array<(value: never, signal: AbortSignal) => unknown>>()
  const disposers: Dispose[] = []

  const host: CapabilityHost = {
    provide(key, value) {
      const token = String(key)
      if (services.has(token)) throw new Error(`Service already provided: ${token}`)
      services.set(token, value)
      return () => {
        if (services.get(token) === value) services.delete(token)
      }
    },

    get(key) {
      return services.get(String(key)) as HostServices[typeof key] | undefined
    },

    require(key) {
      const value = host.get(key)
      if (value === undefined) throw new Error(`Service not provided: ${String(key)}`)
      return value
    },

    registry(key) {
      const token = String(key)
      const existing = registries.get(token)
      if (existing) return existing as Registry<HostRegistries[typeof key]>
      const created = createRegistry<HostRegistries[typeof key]>()
      registries.set(token, created as Registry<unknown>)
      return created
    },

    on(event, listener) {
      const token = String(event)
      let set = listeners.get(token)
      if (!set) {
        set = new Set()
        listeners.set(token, set)
      }
      set.add(listener as (payload: never) => void)
      return () => {
        set.delete(listener as (payload: never) => void)
      }
    },

    emit(event, payload) {
      const set = listeners.get(String(event))
      if (!set) return
      for (const listener of set) {
        try {
          listener(payload as never)
        } catch (error) {
          console.error(JSON.stringify({
            kernel: 'emit',
            event,
            message: error instanceof Error ? error.message : String(error),
          }))
        }
      }
    },

    useWaterfall(event, listener) {
      const token = String(event)
      let chain = waterfalls.get(token)
      if (!chain) {
        chain = []
        waterfalls.set(token, chain)
      }
      chain.push(listener as (value: never, signal: AbortSignal) => unknown)
      return () => {
        const index = chain.indexOf(listener as (value: never, signal: AbortSignal) => unknown)
        if (index >= 0) chain.splice(index, 1)
      }
    },

    async waterfall(event, value, signal) {
      const chain = waterfalls.get(String(event))
      if (!chain || chain.length === 0) return value
      const abort = signal ?? new AbortController().signal
      let current = value
      for (const listener of chain) {
        current = await listener(current as never, abort) as HostWaterfalls[typeof event]
      }
      return current
    },

    async apply(plugin) {
      console.info(JSON.stringify({ kernel: 'plugin', name: plugin.name, event: 'apply' }))
      const result = await plugin.apply(host)
      let disposed = false
      const dispose: Dispose = async () => {
        if (disposed) return
        disposed = true
        const index = disposers.lastIndexOf(dispose)
        if (index >= 0) disposers.splice(index, 1)
        console.info(JSON.stringify({ kernel: 'plugin', name: plugin.name, event: 'dispose' }))
        await result?.()
      }
      disposers.push(dispose)
      return dispose
    },

    async dispose() {
      while (disposers.length > 0) {
        const next = disposers.pop()
        if (!next) break
        await next()
      }
    },
  }

  return host
}
