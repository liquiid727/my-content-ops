import type { HostEvents, HostRegistries, HostServices, HostWaterfalls } from './catalog.js'

export type Dispose = () => void | Promise<void>

export interface Plugin {
  readonly name: string
  apply(host: CapabilityHost): Dispose | void | Promise<Dispose | void>
}

export interface Registry<T> {
  register(id: string, value: T): Dispose
  get(id: string): T | undefined
  require(id: string): T
  list(): ReadonlyArray<{ id: string; value: T }>
}

export interface CapabilityHost {
  provide<K extends keyof HostServices>(key: K, value: HostServices[K]): Dispose
  get<K extends keyof HostServices>(key: K): HostServices[K] | undefined
  require<K extends keyof HostServices>(key: K): HostServices[K]
  registry<K extends keyof HostRegistries>(key: K): Registry<HostRegistries[K]>

  on<E extends keyof HostEvents>(event: E, listener: (payload: HostEvents[E]) => void): Dispose
  emit<E extends keyof HostEvents>(event: E, payload: HostEvents[E]): void

  useWaterfall<E extends keyof HostWaterfalls>(
    event: E,
    listener: (value: HostWaterfalls[E], signal: AbortSignal) => HostWaterfalls[E] | Promise<HostWaterfalls[E]>,
  ): Dispose
  waterfall<E extends keyof HostWaterfalls>(
    event: E,
    value: HostWaterfalls[E],
    signal?: AbortSignal,
  ): Promise<HostWaterfalls[E]>

  apply(plugin: Plugin): Promise<Dispose>
  dispose(): Promise<void>
}
