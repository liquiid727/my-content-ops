import { constants } from 'node:fs'
import { access, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import BetterSqlite3 from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { runMigrations } from './migrations.js'
import { databaseSchema } from './schema.js'

export const DEFAULT_BUSY_TIMEOUT_MS = 5_000

export interface OpenDatabaseOptions {
  dataDirectory?: string
  databasePath?: string
  migrationsDirectory?: string
  busyTimeoutMs?: number
}

export interface DatabaseContext {
  dataDirectory: string
  databasePath: string
  filesDirectory: string
  sqlite: BetterSqlite3.Database
  db: BetterSQLite3Database<typeof databaseSchema>
  close: () => void
}

function defaultDataDirectory(): string {
  return resolve(process.env.CREATOR_STUDIO_DATA_DIR ?? join(process.cwd(), 'data'))
}

function defaultMigrationsDirectory(): string {
  return fileURLToPath(new URL('../../migrations/', import.meta.url))
}

export async function openDatabase(options: OpenDatabaseOptions = {}): Promise<DatabaseContext> {
  const databasePath = resolve(options.databasePath ?? join(options.dataDirectory ?? defaultDataDirectory(), 'creator-studio.sqlite'))
  const dataDirectory = resolve(options.dataDirectory ?? dirname(databasePath))
  const filesDirectory = join(dataDirectory, 'files')
  const migrationsDirectory = options.migrationsDirectory ?? defaultMigrationsDirectory()
  const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS

  try {
    await mkdir(dataDirectory, { recursive: true })
    await access(dataDirectory, constants.W_OK)
    await mkdir(filesDirectory, { recursive: true })
  } catch (error) {
    throw new Error(`Creator Studio data directory is not writable: ${dataDirectory}`, { cause: error })
  }

  let sqlite: BetterSqlite3.Database | undefined
  try {
    sqlite = new BetterSqlite3(databasePath)
    sqlite.pragma('foreign_keys = ON')
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma(`busy_timeout = ${busyTimeoutMs}`)
    await runMigrations(sqlite, migrationsDirectory)
    const openedSqlite = sqlite
    let closed = false

    return {
      dataDirectory,
      databasePath,
      filesDirectory,
      sqlite,
      db: drizzle(sqlite, { schema: databaseSchema }),
      close: () => {
        if (closed) return
        closed = true
        openedSqlite.close()
      },
    }
  } catch (error) {
    sqlite?.close()
    throw error
  }
}
