import { serve } from '@hono/node-server'
import { CREATOR_STUDIO_METADATA } from '@creator-studio/contracts/metadata'
import { fileURLToPath } from 'node:url'

import { createStaticApp } from './app.js'
import { ArtifactRepository, ArtifactService, configureArtifactRoutes } from './artifacts/index.js'
import { configureCreatorProfileRoutes, CreatorProfileRepository, CreatorProfileService } from './creator-profile/index.js'
import { AssetFileStore, AssetService, configureAssetRoutes } from './assets/index.js'
import { BootstrapService, configurePreferenceRoutes, ensureLocalIdentity } from './bootstrap/index.js'
import { CanvasRepository, CanvasService, configureCanvasRoutes } from './canvas/index.js'
import { configureContextRoutes, ContextService } from './context/index.js'
import { openDatabase } from './db/database.js'
import { ProjectEventEmitter, ProjectEventRepository, configureProjectEventRoutes } from './events/index.js'
import { consoleRequestLogger } from './http/logging.js'
import { createLocalSecurityContext } from './http/security.js'
import {
  OperationRegistry,
  RunService,
  configureRunRoutes,
  operationDefinitions,
  OperationTaskHandler,
  RunRepository,
} from './operations/index.js'
import { fetchHttpClient, GenerationProviderRegistry, ProviderService, SeedGenerationProvider } from './providers/index.js'
import { configureProjectRoutes, ProjectService } from './projects/index.js'
import {
  AssetRepository,
  ConfigRepository,
  GenerationRepository,
  ProjectRepository,
  TaskRepository,
  VersionRepository,
  WorkspaceRepository,
} from './repositories/index.js'
import { configureTaskEventRoutes, configureTaskRoutes, SeedTaskHandler, TaskHandlerRegistry, TaskRecovery, TaskRunner, TaskService } from './tasks/index.js'
import { configureSettingsRoutes, SecretStore, SettingsService } from './settings/index.js'
import { configureVersionRoutes, VersionService } from './versions/index.js'

const port = Number(process.env.CREATOR_STUDIO_PORT ?? 4310)
const webRoot = process.env.CREATOR_STUDIO_WEB_DIST ?? fileURLToPath(new URL('../../web/dist/', import.meta.url))
const database = await openDatabase()
const identity = await ensureLocalIdentity(new WorkspaceRepository(database.db))
const workspaceRepository = new WorkspaceRepository(database.db)
const bootstrapService = new BootstrapService(identity, new TaskRepository(database.db), new ConfigRepository(database.db), workspaceRepository)
const projectService = new ProjectService(
  new ProjectRepository(database.db),
  new TaskRepository(database.db),
  new AssetRepository(database.db),
  new VersionRepository(database.db),
)
const creatorProfileService = new CreatorProfileService(new CreatorProfileRepository(database.db), new ConfigRepository(database.db))
const artifactRepository = new ArtifactRepository(database.db)
const artifactService = new ArtifactService(artifactRepository, new ProjectRepository(database.db))
const canvasService = new CanvasService(
  new CanvasRepository(database.db),
  artifactRepository,
  artifactService,
  new ProjectRepository(database.db),
)
const assetService = new AssetService(
  new AssetRepository(database.db),
  new ProjectRepository(database.db),
  new AssetFileStore(database.filesDirectory),
)
const versionService = new VersionService(new VersionRepository(database.db), new ProjectRepository(database.db))
const taskRepository = new TaskRepository(database.db)
const providerRegistry = new GenerationProviderRegistry([new SeedGenerationProvider()])
const providerService = new ProviderService(new ConfigRepository(database.db), new SecretStore(database.dataDirectory), fetchHttpClient)
const projectEventRepository = new ProjectEventRepository(database.db)
const projectEventEmitter = new ProjectEventEmitter(projectEventRepository)
const operationRegistry = new OperationRegistry(operationDefinitions)
const runRepository = new RunRepository(database.db)
const contextService = new ContextService(new ProjectRepository(database.db), artifactRepository, new CreatorProfileRepository(database.db))
const operationTaskHandler = new OperationTaskHandler(
  operationRegistry,
  artifactRepository,
  new CanvasRepository(database.db),
  runRepository,
  new ProjectRepository(database.db),
  taskRepository,
  providerService,
  projectEventEmitter,
  contextService,
)
const taskHandlers = new TaskHandlerRegistry()
  .register(new SeedTaskHandler(providerRegistry))
  .register(operationTaskHandler)
const taskRunner = new TaskRunner(taskRepository, new GenerationRepository(database.db), taskHandlers)
const taskService = new TaskService(taskRepository, new ProjectRepository(database.db), taskHandlers, taskRunner)
const runService = new RunService(
  runRepository,
  operationRegistry,
  new ProjectRepository(database.db),
  artifactRepository,
  new CanvasRepository(database.db),
  taskRepository,
  taskRunner,
  projectEventEmitter,
)
await taskRepository.deleteWorkspaceEventsBefore(identity.workspace.id, Date.now() - 7 * 24 * 60 * 60 * 1_000)
await new TaskRecovery(taskRepository, taskHandlers).recover(identity.workspace.id)
taskRunner.schedule()
const settingsService = new SettingsService(new ConfigRepository(database.db), new SecretStore(database.dataDirectory))
const app = createStaticApp({
  webRoot,
  healthCheck: async () => ({ database: 'ready', migrations: 'ready' }),
  loadBootstrap: () => bootstrapService.load(),
  requestLogger: consoleRequestLogger,
  security: createLocalSecurityContext({ port, identity }),
  configure: (api) => {
    configurePreferenceRoutes(api, workspaceRepository)
    configureCreatorProfileRoutes(api, creatorProfileService)
    configureProjectRoutes(api, projectService)
    configureContextRoutes(api, contextService)
    configureCanvasRoutes(api, canvasService)
    configureArtifactRoutes(api, artifactService)
    configureRunRoutes(api, runService)
    configureProjectEventRoutes(api, projectEventRepository, new ProjectRepository(database.db))
    configureAssetRoutes(api, assetService)
    configureVersionRoutes(api, versionService)
    configureTaskRoutes(api, taskService)
    configureTaskEventRoutes(api, taskRepository)
    configureSettingsRoutes(api, settingsService)
  },
})

const server = serve(
  {
    fetch: app.fetch,
    hostname: '127.0.0.1',
    port,
  },
  ({ address, port: boundPort }) => {
    console.log(`✅ ${CREATOR_STUDIO_METADATA.name} ${CREATOR_STUDIO_METADATA.version} ready → http://${address}:${boundPort}`)
  },
)

function shutdown() {
  server.close(() => {
    database.close()
    process.exitCode = 0
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
