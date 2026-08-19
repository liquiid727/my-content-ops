import type { ConnectionType, KnowledgeSource } from '@creator-studio/contracts'

export interface AdapterConnection {
  id: string
  type: ConnectionType
  config: Record<string, unknown>
}

export interface ResourceDescriptor {
  ref: string
  title: string
  kind: KnowledgeSource['kind']
  mimeType: string | null
  excerpt: string
  sourceUrl: string | null
  sourceVersion: string | null
  modifiedAt: number | null
  metadata: Record<string, unknown>
}

export interface NormalizedResource extends ResourceDescriptor {
  text: string
}

export interface ConnectionHealth {
  ok: boolean
  status: 'auth_required' | 'ready' | 'error'
  message: string
}

/** The only external-resource interface visible to KnowledgeService and agent tools. */
export interface ResourceAdapter {
  readonly type: ConnectionType
  test(connection: AdapterConnection): Promise<ConnectionHealth>
  browse(connection: AdapterConnection, limit: number): Promise<ResourceDescriptor[]>
  search(connection: AdapterConnection, query: string, limit: number): Promise<ResourceDescriptor[]>
  stat(connection: AdapterConnection, ref: string): Promise<ResourceDescriptor>
  read(connection: AdapterConnection, ref: string): Promise<NormalizedResource>
}

export class ResourceAdapterRegistry {
  private readonly adapters = new Map<ConnectionType, ResourceAdapter>()

  constructor(adapters: ResourceAdapter[]) {
    for (const adapter of adapters) this.adapters.set(adapter.type, adapter)
  }

  require(type: ConnectionType): ResourceAdapter {
    const adapter = this.adapters.get(type)
    if (!adapter) throw new Error(`No resource adapter registered for ${type}`)
    return adapter
  }
}
