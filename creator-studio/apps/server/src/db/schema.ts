import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
  syncRecords,
  idempotencyRecords,
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
export type IdempotencyRecord = typeof idempotencyRecords.$inferSelect
