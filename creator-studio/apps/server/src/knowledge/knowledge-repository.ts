import type BetterSqlite3 from 'better-sqlite3'

import type { ConnectionType, KnowledgeSearchQuery, KnowledgeSource } from '@creator-studio/contracts'

interface ConnectionRow {
  id: string; workspace_id: string; type: ConnectionType; name: string; config_json: string; enabled: number
  status: 'not_configured' | 'installing' | 'auth_required' | 'ready' | 'error'; last_checked_at: number | null
  last_error: string | null; created_at: number; updated_at: number
}

interface SourceRow {
  id: string; workspace_id: string; connection_id: string; remote_ref: string; title: string
  kind: KnowledgeSource['kind']; mime_type: string | null; excerpt: string; source_url: string | null
  source_version: string | null; modified_at: number | null; read_at: number | null; indexed_at: number | null
  metadata_json: string; created_at: number; updated_at: number; connection_type?: ConnectionType
}

export interface UpsertSourceInput {
  id: string; workspaceId: string; connectionId: string; ref: string; title: string; kind: KnowledgeSource['kind']
  mimeType: string | null; excerpt: string; sourceUrl: string | null; sourceVersion: string | null; modifiedAt: number | null
  metadata: Record<string, unknown>; now: number
}

export class KnowledgeRepository {
  constructor(private readonly sqlite: BetterSqlite3.Database) {}

  listConnections(workspaceId: string): ConnectionRow[] {
    return this.sqlite.prepare('SELECT * FROM resource_connections WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId) as ConnectionRow[]
  }

  getConnection(workspaceId: string, id: string): ConnectionRow | null {
    return this.sqlite.prepare('SELECT * FROM resource_connections WHERE workspace_id = ? AND id = ?').get(workspaceId, id) as ConnectionRow | undefined ?? null
  }

  insertConnection(row: ConnectionRow): void {
    this.sqlite.prepare(`INSERT INTO resource_connections (id, workspace_id, type, name, config_json, enabled, status, last_checked_at, last_error, created_at, updated_at)
      VALUES (@id, @workspace_id, @type, @name, @config_json, @enabled, @status, @last_checked_at, @last_error, @created_at, @updated_at)`).run(row)
  }

  updateConnection(workspaceId: string, id: string, input: Partial<Pick<ConnectionRow, 'name' | 'config_json' | 'enabled' | 'status' | 'last_checked_at' | 'last_error' | 'updated_at'>>): void {
    const entries = Object.entries(input)
    if (!entries.length) return
    this.sqlite.prepare(`UPDATE resource_connections SET ${entries.map(([key]) => `${key} = @${key}`).join(', ')} WHERE workspace_id = @workspace_id AND id = @id`).run({ workspace_id: workspaceId, id, ...input })
  }

  deleteConnection(workspaceId: string, id: string): boolean {
    return this.sqlite.transaction(() => {
      this.sqlite.prepare(`DELETE FROM knowledge_chunks_fts WHERE source_id IN (
        SELECT id FROM knowledge_sources WHERE workspace_id = ? AND connection_id = ?
      )`).run(workspaceId, id)
      return this.sqlite.prepare('DELETE FROM resource_connections WHERE workspace_id = ? AND id = ?').run(workspaceId, id).changes > 0
    })()
  }

  upsertSource(input: UpsertSourceInput): SourceRow {
    this.sqlite.prepare(`INSERT INTO knowledge_sources
      (id, workspace_id, connection_id, remote_ref, title, kind, mime_type, excerpt, source_url, source_version, modified_at, metadata_json, created_at, updated_at)
      VALUES (@id, @workspaceId, @connectionId, @ref, @title, @kind, @mimeType, @excerpt, @sourceUrl, @sourceVersion, @modifiedAt, @metadataJson, @now, @now)
      ON CONFLICT(connection_id, remote_ref) DO UPDATE SET title=excluded.title, kind=excluded.kind, mime_type=excluded.mime_type,
      excerpt=excluded.excerpt, source_url=excluded.source_url, source_version=excluded.source_version, modified_at=excluded.modified_at,
      metadata_json=excluded.metadata_json, updated_at=excluded.updated_at`).run({ ...input, metadataJson: JSON.stringify(input.metadata) })
    return this.sqlite.prepare('SELECT * FROM knowledge_sources WHERE connection_id = ? AND remote_ref = ?').get(input.connectionId, input.ref) as SourceRow
  }

  getSource(workspaceId: string, id: string): SourceRow | null {
    return this.sqlite.prepare(`SELECT s.*, c.type AS connection_type FROM knowledge_sources s JOIN resource_connections c ON c.id=s.connection_id
      WHERE s.workspace_id=? AND s.id=?`).get(workspaceId, id) as SourceRow | undefined ?? null
  }

  listSources(workspaceId: string, query: KnowledgeSearchQuery): SourceRow[] {
    const where = ['s.workspace_id = @workspaceId', 'c.enabled = 1']
    const params: Record<string, unknown> = { workspaceId, limit: query.limit }
    if (query.connectionId) { where.push('s.connection_id = @connectionId'); params.connectionId = query.connectionId }
    if (query.projectId) { where.push('EXISTS (SELECT 1 FROM project_sources ps WHERE ps.source_id=s.id AND ps.project_id=@projectId)'); params.projectId = query.projectId }
    if (query.kind) { where.push('s.kind = @kind'); params.kind = query.kind }
    if (query.q) { where.push('(s.title LIKE @like OR s.excerpt LIKE @like OR EXISTS (SELECT 1 FROM knowledge_chunks k WHERE k.source_id=s.id AND k.text LIKE @like))'); params.like = `%${query.q}%` }
    return this.sqlite.prepare(`SELECT s.*, c.type AS connection_type FROM knowledge_sources s JOIN resource_connections c ON c.id=s.connection_id
      WHERE ${where.join(' AND ')} ORDER BY s.updated_at DESC LIMIT @limit`).all(params) as SourceRow[]
  }

  listProjectIds(sourceId: string): string[] {
    return (this.sqlite.prepare('SELECT project_id FROM project_sources WHERE source_id=? ORDER BY created_at').all(sourceId) as Array<{ project_id: string }>).map((row) => row.project_id)
  }

  getCache(sourceId: string, now: number): { text: string; sourceVersion: string | null } | null {
    return this.sqlite.prepare('SELECT text, source_version AS sourceVersion FROM knowledge_cache WHERE source_id=? AND expires_at>?').get(sourceId, now) as { text: string; sourceVersion: string | null } | undefined ?? null
  }

  putContent(sourceId: string, text: string, sourceVersion: string | null, now: number, ttlMs: number): void {
    const chunks = chunkText(text)
    this.sqlite.transaction(() => {
      this.sqlite.prepare(`INSERT INTO knowledge_cache (source_id,text,source_version,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(source_id) DO UPDATE SET text=excluded.text,source_version=excluded.source_version,expires_at=excluded.expires_at,updated_at=excluded.updated_at`).run(sourceId, text, sourceVersion, now + ttlMs, now, now)
      this.sqlite.prepare('DELETE FROM knowledge_chunks WHERE source_id=?').run(sourceId)
      this.sqlite.prepare('DELETE FROM knowledge_chunks_fts WHERE source_id=?').run(sourceId)
      const insert = this.sqlite.prepare('INSERT INTO knowledge_chunks (source_id,chunk_index,text) VALUES (?,?,?)')
      const insertFts = this.sqlite.prepare('INSERT INTO knowledge_chunks_fts (source_id,chunk_index,text) VALUES (?,?,?)')
      chunks.forEach((chunk, index) => { insert.run(sourceId, index, chunk); insertFts.run(sourceId, index, chunk) })
      this.sqlite.prepare('UPDATE knowledge_sources SET excerpt=?,source_version=?,read_at=?,indexed_at=?,updated_at=? WHERE id=?').run(text.slice(0, 300), sourceVersion, now, now, now, sourceId)
    })()
  }

  pruneConnectionSources(workspaceId: string, connectionId: string, activeRefs: ReadonlySet<string>): number {
    const stale = (this.sqlite.prepare('SELECT id, remote_ref FROM knowledge_sources WHERE workspace_id=? AND connection_id=?').all(workspaceId, connectionId) as Array<{ id: string; remote_ref: string }>)
      .filter((row) => !activeRefs.has(row.remote_ref))
    this.sqlite.transaction(() => {
      const deleteFts = this.sqlite.prepare('DELETE FROM knowledge_chunks_fts WHERE source_id=?')
      const deleteSource = this.sqlite.prepare('DELETE FROM knowledge_sources WHERE workspace_id=? AND connection_id=? AND id=?')
      stale.forEach((row) => { deleteFts.run(row.id); deleteSource.run(workspaceId, connectionId, row.id) })
    })()
    return stale.length
  }

  bindProjectSource(workspaceId: string, projectId: string, sourceId: string, now: number): boolean {
    const project = this.sqlite.prepare('SELECT id FROM projects WHERE workspace_id=? AND id=? AND deleted_at IS NULL').get(workspaceId, projectId)
    const source = this.sqlite.prepare('SELECT id FROM knowledge_sources WHERE workspace_id=? AND id=?').get(workspaceId, sourceId)
    if (!project || !source) return false
    this.sqlite.prepare('INSERT OR IGNORE INTO project_sources (project_id,source_id,created_at) VALUES (?,?,?)').run(projectId, sourceId, now)
    return true
  }

  unbindProjectSource(workspaceId: string, projectId: string, sourceId: string): boolean {
    return this.sqlite.prepare(`DELETE FROM project_sources WHERE project_id=? AND source_id=?
      AND EXISTS (SELECT 1 FROM projects WHERE id=? AND workspace_id=?)`).run(projectId, sourceId, projectId, workspaceId).changes > 0
  }
}

export type KnowledgeConnectionRow = ConnectionRow
export type KnowledgeSourceRow = SourceRow

function chunkText(text: string, size = 1_600, overlap = 200): string[] {
  const normalized = text.trim()
  if (!normalized) return []
  const chunks: string[] = []
  for (let start = 0; start < normalized.length; start += size - overlap) chunks.push(normalized.slice(start, start + size))
  return chunks
}
