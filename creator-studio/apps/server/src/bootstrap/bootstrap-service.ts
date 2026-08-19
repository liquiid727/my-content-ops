import { bootstrapDataSchema, creatorPreferencesSchema, type BootstrapData } from '@creator-studio/contracts'

import type { LocalIdentity } from './identity.js'
import { ConfigRepository } from '../repositories/config-repository.js'
import { TaskRepository } from '../repositories/task-repository.js'
import { WorkspaceRepository } from '../repositories/workspace-repository.js'

export class BootstrapService {
  constructor(
    private readonly identity: LocalIdentity,
    private readonly tasks: TaskRepository,
    private readonly configs: ConfigRepository,
    private readonly workspaces?: WorkspaceRepository,
  ) {}

  async load(): Promise<BootstrapData> {
    const workspaceId = this.identity.workspace.id
    const [activeTasks, providers, connectors] = await Promise.all([
      this.tasks.listActiveByWorkspace(workspaceId),
      this.configs.listProviders(workspaceId),
      this.configs.listConnectors(workspaceId),
    ])
    const profile = await this.workspaces?.getProfile(workspaceId) ?? this.identity.creatorProfile
    const preferences = creatorPreferencesSchema.parse(JSON.parse(profile.preferencesJson))

    return bootstrapDataSchema.parse({
      workspace: {
        id: workspaceId,
        name: this.identity.workspace.name,
      },
      creatorProfile: {
        id: profile.id,
        displayName: profile.displayName,
        preferences,
      },
      activeTasks: activeTasks.map((task) => ({
        id: task.id,
        type: task.type,
        status: task.status,
        progress: task.progress,
      })),
      capabilities: {
        providers: providers.some((config) => config.enabled),
        connectors: connectors.some((config) => config.enabled),
      },
      settings: {
        providers: providers.map((config) => ({
          key: config.providerKey,
          displayName: config.displayName,
          configured: config.secretRef !== null,
          enabled: config.enabled,
        })),
        connectors: connectors.map((config) => ({
          key: config.connectorKey,
          displayName: config.displayName,
          configured: config.secretRef !== null,
          enabled: config.enabled,
        })),
      },
    })
  }
}
