import { serializeIsoDateTime, versionSchema, type Version, type VersionSubjectType } from '@creator-studio/contracts'
import { createHash } from 'node:crypto'
import { ulid } from 'ulid'

import type { VersionRecord } from '../db/schema.js'
import { HttpError } from '../http/errors.js'
import { ProjectRepository } from '../repositories/project-repository.js'
import { VersionRepository } from '../repositories/version-repository.js'

function mapVersion(record: VersionRecord): Version {
  return versionSchema.parse({
    id: record.id, projectId: record.projectId, subjectType: record.subjectType, subjectId: record.subjectId,
    versionNumber: record.versionNumber, snapshot: JSON.parse(record.snapshotJson), changeSummary: record.changeSummary,
    isCurrent: record.isCurrent, createdAt: serializeIsoDateTime(new Date(record.createdAt)),
  })
}

export class VersionService {
  constructor(private readonly versions: VersionRepository, private readonly projects: ProjectRepository, private readonly now: () => number = Date.now) {}

  async list(workspaceId: string, projectId: string, subjectType?: VersionSubjectType): Promise<Version[]> {
    if (!(await this.projects.getByWorkspaceAndId(workspaceId, projectId))) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Project 不存在。' })
    return (await this.versions.listByProject(projectId, subjectType)).map(mapVersion)
  }

  async get(workspaceId: string, id: string): Promise<Version> {
    const version = await this.versions.getByWorkspaceAndId(workspaceId, id)
    if (!version) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Version 不存在。' })
    return mapVersion(version)
  }

  async restore(workspaceId: string, creatorProfileId: string, id: string, key: string): Promise<Version> {
    const source = await this.versions.getByWorkspaceAndId(workspaceId, id)
    if (!source) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Version 不存在。' })
    const now = this.now()
    try {
      return mapVersion(this.versions.restoreIdempotent({
        source, id: ulid(now), createdBy: creatorProfileId, createdAt: now,
        idempotency: { id: ulid(now + 1), key, requestHash: createHash('sha256').update(`POST:/versions/${id}/restore`).digest('hex'), expiresAt: now + 86_400_000 },
      }))
    } catch (error) {
      if (error instanceof Error && error.message === 'IDEMPOTENCY_KEY_REUSED') throw new HttpError({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: '此 Idempotency-Key 已用于不同请求。' })
      throw error
    }
  }
}
