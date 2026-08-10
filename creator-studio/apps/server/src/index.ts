import { serve } from '@hono/node-server'
import { CREATOR_STUDIO_METADATA } from '@creator-studio/contracts/metadata'
import { fileURLToPath } from 'node:url'

import { createStaticApp } from './app.js'
import { AssetFileStore, AssetService, configureAssetRoutes } from './assets/index.js'
import { BootstrapService, configurePreferenceRoutes, ensureLocalIdentity } from './bootstrap/index.js'
import { openDatabase } from './db/database.js'
import { consoleRequestLogger } from './http/logging.js'
import { createLocalSecurityContext } from './http/security.js'
import { GenerationProviderRegistry, SeedGenerationProvider } from './providers/index.js'
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
const assetService = new AssetService(
  new AssetRepository(database.db),
  new ProjectRepository(database.db),
  new AssetFileStore(database.filesDirectory),
)
const versionService = new VersionService(new VersionRepository(database.db), new ProjectRepository(database.db))
const taskRepository = new TaskRepository(database.db)
const taskHandlers = new TaskHandlerRegistry().register(new SeedTaskHandler(new GenerationProviderRegistry([new SeedGenerationProvider()])))
const taskRunner = new TaskRunner(taskRepository, new GenerationRepository(database.db), taskHandlers)
const taskService = new TaskService(taskRepository, new ProjectRepository(database.db), taskHandlers, taskRunner)
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
    configureProjectRoutes(api, projectService)
    configurePreferenceRoutes(api, workspaceRepository)
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
    console.log(`${CREATOR_STUDIO_METADATA.name} ${CREATOR_STUDIO_METADATA.version} server ready at http://${address}:${boundPort}`)
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
