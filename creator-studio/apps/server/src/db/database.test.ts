import { access, appendFile, chmod, copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { openDatabase } from './database.js'
import { MigrationChecksumError } from './migrations.js'
import { createTestDatabase, withTestDatabase } from './test-database.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe('SQLite bootstrap and migrations', () => {
  it('creates every Foundation table, index, foreign key and check constraint', async () => {
    const database = await createTestDatabase()
    try {
      const tables = (database.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name)
      const indexes = (database.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>).map((row) => row.name)

      expect(tables).toEqual(expect.arrayContaining([
        'schema_migrations', 'workspaces', 'creator_profiles', 'projects', 'assets', 'versions', 'tasks',
        'task_events', 'generations', 'provider_configs', 'connector_configs', 'sync_records', 'idempotency_records',
        'artifacts', 'artifact_versions', 'canvas_nodes', 'edges', 'runs',
      ]))
      expect(indexes).toEqual(expect.arrayContaining([
        'projects_workspace_updated_idx', 'assets_project_kind_created_idx', 'versions_current_subject_idx',
        'tasks_workspace_idempotency_idx', 'task_events_task_id_idx', 'sync_records_local_ref_idx',
        'artifacts_project_id_idx', 'artifact_versions_artifact_id_idx', 'edges_project_id_idx',
      ]))

      expect(() => database.sqlite.prepare("INSERT INTO projects (id, workspace_id, title, status, created_by, created_at, updated_at) VALUES ('p', 'missing', 'Bad', 'draft', 'missing', 1, 1)").run()).toThrow()
      expect(() => database.sqlite.prepare("INSERT INTO tasks (id, workspace_id, type, status, progress, input_json, created_by, created_at, updated_at) VALUES ('t', 'missing', 'seed', 'queued', 101, '{}', 'missing', 1, 1)").run()).toThrow()
    } finally {
      await database.cleanup()
    }
  })

  it('adds creator profile json columns with backward-compatible defaults', async () => {
    const database = await createTestDatabase()
    try {
      const columns = (database.sqlite.prepare('PRAGMA table_info(creator_profiles)').all() as Array<{ name: string; dflt_value: string | null }>).filter((column) =>
        ['profile_json', 'injection_json', 'revision'].includes(column.name),
      )
      expect(columns.map((column) => column.name)).toEqual(['profile_json', 'injection_json', 'revision'])
      expect(columns.find((column) => column.name === 'profile_json')?.dflt_value).toBe("'{}'")
      expect(columns.find((column) => column.name === 'injection_json')?.dflt_value).toBe("'{}'")
      expect(columns.find((column) => column.name === 'revision')?.dflt_value).toBe('1')

      database.sqlite
        .prepare("INSERT INTO workspaces (id, name, slug, settings_json, created_at, updated_at) VALUES ('w1', 'Test', 'test', '{}', 1, 1)")
        .run()
      database.sqlite
        .prepare(
          "INSERT INTO creator_profiles (id, workspace_id, display_name, bio, preferences_json, created_at, updated_at) VALUES ('p1', 'w1', 'Legacy', '', '{}', 1, 1)",
        )
        .run()
      const row = database.sqlite.prepare("SELECT profile_json, injection_json, revision FROM creator_profiles WHERE id = 'p1'").get() as {
        profile_json: string
        injection_json: string
        revision: number
      }
      expect(row).toEqual({ profile_json: '{}', injection_json: '{}', revision: 1 })
    } finally {
      await database.cleanup()
    }
  })

  it('adds canvas binding columns to projects and creates the canvas runtime tables', async () => {
    const database = await createTestDatabase()
    try {
      const projectColumns = (database.sqlite.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>).map((column) => column.name)
      expect(projectColumns).toEqual(expect.arrayContaining(['graph_id', 'context_id', 'personal_style_id']))

      const artifactsColumns = (database.sqlite.prepare('PRAGMA table_info(artifacts)').all() as Array<{ name: string }>).map((column) => column.name)
      expect(artifactsColumns).toEqual(expect.arrayContaining(['id', 'workspace_id', 'project_id', 'kind', 'role', 'current_version_id', 'deleted_at']))

      const versionsColumns = (database.sqlite.prepare('PRAGMA table_info(artifact_versions)').all() as Array<{ name: string }>).map((column) => column.name)
      expect(versionsColumns).toEqual(expect.arrayContaining(['id', 'artifact_id', 'version_number', 'content_ref_type', 'content_ref_id', 'inline_text', 'source']))

      const nodesColumns = (database.sqlite.prepare('PRAGMA table_info(canvas_nodes)').all() as Array<{ name: string }>).map((column) => column.name)
      expect(nodesColumns).toEqual(expect.arrayContaining(['id', 'project_id', 'artifact_id', 'x', 'y', 'collapsed', 'z_index', 'renderer']))

      const runsColumns = (database.sqlite.prepare('PRAGMA table_info(runs)').all() as Array<{ name: string }>).map((column) => column.name)
      expect(runsColumns).toEqual(expect.arrayContaining(['id', 'workspace_id', 'project_id', 'task_id', 'operation_id', 'config_json']))

      // runs.task_id is unique — a second run for the same task must be rejected.
      database.sqlite.prepare("INSERT INTO workspaces (id, name, slug, settings_json, created_at, updated_at) VALUES ('w1', 'Test', 'test', '{}', 1, 1)").run()
      database.sqlite
        .prepare("INSERT INTO creator_profiles (id, workspace_id, display_name, bio, preferences_json, created_at, updated_at) VALUES ('cp1', 'w1', 'Creator', '', '{}', 1, 1)")
        .run()
      database.sqlite
        .prepare("INSERT INTO projects (id, workspace_id, title, status, created_by, created_at, updated_at) VALUES ('p1', 'w1', 'P', 'draft', 'cp1', 1, 1)")
        .run()
      database.sqlite
        .prepare("INSERT INTO tasks (id, workspace_id, project_id, type, status, progress, input_json, created_by, created_at, updated_at) VALUES ('t1', 'w1', 'p1', 'op', 'queued', 0, '{}', 'cp1', 1, 1)")
        .run()
      database.sqlite
        .prepare("INSERT INTO runs (id, workspace_id, project_id, task_id, operation_id, created_at, updated_at) VALUES ('r1', 'w1', 'p1', 't1', 'op', 1, 1)")
        .run()
      expect(() =>
        database.sqlite
          .prepare("INSERT INTO runs (id, workspace_id, project_id, task_id, operation_id, created_at, updated_at) VALUES ('r2', 'w1', 'p1', 't1', 'op', 1, 1)")
          .run(),
      ).toThrow()
    } finally {
      await database.cleanup()
    }
  })

  it('enables foreign keys, WAL, busy timeout and applies migrations once', async () => {
    const database = await createTestDatabase()
    try {
      expect(database.sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(database.sqlite.pragma('journal_mode', { simple: true })).toBe('wal')
      expect(database.sqlite.pragma('busy_timeout', { simple: true })).toBe(5_000)
      expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 5 })
    } finally {
      await database.cleanup()
    }
  })

  it('rejects startup when an applied migration checksum changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'creator-studio-migration-test-'))
    temporaryDirectories.push(root)
    const migrationsDirectory = join(root, 'migrations')
    const dataDirectory = join(root, 'data')
    await mkdir(migrationsDirectory)
    const migrationFile = join(migrationsDirectory, '0001_foundation.sql')
    await copyFile(fileURLToPath(new URL('../../migrations/0001_foundation.sql', import.meta.url)), migrationFile)

    const first = await openDatabase({ dataDirectory, migrationsDirectory })
    first.close()
    await appendFile(migrationFile, '\n-- changed after application\n')

    await expect(openDatabase({ dataDirectory, migrationsDirectory })).rejects.toBeInstanceOf(MigrationChecksumError)
  })

  it('creates default directories and fails clearly when the data path cannot be a directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'creator-studio-data-test-'))
    temporaryDirectories.push(root)
    const dataDirectory = join(root, 'nested', 'data')
    const database = await openDatabase({ dataDirectory })
    database.close()
    await expect(access(join(dataDirectory, 'creator-studio.sqlite'))).resolves.toBeUndefined()
    await expect(access(join(dataDirectory, 'files'))).resolves.toBeUndefined()

    const occupiedPath = join(root, 'occupied')
    await writeFile(occupiedPath, 'not a directory')
    await expect(openDatabase({ dataDirectory: occupiedPath })).rejects.toThrow(`Creator Studio data directory is not writable: ${occupiedPath}`)

    if (process.platform !== 'win32') {
      const readOnlyPath = join(root, 'read-only')
      await mkdir(readOnlyPath)
      await chmod(readOnlyPath, 0o500)
      try {
        await expect(openDatabase({ dataDirectory: readOnlyPath })).rejects.toThrow(`Creator Studio data directory is not writable: ${readOnlyPath}`)
      } finally {
        await chmod(readOnlyPath, 0o700)
      }
    }
  })

  it('removes the isolated test database directory after the callback', async () => {
    let dataDirectory = ''
    await withTestDatabase((database) => {
      dataDirectory = database.dataDirectory
      expect(database.databasePath.startsWith(dataDirectory)).toBe(true)
    })

    await expect(access(dataDirectory)).rejects.toThrow()
  })
})
