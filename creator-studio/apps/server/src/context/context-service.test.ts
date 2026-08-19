import { projectContextResponseSchema, projectResponseSchema } from '@creator-studio/contracts'
import { describe, expect, it } from 'vitest'

import { ArtifactRepository, ArtifactService } from '../artifacts/index.js'
import { CanvasRepository, CanvasService } from '../canvas/index.js'
import { configureArtifactRoutes } from '../artifacts/artifact-routes.js'
import { configureCanvasRoutes } from '../canvas/canvas-routes.js'
import { configureContextRoutes, ContextService } from './index.js'
import { CreatorProfileRepository, CreatorProfileService } from '../creator-profile/index.js'
import { withTestDatabase } from '../db/test-database.js'
import { createApiApp } from '../http/app.js'
import { configureProjectRoutes } from '../projects/project-routes.js'
import { ProjectService } from '../projects/project-service.js'
import { AssetRepository, ConfigRepository, ProjectRepository, TaskRepository, VersionRepository, WorkspaceRepository } from '../repositories/index.js'

const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'

async function createHarness(run: (ctx: { app: ReturnType<typeof createApiApp>; projectId: () => string; profiles: CreatorProfileService }) => Promise<void>) {
  await withTestDatabase(async ({ db }) => {
    await new WorkspaceRepository(db).createWithProfile({
      workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 },
      profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 },
    })
    let now = 1_700_000_000_000
    const projectRepository = new ProjectRepository(db)
    const artifactRepository = new ArtifactRepository(db)
    const artifactService = new ArtifactService(artifactRepository, projectRepository, () => now++)
    const canvasRepository = new CanvasRepository(db)
    const canvasService = new CanvasService(canvasRepository, artifactRepository, artifactService, projectRepository, () => now++)
    const projectService = new ProjectService(projectRepository, new TaskRepository(db), new AssetRepository(db), new VersionRepository(db), () => now++)
    const profiles = new CreatorProfileService(new CreatorProfileRepository(db), new ConfigRepository(db), () => now++)
    const contextService = new ContextService(projectRepository, artifactRepository, new CreatorProfileRepository(db))
    const app = createApiApp({
      configure(api) {
        api.use('*', async (context, next) => {
          context.set('workspaceId', WORKSPACE_ID)
          context.set('creatorProfileId', PROFILE_ID)
          await next()
        })
        configureProjectRoutes(api, projectService)
        configureContextRoutes(api, contextService)
        configureCanvasRoutes(api, canvasService)
        configureArtifactRoutes(api, artifactService)
      },
    })
    const created = await app.request('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
      body: JSON.stringify({ title: 'Context project', contentType: 'short_video', brief: '测试上下文' }),
    })
    const projectId = projectResponseSchema.parse(await created.json()).data.id
    await run({ app, projectId: () => projectId, profiles })
  })
}

const VOICE_PROFILE = {
  positioning: { summary: 'AI 应用开发者', nicheTags: ['AI工具'], channels: [] },
  voice: {
    tone: { like: ['轻松', '口语化'], avoid: ['官方腔'] },
    writingStyle: { preferredAspects: ['短句'], sentencePatterns: ['先讲结果'] },
    vocabulary: { common: ['实测'], banned: ['亲亲'] },
  },
}

describe('Context Assembler & GET /projects/:id/context', () => {
  it('returns layers in fixed order with project context', async () => {
    await createHarness(async ({ app, projectId }) => {
      const response = await app.request(`/projects/${projectId()}/context`)
      expect(response.status).toBe(200)
      const data = projectContextResponseSchema.parse(await response.json()).data
      expect(data.layers.map((layer) => layer.name)).toEqual(['system', 'project'])
      expect(data.text).toContain('## system')
      expect(data.text).toContain('项目标题：Context project')
      expect(data.text).toContain('项目简介：测试上下文')
    })
  })

  it('injects upstream connected inputs (edge inputs) into the context', async () => {
    await createHarness(async ({ app, projectId }) => {
      // 建一个带内容的 topic 节点
      const node = await app.request(`/projects/${projectId()}/nodes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'text', role: 'topic', x: 0, y: 0 }),
      })
      const topicArtifactId = (await node.json() as { data: { artifact: { id: string } } }).data.artifact.id
      // 手动写入一个内联版本
      const patch = await app.request(`/artifacts/${topicArtifactId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patch: { text: '这是选题内容正文' }, revision: 1 }),
      })
      expect(patch.status).toBe(200)

      const data = projectContextResponseSchema.parse(await (await app.request(`/projects/${projectId()}/context`)).json()).data
      const connected = data.layers.find((layer) => layer.name === 'connected_inputs')
      expect(connected).toBeDefined()
      expect(connected!.text).toContain('这是选题内容正文')
    })
  })

  it('honors the Personal Style injection toggle (voice off removes voice section)', async () => {
    await createHarness(async ({ app, projectId, profiles }) => {
      const identity = { workspaceId: WORKSPACE_ID, creatorProfileId: PROFILE_ID }
      await profiles.update(identity, PROFILE_ID, 1, {
        profile: VOICE_PROFILE,
        injection: { enabled: true, sections: { voice: true } },
      })

      const withVoice = projectContextResponseSchema.parse(await (await app.request(`/projects/${projectId()}/context?scope=script`)).json()).data
      const voiceLayer = withVoice.layers.find((layer) => layer.name === 'personal_style')
      expect(voiceLayer).toBeDefined()
      expect(voiceLayer!.text).toContain('轻松')
      expect(voiceLayer!.text).toContain('官方腔')

      // 关掉 Voice → 注入文本不含 Voice 内容，但仍保留其它区块（positioning）
      await profiles.update(identity, PROFILE_ID, 2, {
        injection: { enabled: true, sections: { voice: false } },
      })
      const withoutVoice = projectContextResponseSchema.parse(await (await app.request(`/projects/${projectId()}/context?scope=script`)).json()).data
      const mutedLayer = withoutVoice.layers.find((layer) => layer.name === 'personal_style')
      expect(mutedLayer).toBeDefined()
      expect(mutedLayer!.text).not.toContain('轻松')
      expect(mutedLayer!.text).not.toContain('官方腔')
      expect(mutedLayer!.text).toContain('AI 应用开发者')
    })
  })

  it('returns an empty personal_style layer when the global toggle is off', async () => {
    await createHarness(async ({ app, projectId, profiles }) => {
      const identity = { workspaceId: WORKSPACE_ID, creatorProfileId: PROFILE_ID }
      await profiles.update(identity, PROFILE_ID, 1, {
        profile: VOICE_PROFILE,
        injection: { enabled: false, sections: { voice: true } },
      })
      const data = projectContextResponseSchema.parse(await (await app.request(`/projects/${projectId()}/context`)).json()).data
      expect(data.layers.map((layer) => layer.name)).not.toContain('personal_style')
    })
  })
})
