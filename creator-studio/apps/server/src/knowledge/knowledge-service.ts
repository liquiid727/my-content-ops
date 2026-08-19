import { knowledgeSourceDetailSchema, knowledgeSourceSchema, serializeIsoDateTime, type KnowledgeSearchQuery, type KnowledgeSource, type KnowledgeSourceDetail } from '@creator-studio/contracts'
import { ulid } from 'ulid'

import { HttpError } from '../http/errors.js'
import { ConnectionService } from './connection-service.js'
import { KnowledgeRepository, type KnowledgeSourceRow } from './knowledge-repository.js'
import type { ResourceDescriptor } from './resource-adapter.js'
import { ResourceAdapterRegistry } from './resource-adapter.js'

const CACHE_TTL_MS = 15 * 60_000

function date(value: number | null): string | null { return value === null ? null : serializeIsoDateTime(new Date(value)) }

export class KnowledgeService {
  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly connections: ConnectionService,
    private readonly adapters: ResourceAdapterRegistry,
    private readonly now: () => number = Date.now,
  ) {}

  async search(workspaceId: string, query: KnowledgeSearchQuery): Promise<KnowledgeSource[]> {
    if (query.q) {
      const connections = query.connectionId ? [this.connections.row(workspaceId, query.connectionId)] : this.repository.listConnections(workspaceId)
      for (const connection of connections.filter((item) => item.enabled && item.status === 'ready' && item.type === 'lark')) {
        try {
          const descriptors = await this.adapters.require(connection.type).search({ id: connection.id, type: connection.type, config: JSON.parse(connection.config_json) as Record<string, unknown> }, query.q, query.limit)
          for (const descriptor of descriptors) this.upsertDescriptor(workspaceId, connection.id, descriptor)
        } catch (error) {
          const now = this.now()
          this.repository.updateConnection(workspaceId, connection.id, {
            status: error instanceof HttpError && error.code === 'CONNECTOR_AUTH_REQUIRED' ? 'auth_required' : 'error',
            last_checked_at: now, last_error: error instanceof Error ? error.message : '飞书搜索失败。', updated_at: now,
          })
        }
      }
    }
    return this.repository.listSources(workspaceId, query).map((row) => this.mapSource(row))
  }

  async detail(workspaceId: string, sourceId: string, force = false): Promise<KnowledgeSourceDetail> {
    const source = this.requireSource(workspaceId, sourceId)
    const connection = this.connections.row(workspaceId, source.connection_id)
    const adapter = this.adapters.require(connection.type)
    const adapterConnection = { id: connection.id, type: connection.type, config: JSON.parse(connection.config_json) as Record<string, unknown> }
    const cached = force ? null : this.repository.getCache(source.id, this.now())
    if (cached) {
      const current = await adapter.stat(adapterConnection, source.remote_ref).catch(() => null)
      if (!current?.sourceVersion || current.sourceVersion === cached.sourceVersion) return this.mapDetail(source, cached.text, true)
    }
    const resource = await adapter.read(adapterConnection, source.remote_ref)
    const updated = this.repository.upsertSource({
      id: source.id, workspaceId, connectionId: connection.id, ref: resource.ref, title: resource.title, kind: resource.kind,
      mimeType: resource.mimeType, excerpt: resource.excerpt, sourceUrl: resource.sourceUrl, sourceVersion: resource.sourceVersion,
      modifiedAt: resource.modifiedAt, metadata: resource.metadata, now: this.now(),
    })
    this.repository.putContent(updated.id, resource.text, resource.sourceVersion, this.now(), CACHE_TTL_MS)
    return this.mapDetail(this.requireSource(workspaceId, updated.id), resource.text, false)
  }

  async indexConnection(workspaceId: string, connectionId: string): Promise<{ discovered: number; indexed: number; failed: number }> {
    const connection = this.connections.row(workspaceId, connectionId)
    const adapter = this.adapters.require(connection.type)
    const descriptors = await adapter.browse({ id: connection.id, type: connection.type, config: JSON.parse(connection.config_json) as Record<string, unknown> }, 10_000)
    let indexed = 0
    let failed = 0
    const failures: string[] = []
    for (const descriptor of descriptors) {
      const source = this.upsertDescriptor(workspaceId, connection.id, descriptor)
      try { await this.detail(workspaceId, source.id, true); indexed += 1 } catch (error) {
        failed += 1
        if (failures.length < 5) failures.push(`${descriptor.ref}: ${error instanceof Error ? error.message : '提取失败'}`)
      }
    }
    if (connection.type !== 'lark') this.repository.pruneConnectionSources(workspaceId, connectionId, new Set(descriptors.map((item) => item.ref)))
    const now = this.now()
    this.repository.updateConnection(workspaceId, connectionId, {
      status: 'ready', last_checked_at: now, last_error: failed ? `${failed} 个资源未能索引。${failures.join('；')}` : null, updated_at: now,
    })
    return { discovered: descriptors.length, indexed, failed }
  }

  async refresh(workspaceId: string, sourceId: string): Promise<KnowledgeSourceDetail> { return this.detail(workspaceId, sourceId, true) }

  bind(workspaceId: string, projectId: string, sourceId: string): KnowledgeSource {
    if (!this.repository.bindProjectSource(workspaceId, projectId, sourceId, this.now())) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Project 或知识来源不存在。' })
    return this.mapSource(this.requireSource(workspaceId, sourceId))
  }

  unbind(workspaceId: string, projectId: string, sourceId: string): void {
    if (!this.repository.unbindProjectSource(workspaceId, projectId, sourceId)) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: '项目知识引用不存在。' })
  }

  listProjectSources(workspaceId: string, projectId: string): KnowledgeSource[] {
    return this.repository.listSources(workspaceId, { q: '', projectId, limit: 50 }).map((row) => this.mapSource(row))
  }

  async projectContext(workspaceId: string, projectId: string, sourceIds?: string[], maxCharacters = 24_000): Promise<{ text: string; citations: Array<{ sourceId: string; ref: string; sourceVersion: string | null; readAt: string }> }> {
    const bound = this.listProjectSources(workspaceId, projectId)
    const selected = sourceIds?.length ? bound.filter((source) => sourceIds.includes(source.id)) : bound
    let remaining = maxCharacters
    const sections: string[] = []
    const citations: Array<{ sourceId: string; ref: string; sourceVersion: string | null; readAt: string }> = []
    for (const source of selected) {
      if (remaining <= 0) break
      const detail = await this.detail(workspaceId, source.id)
      const text = detail.text.slice(0, remaining)
      remaining -= text.length
      sections.push(`来源：${detail.title}（${detail.connectionType}:${detail.ref}）\n${text}`)
      citations.push({ sourceId: detail.id, ref: detail.ref, sourceVersion: detail.sourceVersion, readAt: detail.readAt ?? serializeIsoDateTime(new Date(this.now())) })
    }
    return { text: sections.join('\n\n'), citations }
  }

  private upsertDescriptor(workspaceId: string, connectionId: string, descriptor: ResourceDescriptor): KnowledgeSourceRow {
    return this.repository.upsertSource({ id: ulid(this.now()), workspaceId, connectionId, ...descriptor, now: this.now() })
  }

  private requireSource(workspaceId: string, sourceId: string): KnowledgeSourceRow {
    const source = this.repository.getSource(workspaceId, sourceId)
    if (!source) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: '知识来源不存在。' })
    return source
  }

  private mapSource(row: KnowledgeSourceRow): KnowledgeSource {
    return knowledgeSourceSchema.parse({
      id: row.id, connectionId: row.connection_id, connectionType: row.connection_type, ref: row.remote_ref, title: row.title,
      kind: row.kind, mimeType: row.mime_type, excerpt: row.excerpt, sourceUrl: row.source_url, sourceVersion: row.source_version,
      modifiedAt: date(row.modified_at), readAt: date(row.read_at), indexedAt: date(row.indexed_at), projectIds: this.repository.listProjectIds(row.id),
    })
  }

  private mapDetail(row: KnowledgeSourceRow, text: string, cached: boolean): KnowledgeSourceDetail {
    return knowledgeSourceDetailSchema.parse({ ...this.mapSource(row), text, metadata: JSON.parse(row.metadata_json), cached })
  }
}
