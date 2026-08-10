import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { tasks, versions } from '../db/schema.js'
import { withTestDatabase } from '../db/test-database.js'
import { AssetRepository } from './asset-repository.js'
import { ConfigRepository } from './config-repository.js'
import { IdempotencyRepository } from './idempotency-repository.js'
import { ProjectRepository, ProjectRevisionConflictError } from './project-repository.js'
import { TaskRepository } from './task-repository.js'
import { VersionRepository } from './version-repository.js'
import { WorkspaceRepository } from './workspace-repository.js'

const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'
const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAC'

describe('Foundation repositories', () => {
  it('creates a Workspace/Profile atomically and updates Projects with revision checks', async () => {
    await withTestDatabase(async ({ db }) => {
      const workspaceRepository = new WorkspaceRepository(db)
      const projectRepository = new ProjectRepository(db)
      const createdAt = 1_700_000_000_000
      const { workspace, profile } = await workspaceRepository.createWithProfile({
        workspace: { id: WORKSPACE_ID, name: 'My Studio', slug: 'local', createdAt, updatedAt: createdAt },
        profile: { id: PROFILE_ID, displayName: 'Local Creator', createdAt, updatedAt: createdAt },
      })
      const project = await projectRepository.create({
        id: PROJECT_ID,
        workspaceId: workspace.id,
        title: 'Foundation',
        status: 'draft',
        createdBy: profile.id,
        createdAt,
        updatedAt: createdAt,
      })

      expect(await workspaceRepository.getBySlug('local')).toMatchObject({ id: WORKSPACE_ID })
      expect(await workspaceRepository.getProfile(WORKSPACE_ID)).toMatchObject({ id: PROFILE_ID })
      const updated = await projectRepository.update(project.id, 1, { title: 'Foundation updated' }, createdAt + 1)
      expect(updated).toMatchObject({ title: 'Foundation updated', revision: 2 })
      await expect(projectRepository.update(project.id, 1, { title: 'Stale' })).rejects.toMatchObject({
        name: ProjectRevisionConflictError.name,
        currentRevision: 2,
      })
      expect((await projectRepository.list({ workspaceId: WORKSPACE_ID })).items).toHaveLength(1)
    })
  })

  it('stores Assets and switches the current Version in one transaction', async () => {
    await withTestDatabase(async ({ db }) => {
      const workspaceRepository = new WorkspaceRepository(db)
      const projectRepository = new ProjectRepository(db)
      const assetRepository = new AssetRepository(db)
      const versionRepository = new VersionRepository(db)
      const now = 1_700_000_000_000
      await workspaceRepository.createWithProfile({
        workspace: { id: WORKSPACE_ID, name: 'My Studio', slug: 'local', createdAt: now, updatedAt: now },
        profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: now, updatedAt: now },
      })
      await projectRepository.create({ id: PROJECT_ID, workspaceId: WORKSPACE_ID, title: 'Project', status: 'draft', createdBy: PROFILE_ID, createdAt: now, updatedAt: now })
      const asset = await assetRepository.create({
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAD', workspaceId: WORKSPACE_ID, projectId: PROJECT_ID,
        kind: 'image', source: 'upload', displayName: 'frame.png', mimeType: 'image/png', sizeBytes: 12,
        storagePath: 'assets/frame.png', sha256: 'abc', createdBy: PROFILE_ID, createdAt: now, updatedAt: now,
      })
      const baseVersion = { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, subjectType: 'asset' as const, subjectId: asset.id, createdBy: PROFILE_ID }
      await versionRepository.createCurrent({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAE', ...baseVersion, snapshotJson: '{"v":1}', createdAt: now })
      await versionRepository.createCurrent({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAF', ...baseVersion, snapshotJson: '{"v":2}', createdAt: now + 1 })

      const records = await versionRepository.list('asset', asset.id)
      expect(records.map((record) => [record.versionNumber, record.isCurrent])).toEqual([[1, false], [2, true]])
      expect(db.select().from(versions).where(eq(versions.isCurrent, true)).all()).toHaveLength(1)
    })
  })

  it('writes Task state and events atomically, including rollback on an invalid event', async () => {
    await withTestDatabase(async ({ db }) => {
      const workspaceRepository = new WorkspaceRepository(db)
      const taskRepository = new TaskRepository(db)
      const now = 1_700_000_000_000
      await workspaceRepository.createWithProfile({
        workspace: { id: WORKSPACE_ID, name: 'My Studio', slug: 'local', createdAt: now, updatedAt: now },
        profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: now, updatedAt: now },
      })
      const task = await taskRepository.enqueue({
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAG', workspaceId: WORKSPACE_ID, type: 'seed', inputJson: '{}',
        createdBy: PROFILE_ID, createdAt: now, event: { payloadJson: '{}', createdAt: now },
      })
      expect(await taskRepository.listEventsAfter(task.id, 0)).toHaveLength(1)

      await expect(taskRepository.transition({
        taskId: task.id, status: 'running', progress: 10, eventType: 'invalid' as 'progress', payloadJson: '{}', updatedAt: now + 1,
      })).rejects.toThrow()
      expect(db.select().from(tasks).where(eq(tasks.id, task.id)).get()).toMatchObject({ status: 'queued', progress: 0 })

      const claimed = await taskRepository.claimNext(now + 2)
      expect(claimed).toMatchObject({ id: task.id, status: 'running', attemptCount: 1 })
      expect(await taskRepository.listEventsAfter(task.id, 0)).toHaveLength(2)
    })
  })

  it('persists Provider/Connector configs and Idempotency results through repository interfaces', async () => {
    await withTestDatabase(async ({ db }) => {
      const workspaceRepository = new WorkspaceRepository(db)
      const configRepository = new ConfigRepository(db)
      const idempotencyRepository = new IdempotencyRepository(db)
      const now = 1_700_000_000_000
      await workspaceRepository.createWithProfile({
        workspace: { id: WORKSPACE_ID, name: 'My Studio', slug: 'local', createdAt: now, updatedAt: now },
        profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: now, updatedAt: now },
      })
      await configRepository.saveProvider({
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAH', workspaceId: WORKSPACE_ID, providerKey: 'seed', displayName: 'Seed',
        configJson: '{}', enabled: true, createdAt: now, updatedAt: now,
      })
      await expect(configRepository.saveProvider({
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAM', workspaceId: WORKSPACE_ID, providerKey: 'invalid', displayName: 'Invalid',
        configJson: '{not-json', enabled: true, createdAt: now, updatedAt: now,
      })).rejects.toThrow('providerConfig.configJson must contain valid JSON')
      await configRepository.saveConnector({
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAJ', workspaceId: WORKSPACE_ID, connectorKey: 'obsidian', displayName: 'Vault',
        configJson: '{}', enabled: false, createdAt: now, updatedAt: now,
      })
      const record = await idempotencyRepository.create({
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAK', workspaceId: WORKSPACE_ID, key: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        requestHash: 'hash', expiresAt: now + 86_400_000, createdAt: now,
      })
      await idempotencyRepository.complete(record.id, { responseStatus: 201, responseJson: '{"ok":true}', resourceType: 'project', resourceId: PROJECT_ID })

      expect(await configRepository.getProvider(WORKSPACE_ID, 'seed')).toMatchObject({ enabled: true })
      expect(await configRepository.getConnector(WORKSPACE_ID, 'obsidian')).toMatchObject({ enabled: false })
      expect(await idempotencyRepository.get(WORKSPACE_ID, record.key)).toMatchObject({ responseStatus: 201, resourceId: PROJECT_ID })
    })
  })
})
