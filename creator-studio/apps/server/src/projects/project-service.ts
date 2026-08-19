import {
  projectOverviewSchema,
  projectSchema,
  serializeIsoDateTime,
  type CreateProject,
  type Project,
  type ProjectOverview,
  type ProjectPatch as ProjectPatchContract,
  type ProjectStatus,
} from '@creator-studio/contracts'
import { createHash } from 'node:crypto'
import { ulid } from 'ulid'

import type { ProjectRecord } from '../db/schema.js'
import { createProjectRevisionConflictError, HttpError } from '../http/errors.js'
import { AssetRepository } from '../repositories/asset-repository.js'
import {
  ProjectIdempotencyKeyReusedError,
  ProjectNotFoundError,
  ProjectRepository,
  ProjectRevisionConflictError,
  type ProjectListCursor,
} from '../repositories/project-repository.js'
import { TaskRepository } from '../repositories/task-repository.js'
import { VersionRepository } from '../repositories/version-repository.js'

export interface ProjectServiceIdentity {
  workspaceId: string
  creatorProfileId: string
}

export interface ProjectPage {
  items: Project[]
  hasMore: boolean
  nextCursor?: string
}

export interface ProjectListInput {
  status?: ProjectStatus | undefined
  cursor?: string | undefined
  limit: number
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

function projectNotFound(): HttpError {
  return new HttpError({ status: 404, code: 'NOT_FOUND', message: '未找到指定项目。' })
}

function mapProject(record: ProjectRecord, stage: Project['stage'] = 'idea'): Project {
  return projectSchema.parse({
    id: record.id,
    workspaceId: record.workspaceId,
    title: record.title,
    brief: record.brief,
    status: record.status,
    stage,
    contentType: record.contentType,
    targetPlatform: record.targetPlatform,
    targetDurationMs: record.targetDurationMs,
    graphId: record.graphId,
    contextId: record.contextId,
    personalStyleId: record.personalStyleId,
    revision: record.revision,
    createdAt: serializeIsoDateTime(new Date(record.createdAt)),
    updatedAt: serializeIsoDateTime(new Date(record.updatedAt)),
  })
}

function encodeCursor(cursor: ProjectListCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function decodeCursor(value: string | undefined): ProjectListCursor | undefined {
  if (value === undefined) return undefined

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (
      typeof parsed !== 'object'
      || parsed === null
      || !Number.isSafeInteger((parsed as { updatedAt?: unknown }).updatedAt)
      || typeof (parsed as { id?: unknown }).id !== 'string'
    ) {
      throw new Error('Invalid cursor shape')
    }
    return parsed as ProjectListCursor
  } catch {
    throw new HttpError({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: '项目列表 cursor 无效，请从第一页重新加载。',
      details: { issues: [{ path: ['query', 'cursor'], code: 'invalid_format', message: 'Invalid project cursor' }] },
    })
  }
}

function requestHash(input: CreateProject): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

export class ProjectService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly tasks: TaskRepository,
    private readonly assets: AssetRepository,
    private readonly versions: VersionRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async list(identity: ProjectServiceIdentity, input: ProjectListInput): Promise<ProjectPage> {
    const page = await this.projects.list({
      workspaceId: identity.workspaceId,
      status: input.status,
      cursor: decodeCursor(input.cursor),
      limit: input.limit,
    })
    const last = page.items.at(-1)
    return {
      items: page.items.map((project) => mapProject(project)),
      hasMore: page.hasMore,
      ...(page.hasMore && last ? { nextCursor: encodeCursor({ updatedAt: last.updatedAt, id: last.id }) } : {}),
    }
  }

  create(identity: ProjectServiceIdentity, input: CreateProject, idempotencyKey: string): Project {
    const now = this.now()
    try {
      const result = this.projects.createIdempotent({
        idempotency: {
          id: ulid(now),
          key: idempotencyKey,
          requestHash: requestHash(input),
          expiresAt: now + IDEMPOTENCY_TTL_MS,
          createdAt: now,
        },
        project: {
          id: ulid(now + 1),
          workspaceId: identity.workspaceId,
          title: input.title,
          brief: input.brief,
          status: 'draft',
          contentType: input.contentType,
          targetPlatform: input.targetPlatform ?? null,
          targetDurationMs: input.targetDurationMs ?? null,
          createdBy: identity.creatorProfileId,
          createdAt: now,
          updatedAt: now,
        },
      })
      return mapProject(result.project)
    } catch (error) {
      if (error instanceof ProjectIdempotencyKeyReusedError) {
        throw new HttpError({
          status: 409,
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: '此 Idempotency-Key 已用于不同请求，请生成新的 key。',
        })
      }
      throw error
    }
  }

  async get(identity: ProjectServiceIdentity, projectId: string): Promise<Project> {
    const project = await this.projects.getByWorkspaceAndId(identity.workspaceId, projectId)
    if (!project) throw projectNotFound()
    return mapProject(project)
  }

  async update(
    identity: ProjectServiceIdentity,
    projectId: string,
    revision: number,
    patch: ProjectPatchContract,
  ): Promise<Project> {
    await this.requireProject(identity.workspaceId, projectId)
    try {
      return mapProject(await this.projects.update(projectId, revision, patch, this.now()))
    } catch (error) {
      this.rethrowWriteError(error)
    }
  }

  async archive(identity: ProjectServiceIdentity, projectId: string, revision: number): Promise<Project> {
    await this.requireProject(identity.workspaceId, projectId)
    try {
      return mapProject(await this.projects.update(projectId, revision, { status: 'archived' }, this.now()))
    } catch (error) {
      this.rethrowWriteError(error)
    }
  }

  async overview(identity: ProjectServiceIdentity, projectId: string): Promise<ProjectOverview> {
    const record = await this.requireProject(identity.workspaceId, projectId)
    const [activeTasks, latestAssets, latestVersions] = await Promise.all([
      this.tasks.listActiveByProject(projectId, 5),
      this.assets.listByProject(projectId),
      this.versions.listLatestByProject(projectId, 5),
    ])
    const hasScript = latestVersions.some((version) => version.subjectType === 'script')
    const scriptInProgress = activeTasks.some((task) => task.type.toLowerCase().includes('script'))
    const stage = hasScript || scriptInProgress ? 'script' : 'idea'

    return projectOverviewSchema.parse({
      project: mapProject(record, stage),
      pipeline: [
        { stage: 'idea', status: 'completed', resultRef: null },
        {
          stage: 'script',
          status: hasScript ? 'completed' : scriptInProgress ? 'in_progress' : 'not_started',
          resultRef: latestVersions.find((version) => version.subjectType === 'script')?.id ?? null,
        },
      ],
      activeTasks: activeTasks.map((task) => ({
        id: task.id,
        type: task.type,
        status: task.status,
        progress: task.progress,
      })),
      latestAssets: latestAssets.slice(0, 5).map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        displayName: asset.displayName,
        createdAt: serializeIsoDateTime(new Date(asset.createdAt)),
      })),
      latestVersions: latestVersions.map((version) => ({
        id: version.id,
        subjectType: version.subjectType,
        versionNumber: version.versionNumber,
        createdAt: serializeIsoDateTime(new Date(version.createdAt)),
      })),
      nextAction: { type: 'generate_topics', label: '生成选题方向' },
    })
  }

  private async requireProject(workspaceId: string, projectId: string): Promise<ProjectRecord> {
    const project = await this.projects.getByWorkspaceAndId(workspaceId, projectId)
    if (!project) throw projectNotFound()
    return project
  }

  private rethrowWriteError(error: unknown): never {
    if (error instanceof ProjectRevisionConflictError) {
      throw createProjectRevisionConflictError(error.currentRevision)
    }
    if (error instanceof ProjectNotFoundError) throw projectNotFound()
    throw error
  }
}
