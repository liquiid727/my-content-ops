-- Issue #1: Canvas Runtime 数据模型
-- projects 三列（可空，向后兼容）+ artifacts / artifact_versions / canvas_nodes / edges / runs 表。

ALTER TABLE projects ADD COLUMN graph_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN context_id TEXT;
ALTER TABLE projects ADD COLUMN personal_style_id TEXT REFERENCES creator_profiles(id) ON DELETE SET NULL;

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'image', 'audio', 'video', 'collection', 'action')),
  role TEXT NOT NULL,
  current_version_id TEXT REFERENCES artifact_versions(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE artifact_versions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  parent_version_id TEXT REFERENCES artifact_versions(id) ON DELETE SET NULL,
  content_ref_type TEXT CHECK (content_ref_type IS NULL OR content_ref_type IN ('asset', 'inline')),
  content_ref_id TEXT,
  inline_text TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL CHECK (source IN ('ai', 'user', 'import', 'system')),
  operation_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  UNIQUE(artifact_id, version_number)
);

CREATE TABLE canvas_nodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE RESTRICT,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL,
  height REAL,
  collapsed INTEGER NOT NULL DEFAULT 0 CHECK (collapsed IN (0, 1)),
  z_index INTEGER NOT NULL DEFAULT 0,
  renderer TEXT NOT NULL DEFAULT 'TextNode',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  source_artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE RESTRICT,
  target_artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE RESTRICT,
  input_slot TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL,
  source_artifact_id TEXT REFERENCES artifacts(id) ON DELETE SET NULL,
  input_version_ids_json TEXT NOT NULL DEFAULT '[]',
  output_version_ids_json TEXT,
  output_artifact_ids_json TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX artifacts_project_id_idx ON artifacts(project_id, updated_at DESC);
CREATE INDEX artifact_versions_artifact_id_idx ON artifact_versions(artifact_id, version_number DESC);
CREATE INDEX canvas_nodes_project_id_idx ON canvas_nodes(project_id);
CREATE INDEX edges_project_id_idx ON edges(project_id);
CREATE INDEX edges_source_target_idx ON edges(source_artifact_id, target_artifact_id);
