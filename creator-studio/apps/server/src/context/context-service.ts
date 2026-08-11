import {
  injectionSettingsSchema,
  personalStyleSchema,
  type ArtifactVersion,
  type InjectScope,
} from '@creator-studio/contracts'
import { renderContext } from '@creator-studio/contracts'

import { mapArtifactVersion } from '../artifacts/artifact-service.js'
import { ArtifactRepository } from '../artifacts/artifact-repository.js'
import { CreatorProfileRepository } from '../creator-profile/creator-profile-repository.js'
import type { ProjectRecord } from '../db/schema.js'
import { HttpError } from '../http/errors.js'
import { ProjectRepository } from '../repositories/project-repository.js'
import { assembleContext, type ContextLayer } from './assembler.js'

export interface ContextIdentity {
  workspaceId: string
  creatorProfileId: string
}

/** Operation → Personal Style 注入 scope（renderContext 用）。 */
const OPERATION_INJECT_SCOPE: Record<string, InjectScope> = {
  generate_outline: 'outline',
  generate_script: 'script',
  polish: 'script',
  edit: 'script',
  research: 'topic',
  rewrite: 'script',
  expand: 'script',
  shorten: 'script',
  generate_article: 'script',
  branch: 'script',
  generate_cover: 'cover',
  generate_images: 'cover',
  generate_voice: 'voice',
  generate_video: 'video',
  publish: 'publish',
}

/**
 * 统一上下文拼装入口（04-runtime §6）。
 * 同时服务 `GET /projects/:id/context` 与 Operation executor（Personal Style 注入）。
 */
export class ContextService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly artifacts: ArtifactRepository,
    private readonly profiles: CreatorProfileRepository,
  ) {}

  async assembleProject(identity: ContextIdentity, projectId: string, scope: InjectScope = 'project'): Promise<{ layers: ContextLayer[]; text: string }> {
    const project = await this.projects.getByWorkspaceAndId(identity.workspaceId, projectId)
    if (!project) throw new HttpError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Project 不存在。' })

    const personalStyleText = await this.resolvePersonalStyle(identity.workspaceId, project.personalStyleId ?? identity.creatorProfileId, scope)
    const connectedInputs = await this.collectConnectedInputs(projectId)

    return assembleContext({
      project: {
        title: project.title,
        brief: project.brief ?? '',
        contentType: project.contentType,
        targetPlatform: project.targetPlatform,
      },
      scope,
      connectedInputs,
      personalStyleText,
    })
  }

  /** 供 Operation executor 使用：按 operationId 注入 Personal Style 文本。 */
  async resolveOperationStyle(workspaceId: string, project: ProjectRecord | undefined, fallbackProfileId: string, operationId: string): Promise<string> {
    const scope = OPERATION_INJECT_SCOPE[operationId] ?? 'project'
    return this.resolvePersonalStyle(workspaceId, project?.personalStyleId ?? fallbackProfileId, scope)
  }

  async resolvePersonalStyle(workspaceId: string, profileId: string, scope: InjectScope = 'project'): Promise<string> {
    const record = await this.profiles.getByWorkspaceAndId(workspaceId, profileId)
    if (!record) return ''
    const profile = personalStyleSchema.parse(JSON.parse(record.profileJson))
    const injection = injectionSettingsSchema.parse(JSON.parse(record.injectionJson))
    return renderContext(profile, injection, scope)
  }

  /** 项目内所有当前内容版本（作为 Connected Artifact Inputs）。 */
  private async collectConnectedInputs(projectId: string): Promise<ArtifactVersion[]> {
    const artifacts = await this.artifacts.listActiveByProject(projectId)
    const versions: ArtifactVersion[] = []
    for (const artifact of artifacts) {
      if (!artifact.currentVersionId) continue
      const version = await this.artifacts.getVersionById(artifact.currentVersionId)
      if (version) versions.push(mapArtifactVersion(version))
    }
    return versions
  }
}
