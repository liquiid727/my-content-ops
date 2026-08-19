// Catalog types only. Depend on contracts and sibling interfaces — never *Registry / ProviderService classes.

import type { ArtifactVersion, OperationDefinition, RecipeCapability } from '@creator-studio/contracts'

import type { ResourceAdapter } from '../knowledge/resource-adapter.js'
import type { OperationExecutor } from '../operations/executors.js'
import type { GenerationProvider, ProviderCapability } from '../providers/generation-provider.js'
import type { HttpJsonClient } from '../providers/openai-text-provider.js'
import type { TaskHandler } from '../tasks/task-handler.js'

export type { RecipeCapability, ResourceAdapter }

export interface GenerationProviderFactory {
  readonly key: string
  readonly capabilities: ReadonlySet<ProviderCapability>
  readonly priority: number
  match(input: {
    workspaceId: string
    capability: ProviderCapability
    configs: Array<{ providerKey: string; enabled: boolean; secretRef: string | null; configJson: string }>
  }): Promise<boolean>
  create(input: {
    workspaceId: string
    capability: ProviderCapability
    configs: Array<{ providerKey: string; enabled: boolean; secretRef: string | null; configJson: string }>
    secrets: { get(ref: string): Promise<string | undefined>; has(ref: string): Promise<boolean> }
    http: HttpJsonClient
  }): Promise<GenerationProvider>
}

export interface RecipeOperationBinding {
  recipeCapabilityId: string
  operationId: string
}

/** Phase 1 holds a dumb snapshot via this structural port. Do not reference implementation classes. */
export interface OperationCatalog {
  getById(id: string): OperationDefinition | undefined
  require(id: string): OperationDefinition
  all(): OperationDefinition[]
  getAvailableOperations(context: {
    artifact: { kind: string; role: string }
    connectedInputs: Array<{ inputSlot: string }>
  }): OperationDefinition[]
}

export interface ProviderResolver {
  resolve(workspaceId: string, capability: ProviderCapability): Promise<GenerationProvider | undefined>
}

export interface AdapterCatalog {
  require(type: ResourceAdapter['type'] | string): ResourceAdapter
}

export interface HandlerCatalog {
  get(type: string): TaskHandler | undefined
  require(type: string): TaskHandler
  register(handler: TaskHandler): HandlerCatalog
}

export interface RecipeCatalog {
  list(): readonly RecipeCapability[]
  require(id: string): RecipeCapability
  bindingFor(recipeCapabilityId: string): RecipeOperationBinding
}

/** Process-local Host events only. RunService / ProviderService take this, not CapabilityHost. */
export interface HostEmitter {
  emit<E extends keyof HostEvents>(event: E, payload: HostEvents[E]): void
}

export interface ProposeOnlyWorkflow {
  getSnapshot(identity: { workspaceId: string; creatorProfileId: string }, projectId: string): Promise<unknown>
  validate(projectId: string, expectedRevision: number, commands: unknown[]): unknown
  proposeChangeSet(identity: { workspaceId: string; creatorProfileId: string }, projectId: string, input: unknown): Promise<unknown>
  getChangeSet(identity: { workspaceId: string; creatorProfileId: string }, id: string): Promise<unknown>
}

export interface HostServices {
  'operations.catalog': OperationCatalog
  'providers.resolver': ProviderResolver
  'knowledge.adapters': AdapterCatalog
  'tasks.handlers': HandlerCatalog
}

export interface HostRegistries {
  'operations.definitions': OperationDefinition
  'operations.executors': OperationExecutor
  'operations.capability': ProviderCapability
  'recipes.capabilities': RecipeCapability
  'recipes.bindings': RecipeOperationBinding
  'generation.factories': GenerationProviderFactory
}

export interface HostEvents {
  'run/create': { workspaceId: string; projectId: string; runId: string; operationId: string }
  'provider/resolve': { workspaceId: string; capability: string; providerKey: string | null; fallback: boolean }
  'operation/post-execute': { runId: string; operationId: string; outputBehavior: string }
}

export interface PreExecuteState {
  workspaceId: string
  projectId: string
  runId: string
  operationId: string
  createdBy: string
  project: {
    title: string
    brief: string
    contentType?: string | null
    targetPlatform?: string | null
    /** From this Run's ProjectRecord. Injectors read state only — do not close over assembly-time Project. */
    personalStyleId: string | null
  }
  sourceVersion?: ArtifactVersion
  sourceKind?: string
  sourceRole?: string
  connectedInputs: ArtifactVersion[]
  /** User/API config. Do not put hydrated binaries here. */
  config: Record<string, unknown>
  personalStyleText?: string
  externalKnowledgeText?: string
  citations?: Array<{ sourceId: string; ref: string; sourceVersion: string | null; readAt: string }>
  layers?: Array<{ name: string; text: string }>
  provider?: GenerationProvider
  abort?: { reason: string }
}

export interface HostWaterfalls {
  'operation/pre-execute': PreExecuteState
}
