import { and, eq, lt } from 'drizzle-orm'

import { idempotencyRecords, type IdempotencyRecord } from '../db/schema.js'
import { validateOptionalJsonText } from './json.js'
import type { DatabaseClient } from './types.js'

export interface CompletedIdempotencyResult {
  responseStatus: number
  responseJson: string
  resourceType?: string | null
  resourceId?: string | null
}

export class IdempotencyRepository {
  constructor(private readonly db: DatabaseClient) {}

  async get(workspaceId: string, key: string): Promise<IdempotencyRecord | null> {
    return this.db
      .select()
      .from(idempotencyRecords)
      .where(and(eq(idempotencyRecords.workspaceId, workspaceId), eq(idempotencyRecords.key, key)))
      .get() ?? null
  }

  async create(input: typeof idempotencyRecords.$inferInsert): Promise<IdempotencyRecord> {
    return this.db.insert(idempotencyRecords).values({
      ...input,
      responseJson: validateOptionalJsonText(input.responseJson, 'idempotency.responseJson'),
    }).returning().get()
  }

  async complete(id: string, result: CompletedIdempotencyResult): Promise<IdempotencyRecord> {
    validateOptionalJsonText(result.responseJson, 'idempotency.responseJson')
    const record = this.db
      .update(idempotencyRecords)
      .set({
        responseStatus: result.responseStatus,
        responseJson: result.responseJson,
        resourceType: result.resourceType ?? null,
        resourceId: result.resourceId ?? null,
      })
      .where(eq(idempotencyRecords.id, id))
      .returning()
      .get()
    if (!record) throw new Error(`Idempotency record ${id} was not found`)
    return record
  }

  async deleteExpired(now = Date.now()): Promise<number> {
    return this.db.delete(idempotencyRecords).where(lt(idempotencyRecords.expiresAt, now)).run().changes
  }
}
