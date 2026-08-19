CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE creator_profiles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  avatar_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  bio TEXT NOT NULL DEFAULT '',
  preferences_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(workspace_id)
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  content_type TEXT NOT NULL DEFAULT 'general',
  target_platform TEXT,
  target_duration_ms INTEGER CHECK (target_duration_ms IS NULL OR target_duration_ms > 0),
  cover_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'audio', 'video', 'document', 'other')),
  source TEXT NOT NULL CHECK (source IN ('upload', 'generated', 'imported')),
  display_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  storage_path TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('idea', 'topic', 'script', 'rhythm_plan', 'shot', 'asset')),
  subject_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  snapshot_json TEXT NOT NULL,
  change_summary TEXT NOT NULL DEFAULT '',
  is_current INTEGER NOT NULL CHECK (is_current IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  UNIQUE(workspace_id, subject_type, subject_id, version_number)
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'waiting_review', 'completed', 'failed', 'cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  input_json TEXT NOT NULL,
  output_json TEXT,
  result_ref_type TEXT,
  result_ref_id TEXT,
  error_code TEXT,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts > 0),
  idempotency_key TEXT,
  created_by TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'started', 'progress', 'waiting_review', 'completed', 'failed', 'cancelled')),
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE generations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  provider_key TEXT NOT NULL,
  model TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT,
  usage_json TEXT,
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  error_code TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE provider_configs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  provider_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  secret_ref TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(workspace_id, provider_key)
);

CREATE TABLE connector_configs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  connector_key TEXT NOT NULL CHECK (connector_key IN ('lark_cli', 'obsidian')),
  display_name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  secret_ref TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  last_checked_at INTEGER,
  last_check_status TEXT CHECK (last_check_status IS NULL OR last_check_status IN ('ok', 'error')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(workspace_id, connector_key)
);

CREATE TABLE sync_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  connector_config_id TEXT NOT NULL REFERENCES connector_configs(id) ON DELETE RESTRICT,
  local_ref_type TEXT NOT NULL,
  local_ref_id TEXT NOT NULL,
  remote_ref TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('import', 'export')),
  content_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE idempotency_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_json TEXT,
  resource_type TEXT,
  resource_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(workspace_id, key)
);

CREATE INDEX projects_workspace_updated_idx ON projects(workspace_id, updated_at DESC);
CREATE INDEX projects_workspace_status_updated_idx ON projects(workspace_id, status, updated_at DESC);
CREATE INDEX projects_workspace_deleted_idx ON projects(workspace_id, deleted_at);
CREATE INDEX assets_project_kind_created_idx ON assets(project_id, kind, created_at DESC);
CREATE INDEX assets_workspace_sha256_idx ON assets(workspace_id, sha256);
CREATE UNIQUE INDEX versions_current_subject_idx ON versions(workspace_id, subject_type, subject_id) WHERE is_current = 1;
CREATE INDEX versions_project_subject_created_idx ON versions(project_id, subject_type, created_at DESC);
CREATE INDEX tasks_workspace_status_created_idx ON tasks(workspace_id, status, created_at);
CREATE INDEX tasks_project_created_idx ON tasks(project_id, created_at DESC);
CREATE UNIQUE INDEX tasks_workspace_idempotency_idx ON tasks(workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX task_events_task_id_idx ON task_events(task_id, id);
CREATE INDEX sync_records_connector_created_idx ON sync_records(connector_config_id, created_at DESC);
CREATE INDEX sync_records_local_ref_idx ON sync_records(local_ref_type, local_ref_id);
