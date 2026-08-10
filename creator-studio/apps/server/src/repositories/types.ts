import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import type { databaseSchema } from '../db/schema.js'

export type DatabaseClient = BetterSQLite3Database<typeof databaseSchema>

export interface Page<T> {
  items: T[]
  hasMore: boolean
}
