import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type BetterSqlite3 from 'better-sqlite3'

interface AppliedMigration {
  version: string
  checksum: string
}

export class MigrationChecksumError extends Error {
  constructor(readonly version: string) {
    super(`Migration ${version} checksum differs from the applied migration`)
    this.name = 'MigrationChecksumError'
  }
}

export class MigrationHistoryError extends Error {
  constructor(readonly version: string) {
    super(`Applied migration ${version} is missing from the migrations directory`)
    this.name = 'MigrationHistoryError'
  }
}

function checksum(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

export async function runMigrations(sqlite: BetterSqlite3.Database, migrationsDirectory: string): Promise<void> {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `)

  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => /^\d+_[a-z0-9_]+\.sql$/.test(filename))
    .sort()

  if (filenames.length === 0) {
    throw new Error(`No SQL migrations found in ${migrationsDirectory}`)
  }

  const available = new Map<string, { checksum: string; sql: string }>()
  for (const filename of filenames) {
    const version = filename.slice(0, -4)
    const content = await readFile(join(migrationsDirectory, filename))
    available.set(version, { checksum: checksum(content), sql: content.toString('utf8') })
  }

  const applied = sqlite.prepare('SELECT version, checksum FROM schema_migrations ORDER BY version').all() as AppliedMigration[]
  for (const migration of applied) {
    const current = available.get(migration.version)
    if (!current) throw new MigrationHistoryError(migration.version)
    if (current.checksum !== migration.checksum) throw new MigrationChecksumError(migration.version)
  }

  const applyMigration = sqlite.transaction((version: string, migration: { checksum: string; sql: string }) => {
    sqlite.exec(migration.sql)
    sqlite
      .prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)')
      .run(version, migration.checksum, Date.now())
  })

  const appliedVersions = new Set(applied.map((migration) => migration.version))
  for (const [version, migration] of available) {
    if (!appliedVersions.has(version)) applyMigration(version, migration)
  }
}
