CREATE TABLE resource_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('obsidian', 'folder', 'lark')),
  name TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured', 'installing', 'auth_required', 'ready', 'error')),
  last_checked_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX resource_connections_workspace_idx ON resource_connections(workspace_id, updated_at DESC);

INSERT INTO resource_connections (
  id, workspace_id, type, name, config_json, enabled, status, last_checked_at, last_error, created_at, updated_at
)
SELECT
  id,
  workspace_id,
  CASE connector_key WHEN 'lark_cli' THEN 'lark' ELSE 'obsidian' END,
  display_name,
  config_json,
  enabled,
  CASE WHEN last_check_status = 'ok' THEN 'ready' WHEN last_check_status = 'error' THEN 'error' ELSE 'not_configured' END,
  last_checked_at,
  NULL,
  created_at,
  updated_at
FROM connector_configs;

CREATE TABLE knowledge_sources (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES resource_connections(id) ON DELETE CASCADE,
  remote_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('document', 'spreadsheet', 'image', 'audio', 'video', 'other')),
  mime_type TEXT,
  excerpt TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  source_version TEXT,
  modified_at INTEGER,
  read_at INTEGER,
  indexed_at INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(connection_id, remote_ref)
);

CREATE INDEX knowledge_sources_workspace_idx ON knowledge_sources(workspace_id, updated_at DESC);
CREATE INDEX knowledge_sources_connection_idx ON knowledge_sources(connection_id, remote_ref);

CREATE TABLE project_sources (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(project_id, source_id)
);

CREATE INDEX project_sources_source_idx ON project_sources(source_id, project_id);

CREATE TABLE knowledge_cache (
  source_id TEXT PRIMARY KEY REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  source_version TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE knowledge_chunks (
  source_id TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY(source_id, chunk_index)
);

CREATE VIRTUAL TABLE knowledge_chunks_fts USING fts5(
  source_id UNINDEXED,
  chunk_index UNINDEXED,
  text,
  tokenize = 'unicode61'
);

ALTER TABLE runs ADD COLUMN knowledge_source_ids_json TEXT NOT NULL DEFAULT '[]';
