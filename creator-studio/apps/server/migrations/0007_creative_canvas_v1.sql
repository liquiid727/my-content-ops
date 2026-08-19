CREATE TABLE workflow_graphs (
  project_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  title TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX recipes_project_id_idx ON recipes(project_id);

CREATE TABLE workflow_nodes (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('artifact', 'recipe')),
  subject_id TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL,
  height REAL,
  collapsed INTEGER NOT NULL DEFAULT 0,
  z_index INTEGER NOT NULL DEFAULT 0,
  renderer TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_id, subject_type, subject_id)
);
CREATE INDEX workflow_nodes_project_id_idx ON workflow_nodes(project_id);

CREATE TABLE workflow_connections (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  source_port TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  target_port TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(project_id, source_node_id, source_port, target_node_id, target_port)
);
CREATE INDEX workflow_connections_project_id_idx ON workflow_connections(project_id);

CREATE TABLE collection_items (
  collection_artifact_id TEXT NOT NULL,
  item_artifact_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  selected INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(collection_artifact_id, item_artifact_id)
);
CREATE INDEX collection_items_collection_idx ON collection_items(collection_artifact_id, position);

CREATE TABLE execution_plans (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  graph_revision INTEGER NOT NULL,
  steps_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft', 'queued', 'running', 'completed', 'failed', 'cancelled')),
  error_json TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX execution_plans_project_id_idx ON execution_plans(project_id, created_at);

CREATE TABLE change_sets (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  base_revision INTEGER NOT NULL,
  summary TEXT NOT NULL,
  proposer_json TEXT NOT NULL,
  commands_json TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('proposed', 'approved', 'rejected', 'applied', 'failed')),
  resulting_revision INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX change_sets_project_id_idx ON change_sets(project_id, created_at);

INSERT INTO workflow_graphs(project_id, revision, created_at, updated_at)
SELECT id, 1, created_at, updated_at FROM projects WHERE deleted_at IS NULL;

INSERT INTO workflow_nodes(id, project_id, subject_type, subject_id, x, y, width, height, collapsed, z_index, renderer, created_at, updated_at)
SELECT id, project_id, 'artifact', artifact_id, x, y, width, height, collapsed, z_index, renderer, created_at, updated_at
FROM canvas_nodes;

INSERT OR IGNORE INTO workflow_connections(id, project_id, source_node_id, source_port, target_node_id, target_port, created_at)
SELECT e.id, e.project_id, source_node.id, 'output', target_node.id, e.input_slot, e.created_at
FROM edges e
JOIN workflow_nodes source_node ON source_node.project_id = e.project_id AND source_node.subject_type = 'artifact' AND source_node.subject_id = e.source_artifact_id
JOIN workflow_nodes target_node ON target_node.project_id = e.project_id AND target_node.subject_type = 'artifact' AND target_node.subject_id = e.target_artifact_id;
