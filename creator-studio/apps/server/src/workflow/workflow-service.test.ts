import { describe, expect, it } from 'vitest'
import { ulid } from 'ulid'

import { withTestDatabase } from '../db/test-database.js'
import { ProjectRepository, WorkspaceRepository } from '../repositories/index.js'
import { WorkflowService } from './workflow-service.js'

const WORKSPACE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAA'
const PROFILE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAB'

describe('WorkflowService', () => {
  it('applies mixed-node commands atomically and rejects stale/cyclic changes', async () => {
    await withTestDatabase(async ({ db, sqlite }) => {
      await new WorkspaceRepository(db).createWithProfile({ workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 }, profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 } })
      const projectId = ulid(10)
      sqlite.prepare("INSERT INTO projects(id,workspace_id,title,status,created_by,created_at,updated_at) VALUES(?,?,'Workflow','draft',?,1,1)").run(projectId, WORKSPACE_ID, PROFILE_ID)
      const service = new WorkflowService(sqlite, new ProjectRepository(db), undefined, () => 1_700_000_000_000)
      const identity = { workspaceId: WORKSPACE_ID, creatorProfileId: PROFILE_ID }
      const empty = await service.getSnapshot(identity, projectId)
      expect(empty.revision).toBe(1)
      const created = await service.applyCommands(identity, projectId, { expectedRevision: 1, commands: [
        { type: 'create_recipe_node', capabilityId: 'image.generate', title: '生成', config: {}, position: { x: 0, y: 0 } },
        { type: 'create_recipe_node', capabilityId: 'image.enhance', title: '增强', config: {}, position: { x: 300, y: 0 } },
      ] })
      expect(created.revision).toBe(2)
      expect(created.nodes).toHaveLength(2)
      const [a, b] = created.nodes
      const connected = await service.applyCommands(identity, projectId, { expectedRevision: 2, commands: [{ type: 'connect_nodes', sourceNodeId: a!.id, sourcePort: 'candidates', targetNodeId: b!.id, targetPort: 'source' }] })
      expect(connected.connections).toHaveLength(1)
      await expect(service.applyCommands(identity, projectId, { expectedRevision: 2, commands: [{ type: 'move_node', nodeId: a!.id, position: { x: 1, y: 1 } }] })).rejects.toMatchObject({ code: 'WORKFLOW_REVISION_CONFLICT' })
      await expect(service.applyCommands(identity, projectId, { expectedRevision: 3, commands: [{ type: 'connect_nodes', sourceNodeId: b!.id, sourcePort: 'candidates', targetNodeId: a!.id, targetPort: 'reference' }] })).rejects.toMatchObject({ code: 'WORKFLOW_CYCLE' })
    })
  })

  it('requires explicit approval before applying a ChangeSet', async () => {
    await withTestDatabase(async ({ db, sqlite }) => {
      await new WorkspaceRepository(db).createWithProfile({ workspace: { id: WORKSPACE_ID, name: 'Studio', slug: 'local', createdAt: 1, updatedAt: 1 }, profile: { id: PROFILE_ID, displayName: 'Creator', createdAt: 1, updatedAt: 1 } })
      const projectId = ulid(20)
      sqlite.prepare("INSERT INTO projects(id,workspace_id,title,status,created_by,created_at,updated_at) VALUES(?,?,'Agent','draft',?,1,1)").run(projectId, WORKSPACE_ID, PROFILE_ID)
      const service = new WorkflowService(sqlite, new ProjectRepository(db), undefined, () => 1_700_000_000_100)
      const identity = { workspaceId: WORKSPACE_ID, creatorProfileId: PROFILE_ID }
      await service.getSnapshot(identity, projectId)
      const proposal = await service.proposeChangeSet(identity, projectId, { baseRevision: 1, summary: '添加图片工具', proposer: { type: 'mcp', name: 'test' }, commands: [{ type: 'create_recipe_node', capabilityId: 'image.generate', title: '图片', config: {}, position: { x: 0, y: 0 } }] })
      expect(proposal.status).toBe('proposed')
      expect((await service.getSnapshot(identity, projectId)).nodes).toHaveLength(0)
      const approved = await service.approveChangeSet(identity, proposal.id, 1)
      expect(approved.status).toBe('applied')
      expect((await service.getSnapshot(identity, projectId)).nodes).toHaveLength(1)
    })
  })
})
