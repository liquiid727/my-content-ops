import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  settingsJson: text('settings_json').notNull().default('{}'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const creatorProfiles = sqliteTable('creator_profiles', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  displayName: text('display_name').notNull(),
  avatarAssetId: text('avatar_asset_id'),
  bio: text('bio').notNull().default(''),
  preferencesJson: text('preferences_json').notNull().default('{}'),
  profileJson: text('profile_json').notNull().default('{}'),
  injectionJson: text('injection_json').notNull().default('{}'),
  revision: integer('revision').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  title: text('title').notNull(),
  brief: text('brief').notNull().default(''),
  status: text('status', { enum: ['draft', 'active', 'archived'] }).notNull(),
  contentType: text('content_type').notNull().default('general'),
  targetPlatform: text('target_platform'),
  targetDurationMs: integer('target_duration_ms'),
  coverAssetId: text('cover_asset_id'),
  graphId: text('graph_id'),
  contextId: text('context_id'),
  personalStyleId: text('personal_style_id'),
  settingsJson: text('settings_json').notNull().default('{}'),
  createdBy: text('created_by').notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
})

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  projectId: text('project_id'),
  kind: text('kind', { enum: ['image', 'audio', 'video', 'document', 'other'] }).notNull(),
  source: text('source', { enum: ['upload', 'generated', 'imported'] }).notNull(),
  displayName: text('display_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  storagePath: text('storage_path').notNull().unique(),
  sha256: text('sha256').notNull(),
  width: integer('width'),
  height: integer('height'),
  durationMs: integer('duration_ms'),
  metadataJson: text('metadata_json').notNull().default('{}'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
})

export const versions = sqliteTable('versions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  projectId: text('project_id').notNull(),
  subjectType: text('subject_type', { enum: ['idea', 'topic', 'script', 'rhythm_plan', 'shot', 'asset'] }).notNull(),
  subjectId: text('subject_id').notNull(),
  versionNumber: integer('version_number').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  changeSummary: text('change_summary').notNull().default(''),
  isCurrent: integer('is_current', { mode: 'boolean' }).notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  projectId: text('project_id'),
  parentTaskId: text('parent_task_id'),
  type: text('type').notNull(),
  status: text('status', { enum: ['queued', 'running', 'waiting_review', 'completed', 'failed', 'cancelled'] }).notNull(),
  progress: integer('progress').notNull().default(0),
  inputJson: text('input_json').notNull(),
  outputJson: text('output_json'),
  resultRefType: text('result_ref_type'),
  resultRefId: text('result_ref_id'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(1),
  idempotencyKey: text('idempotency_key'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at'),
  updatedAt: integer('updated_at').notNull(),
})

export const taskEvents = sqliteTable('task_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: text('task_id').notNull(),
  eventType: text('event_type', { enum: ['created', 'started', 'progress', 'waiting_review', 'completed', 'failed', 'cancelled'] }).notNull(),
  payloadJson: text('payload_json').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const generations = sqliteTable('generations', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  projectId: text('project_id'),
  taskId: text('task_id').notNull(),
  providerKey: text('provider_key').notNull(),
  model: text('model').notNull(),
  requestJson: text('request_json').notNull(),
  responseJson: text('response_json'),
  usageJson: text('usage_json'),
  latencyMs: integer('latency_ms'),
  status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull(),
  errorCode: text('error_code'),
  createdAt: integer('created_at').notNull(),
  finishedAt: integer('finished_at'),
})

export const providerConfigs = sqliteTable('provider_configs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  providerKey: text('provider_key').notNull(),
  displayName: text('display_name').notNull(),
  configJson: text('config_json').notNull(),
  secretRef: text('secret_ref'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const connectorConfigs = sqliteTable('connector_configs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  connectorKey: text('connector_key', { enum: ['lark_cli', 'obsidian'] }).notNull(),
  displayName: text('display_name').notNull(),
  configJson: text('config_json').notNull(),
  secretRef: text('secret_ref'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  lastCheckedAt: integer('last_checked_at'),
  lastCheckStatus: text('last_check_status', { enum: ['ok', 'error'] }),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const resourceConnections = sqliteTable('resource_connections', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  type: text('type', { enum: ['obsidian', 'folder', 'lark'] }).notNull(),
  name: text('name').notNull(),
  configJson: text('config_json').notNull().default('{}'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  status: text('status', { enum: ['not_configured', 'installing', 'auth_required', 'ready', 'error'] }).notNull().default('not_configured'),
  lastCheckedAt: integer('last_checked_at'),
  lastError: text('last_error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [index('resource_connections_workspace_idx').on(table.workspaceId, table.updatedAt)])

export const knowledgeSources = sqliteTable('knowledge_sources', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  connectionId: text('connection_id').notNull(),
  remoteRef: text('remote_ref').notNull(),
  title: text('title').notNull(),
  kind: text('kind', { enum: ['document', 'spreadsheet', 'image', 'audio', 'video', 'other'] }).notNull(),
  mimeType: text('mime_type'),
  excerpt: text('excerpt').notNull().default(''),
  sourceUrl: text('source_url'),
  sourceVersion: text('source_version'),
  modifiedAt: integer('modified_at'),
  readAt: integer('read_at'),
  indexedAt: integer('indexed_at'),
  metadataJson: text('metadata_json').notNull().default('{}'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('knowledge_sources_workspace_idx').on(table.workspaceId, table.updatedAt),
  index('knowledge_sources_connection_idx').on(table.connectionId, table.remoteRef),
])

export const projectSources = sqliteTable('project_sources', {
  projectId: text('project_id').notNull(),
  sourceId: text('source_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('project_sources_source_idx').on(table.sourceId, table.projectId)])

export const knowledgeCache = sqliteTable('knowledge_cache', {
  sourceId: text('source_id').primaryKey(),
  text: text('text').notNull(),
  sourceVersion: text('source_version'),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const knowledgeChunks = sqliteTable('knowledge_chunks', {
  sourceId: text('source_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  text: text('text').notNull(),
})

export const syncRecords = sqliteTable('sync_records', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  projectId: text('project_id'),
  connectorConfigId: text('connector_config_id').notNull(),
  localRefType: text('local_ref_type').notNull(),
  localRefId: text('local_ref_id').notNull(),
  remoteRef: text('remote_ref').notNull(),
  direction: text('direction', { enum: ['import', 'export'] }).notNull(),
  contentHash: text('content_hash'),
  status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull(),
  errorMessage: text('error_message'),
  createdAt: integer('created_at').notNull(),
  finishedAt: integer('finished_at'),
})

export const idempotencyRecords = sqliteTable('idempotency_records', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  key: text('key').notNull(),
  requestHash: text('request_hash').notNull(),
  responseStatus: integer('response_status'),
  responseJson: text('response_json'),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const artifacts = sqliteTable(
  'artifacts',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    projectId: text('project_id').notNull(),
    kind: text('kind', { enum: ['text', 'image', 'audio', 'video', 'collection', 'action'] }).notNull(),
    role: text('role').notNull(),
    currentVersionId: text('current_version_id'),
    createdBy: text('created_by').notNull(),
    revision: integer('revision').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (table) => [index('artifacts_project_id_idx').on(table.projectId)],
)

export const artifactVersions = sqliteTable(
  'artifact_versions',
  {
    id: text('id').primaryKey(),
    artifactId: text('artifact_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    parentVersionId: text('parent_version_id'),
    contentRefType: text('content_ref_type', { enum: ['asset', 'inline'] }),
    contentRefId: text('content_ref_id'),
    inlineText: text('inline_text'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    source: text('source', { enum: ['ai', 'user', 'import', 'system'] }).notNull(),
    operationRunId: text('operation_run_id'),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('artifact_versions_artifact_id_idx').on(table.artifactId)],
)

export const canvasNodes = sqliteTable('canvas_nodes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  artifactId: text('artifact_id').notNull(),
  x: real('x').notNull(),
  y: real('y').notNull(),
  width: real('width'),
  height: real('height'),
  collapsed: integer('collapsed', { mode: 'boolean' }).notNull().default(false),
  zIndex: integer('z_index').notNull().default(0),
  renderer: text('renderer').notNull().default('TextNode'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const edges = sqliteTable(
  'edges',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    sourceArtifactId: text('source_artifact_id').notNull(),
    targetArtifactId: text('target_artifact_id').notNull(),
    inputSlot: text('input_slot').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('edges_project_id_idx').on(table.projectId)],
)

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  projectId: text('project_id').notNull(),
  taskId: text('task_id').notNull().unique(),
  operationId: text('operation_id').notNull(),
  sourceArtifactId: text('source_artifact_id'),
  sourceArtifactIdsJson: text('source_artifact_ids_json').notNull().default('[]'),
  inputVersionIdsJson: text('input_version_ids_json').notNull().default('[]'),
  knowledgeSourceIdsJson: text('knowledge_source_ids_json').notNull().default('[]'),
  outputVersionIdsJson: text('output_version_ids_json'),
  outputArtifactIdsJson: text('output_artifact_ids_json'),
  configJson: text('config_json').notNull().default('{}'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const projectEvents = sqliteTable(
  'project_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workspaceId: text('workspace_id').notNull(),
    projectId: text('project_id').notNull(),
    eventType: text('event_type').notNull(),
    payloadJson: text('payload_json').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('project_events_project_id_idx').on(table.projectId, table.id)],
)

export const workflowGraphs = sqliteTable('workflow_graphs', {
  projectId: text('project_id').primaryKey(),
  revision: integer('revision').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const recipes = sqliteTable('recipes', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  projectId: text('project_id').notNull(),
  capabilityId: text('capability_id').notNull(),
  title: text('title').notNull(),
  configJson: text('config_json').notNull().default('{}'),
  revision: integer('revision').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [index('recipes_project_id_idx').on(table.projectId)])

export const workflowNodes = sqliteTable('workflow_nodes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  subjectType: text('subject_type', { enum: ['artifact', 'recipe'] }).notNull(),
  subjectId: text('subject_id').notNull(),
  x: real('x').notNull(),
  y: real('y').notNull(),
  width: real('width'),
  height: real('height'),
  collapsed: integer('collapsed', { mode: 'boolean' }).notNull().default(false),
  zIndex: integer('z_index').notNull().default(0),
  renderer: text('renderer').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [index('workflow_nodes_project_id_idx').on(table.projectId)])

export const workflowConnections = sqliteTable('workflow_connections', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  sourceNodeId: text('source_node_id').notNull(),
  sourcePort: text('source_port').notNull(),
  targetNodeId: text('target_node_id').notNull(),
  targetPort: text('target_port').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('workflow_connections_project_id_idx').on(table.projectId)])

export const collectionItems = sqliteTable('collection_items', {
  collectionArtifactId: text('collection_artifact_id').notNull(),
  itemArtifactId: text('item_artifact_id').notNull(),
  position: integer('position').notNull(),
  selected: integer('selected', { mode: 'boolean' }).notNull().default(false),
}, (table) => [index('collection_items_collection_idx').on(table.collectionArtifactId, table.position)])

export const executionPlans = sqliteTable('execution_plans', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  projectId: text('project_id').notNull(),
  graphRevision: integer('graph_revision').notNull(),
  stepsJson: text('steps_json').notNull(),
  status: text('status', { enum: ['draft', 'queued', 'running', 'completed', 'failed', 'cancelled'] }).notNull(),
  errorJson: text('error_json'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [index('execution_plans_project_id_idx').on(table.projectId, table.createdAt)])

export const changeSets = sqliteTable('change_sets', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  projectId: text('project_id').notNull(),
  baseRevision: integer('base_revision').notNull(),
  summary: text('summary').notNull(),
  proposerJson: text('proposer_json').notNull(),
  commandsJson: text('commands_json').notNull(),
  validationJson: text('validation_json').notNull(),
  status: text('status', { enum: ['proposed', 'approved', 'rejected', 'applied', 'failed'] }).notNull(),
  resultingRevision: integer('resulting_revision'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [index('change_sets_project_id_idx').on(table.projectId, table.createdAt)])

export const databaseSchema = {
  workspaces,
  creatorProfiles,
  projects,
  assets,
  versions,
  tasks,
  taskEvents,
  generations,
  providerConfigs,
  connectorConfigs,
  resourceConnections,
  knowledgeSources,
  projectSources,
  knowledgeCache,
  knowledgeChunks,
  syncRecords,
  idempotencyRecords,
  artifacts,
  artifactVersions,
  canvasNodes,
  edges,
  runs,
  projectEvents,
  workflowGraphs,
  recipes,
  workflowNodes,
  workflowConnections,
  collectionItems,
  executionPlans,
  changeSets,
}

export type WorkspaceRecord = typeof workspaces.$inferSelect
export type CreatorProfileRecord = typeof creatorProfiles.$inferSelect
export type ProjectRecord = typeof projects.$inferSelect
export type AssetRecord = typeof assets.$inferSelect
export type VersionRecord = typeof versions.$inferSelect
export type TaskRecord = typeof tasks.$inferSelect
export type TaskEventRecord = typeof taskEvents.$inferSelect
export type GenerationRecord = typeof generations.$inferSelect
export type ProviderConfigRecord = typeof providerConfigs.$inferSelect
export type ConnectorConfigRecord = typeof connectorConfigs.$inferSelect
export type ResourceConnectionRecord = typeof resourceConnections.$inferSelect
export type KnowledgeSourceRecord = typeof knowledgeSources.$inferSelect
export type ProjectSourceRecord = typeof projectSources.$inferSelect
export type KnowledgeCacheRecord = typeof knowledgeCache.$inferSelect
export type IdempotencyRecord = typeof idempotencyRecords.$inferSelect
export type ArtifactRecord = typeof artifacts.$inferSelect
export type ArtifactVersionRecord = typeof artifactVersions.$inferSelect
export type CanvasNodeRecord = typeof canvasNodes.$inferSelect
export type EdgeRecord = typeof edges.$inferSelect
export type RunRecord = typeof runs.$inferSelect
export type ProjectEventRecord = typeof projectEvents.$inferSelect
export type WorkflowGraphRecord = typeof workflowGraphs.$inferSelect
export type RecipeRecord = typeof recipes.$inferSelect
export type WorkflowNodeRecord = typeof workflowNodes.$inferSelect
export type WorkflowConnectionRecord = typeof workflowConnections.$inferSelect
export type CollectionItemRecord = typeof collectionItems.$inferSelect
export type ExecutionPlanRecord = typeof executionPlans.$inferSelect
export type ChangeSetRecord = typeof changeSets.$inferSelect
