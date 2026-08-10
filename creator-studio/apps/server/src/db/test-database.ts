import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openDatabase, type DatabaseContext } from './database.js'

export interface TestDatabase extends DatabaseContext {
  cleanup: () => Promise<void>
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'creator-studio-db-'))
  const context = await openDatabase({ dataDirectory })
  let cleaned = false

  return {
    ...context,
    cleanup: async () => {
      if (cleaned) return
      cleaned = true
      context.close()
      await rm(dataDirectory, { force: true, recursive: true })
    },
  }
}

export async function withTestDatabase<TResult>(run: (database: TestDatabase) => Promise<TResult> | TResult): Promise<TResult> {
  const database = await createTestDatabase()
  try {
    return await run(database)
  } finally {
    await database.cleanup()
  }
}
