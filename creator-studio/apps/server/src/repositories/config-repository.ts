import { and, eq } from 'drizzle-orm'

import {
  connectorConfigs,
  providerConfigs,
  type ConnectorConfigRecord,
  type ProviderConfigRecord,
} from '../db/schema.js'
import type { DatabaseClient } from './types.js'
import { validateJsonText } from './json.js'

export class ConfigRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getProvider(workspaceId: string, providerKey: string): Promise<ProviderConfigRecord | null> {
    return this.db
      .select()
      .from(providerConfigs)
      .where(and(eq(providerConfigs.workspaceId, workspaceId), eq(providerConfigs.providerKey, providerKey)))
      .get() ?? null
  }

  async listProviders(workspaceId: string): Promise<ProviderConfigRecord[]> {
    return this.db.select().from(providerConfigs).where(eq(providerConfigs.workspaceId, workspaceId)).all()
  }

  async saveProvider(input: typeof providerConfigs.$inferInsert): Promise<ProviderConfigRecord> {
    validateJsonText(input.configJson, 'providerConfig.configJson')
    return this.db
      .insert(providerConfigs)
      .values(input)
      .onConflictDoUpdate({
        target: [providerConfigs.workspaceId, providerConfigs.providerKey],
        set: {
          displayName: input.displayName,
          configJson: input.configJson,
          secretRef: input.secretRef ?? null,
          enabled: input.enabled ?? true,
          updatedAt: input.updatedAt,
        },
      })
      .returning()
      .get()
  }

  async getConnector(workspaceId: string, connectorKey: ConnectorConfigRecord['connectorKey']): Promise<ConnectorConfigRecord | null> {
    return this.db
      .select()
      .from(connectorConfigs)
      .where(and(eq(connectorConfigs.workspaceId, workspaceId), eq(connectorConfigs.connectorKey, connectorKey)))
      .get() ?? null
  }

  async listConnectors(workspaceId: string): Promise<ConnectorConfigRecord[]> {
    return this.db.select().from(connectorConfigs).where(eq(connectorConfigs.workspaceId, workspaceId)).all()
  }

  async saveConnector(input: typeof connectorConfigs.$inferInsert): Promise<ConnectorConfigRecord> {
    validateJsonText(input.configJson, 'connectorConfig.configJson')
    return this.db
      .insert(connectorConfigs)
      .values(input)
      .onConflictDoUpdate({
        target: [connectorConfigs.workspaceId, connectorConfigs.connectorKey],
        set: {
          displayName: input.displayName,
          configJson: input.configJson,
          secretRef: input.secretRef ?? null,
          enabled: input.enabled ?? false,
          lastCheckedAt: input.lastCheckedAt ?? null,
          lastCheckStatus: input.lastCheckStatus ?? null,
          updatedAt: input.updatedAt,
        },
      })
      .returning()
      .get()
  }
}
