import {
  artifactSchema,
  changeSetSchema,
  changeSetValidationSchema,
  executionPlanSchema,
  graphCommandBatchSchema,
  recipeCapabilityIdSchema,
  recipeSchema,
  serializeIsoDateTime,
  workflowConnectionSchema,
  workflowNodeSchema,
  workflowSnapshotSchema,
  type ChangeSet,
  type ChangeSetValidation,
  type ExecutionPlan,
  type GraphCommand,
  type GraphCommandBatch,
  type ProposeChangeSet,
  type Recipe,
  type RecipeCapabilityId,
  type WorkflowConnection,
  type WorkflowNode,
  type WorkflowSnapshot,
} from '@creator-studio/contracts'
import type BetterSqlite3 from 'better-sqlite3'
import { monotonicFactory } from 'ulid'

import { HttpError } from '../http/errors.js'
import { ProjectRepository } from '../repositories/project-repository.js'
import { artifactPortKind, getRecipeCapability, portsCompatible } from './capabilities.js'
import type { RunService } from '../operations/run-service.js'

export interface WorkflowIdentity { workspaceId: string; creatorProfileId: string }

interface GraphRow { project_id: string; revision: number; created_at: number; updated_at: number }
interface NodeRow { id: string; project_id: string; subject_type: 'artifact' | 'recipe'; subject_id: string; x: number; y: number; width: number | null; height: number | null; collapsed: number; z_index: number; renderer: string; created_at: number; updated_at: number }
interface ConnectionRow { id: string; project_id: string; source_node_id: string; source_port: string; target_node_id: string; target_port: string; created_at: number }
interface RecipeRow { id: string; project_id: string; capability_id: RecipeCapabilityId; title: string; config_json: string; revision: number; created_at: number; updated_at: number }
interface ArtifactRow { id: string; project_id: string; kind: string; role: string; current_version_id: string | null; revision: number; created_at: number; updated_at: number }
interface PlanRow { id: string; project_id: string; graph_revision: number; steps_json: string; status: ExecutionPlan['status']; created_at: number; updated_at: number }
interface ChangeSetRow { id: string; project_id: string; base_revision: number; summary: string; proposer_json: string; commands_json: string; validation_json: string; status: ChangeSet['status']; resulting_revision: number | null; created_at: number; updated_at: number }

type ValidationError = ChangeSetValidation['errors'][number]
const MAX_NODES = 500

function iso(value: number): string { return serializeIsoDateTime(new Date(value)) }
function mapNode(row: NodeRow): WorkflowNode {
  const base = { id: row.id, projectId: row.project_id, x: row.x, y: row.y, width: row.width, height: row.height, collapsed: Boolean(row.collapsed), zIndex: row.z_index, renderer: row.renderer, updatedAt: iso(row.updated_at) }
  return workflowNodeSchema.parse(row.subject_type === 'artifact' ? { ...base, subjectType: 'artifact', artifactId: row.subject_id } : { ...base, subjectType: 'recipe', recipeId: row.subject_id })
}
function mapConnection(row: ConnectionRow): WorkflowConnection {
  return workflowConnectionSchema.parse({ id: row.id, projectId: row.project_id, sourceNodeId: row.source_node_id, sourcePort: row.source_port, targetNodeId: row.target_node_id, targetPort: row.target_port, createdAt: iso(row.created_at) })
}
function mapRecipe(row: RecipeRow): Recipe {
  return recipeSchema.parse({ id: row.id, projectId: row.project_id, capabilityId: row.capability_id, title: row.title, config: JSON.parse(row.config_json), revision: row.revision, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) })
}
function mapPlan(row: PlanRow): ExecutionPlan {
  return executionPlanSchema.parse({ id: row.id, projectId: row.project_id, graphRevision: row.graph_revision, steps: JSON.parse(row.steps_json), status: row.status, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) })
}
function mapChangeSet(row: ChangeSetRow): ChangeSet {
  return changeSetSchema.parse({ id: row.id, projectId: row.project_id, baseRevision: row.base_revision, summary: row.summary, proposer: JSON.parse(row.proposer_json), commands: JSON.parse(row.commands_json), validation: JSON.parse(row.validation_json), status: row.status, resultingRevision: row.resulting_revision, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) })
}

export class WorkflowService {
  private readonly newId = monotonicFactory()

  constructor(private readonly sqlite: BetterSqlite3.Database, private readonly projects: ProjectRepository, private readonly runs?: RunService, private readonly now: () => number = Date.now) {}

  async getSnapshot(identity: WorkflowIdentity, projectId: string): Promise<WorkflowSnapshot> {
    await this.requireProject(identity.workspaceId, projectId)
    this.ensureWorkflow(projectId)
    return this.readSnapshot(projectId)
  }

  async applyCommands(identity: WorkflowIdentity, projectId: string, input: GraphCommandBatch): Promise<WorkflowSnapshot> {
    await this.requireProject(identity.workspaceId, projectId)
    const parsed = graphCommandBatchSchema.parse(input)
    this.ensureWorkflow(projectId)
    const validation = this.validate(projectId, parsed.expectedRevision, parsed.commands)
    if (!validation.valid) throw this.validationError(validation)
    this.applyValidated(projectId, identity.workspaceId, parsed.commands, parsed.expectedRevision)
    return this.readSnapshot(projectId)
  }

  async createRecipe(identity: WorkflowIdentity, projectId: string, input: { capabilityId: RecipeCapabilityId; title: string; config: Record<string, unknown> }): Promise<Recipe> {
    await this.requireProject(identity.workspaceId, projectId)
    recipeCapabilityIdSchema.parse(input.capabilityId)
    const now = this.now()
    const id = this.newId(now)
    this.sqlite.prepare('INSERT INTO recipes(id, workspace_id, project_id, capability_id, title, config_json, revision, created_at, updated_at) VALUES(?,?,?,?,?,?,1,?,?)')
      .run(id, identity.workspaceId, projectId, input.capabilityId, input.title, JSON.stringify(input.config), now, now)
    return mapRecipe(this.requireRecipeRow(projectId, id))
  }

  async updateRecipe(identity: WorkflowIdentity, projectId: string, recipeId: string, expectedRevision: number, patch: { title?: string; config?: Record<string, unknown> }): Promise<Recipe> {
    await this.requireProject(identity.workspaceId, projectId)
    const current = this.requireRecipeRow(projectId, recipeId)
    if (current.revision !== expectedRevision) throw new HttpError({ status: 409, code: 'REVISION_CONFLICT', message: '工具配置已更新，请刷新后重试。', details: { currentRevision: current.revision } })
    const now = this.now()
    this.sqlite.prepare('UPDATE recipes SET title=?, config_json=?, revision=revision+1, updated_at=? WHERE id=? AND project_id=?')
      .run(patch.title ?? current.title, patch.config === undefined ? current.config_json : JSON.stringify(patch.config), now, recipeId, projectId)
    return mapRecipe(this.requireRecipeRow(projectId, recipeId))
  }

  async createExecutionPlan(identity: WorkflowIdentity, projectId: string, expectedRevision: number, recipeNodeIds: string[]): Promise<ExecutionPlan> {
    await this.requireProject(identity.workspaceId, projectId)
    this.ensureWorkflow(projectId)
    const snapshot = this.readSnapshot(projectId)
    if (snapshot.revision !== expectedRevision) throw this.revisionConflict(snapshot.revision)
    const selected = new Set(recipeNodeIds)
    const recipeNodes = snapshot.nodes.filter((node): node is Extract<WorkflowNode, { subjectType: 'recipe' }> => node.subjectType === 'recipe' && selected.has(node.id))
    if (recipeNodes.length !== selected.size) throw new HttpError({ status: 422, code: 'PLAN_INVALID_SELECTION', message: '执行计划包含不存在或非工具节点。' })
    const ordered = this.topologicalOrder(recipeNodes.map((node) => node.id), snapshot.connections)
    const recipeById = new Map(snapshot.recipes.map((recipe) => [recipe.id, recipe]))
    const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]))
    const steps = ordered.map((nodeId) => {
      const node = nodeById.get(nodeId) as Extract<WorkflowNode, { subjectType: 'recipe' }>
      const recipe = recipeById.get(node.recipeId)!
      const inputArtifactIds = snapshot.connections.filter((connection) => connection.targetNodeId === nodeId).flatMap((connection) => {
        const source = nodeById.get(connection.sourceNodeId)
        return source?.subjectType === 'artifact' ? [source.artifactId] : []
      })
      const dependsOnRecipeIds = snapshot.connections.filter((connection) => connection.targetNodeId === nodeId).flatMap((connection) => {
        const source = nodeById.get(connection.sourceNodeId)
        return source?.subjectType === 'recipe' ? [source.recipeId] : []
      })
      return { recipeId: recipe.id, capabilityId: recipe.capabilityId, inputArtifactIds, dependsOnRecipeIds }
    })
    const now = this.now()
    const row = { id: this.newId(now), graphRevision: snapshot.revision, steps }
    this.sqlite.prepare('INSERT INTO execution_plans(id, workspace_id, project_id, graph_revision, steps_json, status, created_by, created_at, updated_at) VALUES(?,?,?,?,?,\'draft\',?,?,?)')
      .run(row.id, identity.workspaceId, projectId, row.graphRevision, JSON.stringify(steps), identity.creatorProfileId, now, now)
    return this.getExecutionPlan(identity, row.id)
  }

  async getExecutionPlan(identity: WorkflowIdentity, planId: string): Promise<ExecutionPlan> {
    const row = this.sqlite.prepare('SELECT * FROM execution_plans WHERE id=? AND workspace_id=?').get(planId, identity.workspaceId) as PlanRow | undefined
    if (!row) throw new HttpError({ status: 404, code: 'EXECUTION_PLAN_NOT_FOUND', message: '执行计划不存在。' })
    return mapPlan(row)
  }

  async queueExecutionPlan(identity: WorkflowIdentity, planId: string): Promise<ExecutionPlan> {
    const plan = await this.getExecutionPlan(identity, planId)
    if (plan.status !== 'draft') throw new HttpError({ status: 409, code: 'EXECUTION_PLAN_ALREADY_STARTED', message: '执行计划已经开始或结束。' })
    const now = this.now()
    this.sqlite.prepare("UPDATE execution_plans SET status='queued', updated_at=? WHERE id=?").run(now, planId)
    if (!this.runs) throw new HttpError({ status: 503, code: 'EXECUTION_RUNTIME_UNAVAILABLE', message: '执行运行时未启用。' })
    void this.executePlan(identity, planId).catch(() => undefined)
    return this.getExecutionPlan(identity, planId)
  }

  private async executePlan(identity: WorkflowIdentity, planId: string): Promise<void> {
    const plan = await this.getExecutionPlan(identity, planId)
    this.sqlite.prepare("UPDATE execution_plans SET status='running',updated_at=? WHERE id=?").run(this.now(), planId)
    const operationByCapability: Record<RecipeCapabilityId, string> = {
      'text.draft': 'generate_outline', 'text.rewrite': 'rewrite', 'image.generate': 'generate_image',
      'image.edit': 'edit_image', 'image.outpaint': 'outpaint_image', 'image.variation': 'vary_image', 'image.enhance': 'enhance_image',
    }
    try {
      const outputByRecipe = new Map<string, string>()
      for (let index = 0; index < plan.steps.length; index += 1) {
        const step = plan.steps[index]!
        const recipe = this.requireRecipeRow(plan.projectId, step.recipeId)
        const inputArtifactId = step.inputArtifactIds[0] ?? step.dependsOnRecipeIds.map((recipeId) => outputByRecipe.get(recipeId)).find((id): id is string => Boolean(id))
        const run = await this.runs!.create(identity, operationByCapability[step.capabilityId], {
          projectId: plan.projectId,
          ...(inputArtifactId ? { sourceArtifactId: inputArtifactId } : {}),
          config: JSON.parse(recipe.config_json) as Record<string, unknown>,
          idempotencyKey: `plan:${planId}:step:${index}`,
        })
        const completed = await this.waitForRun(identity, run.run.id)
        const outputArtifactId = completed.outputArtifactIds?.[0]
        if (outputArtifactId) { outputByRecipe.set(step.recipeId, outputArtifactId); this.recordRecipeOutput(plan.projectId, step.recipeId, step.capabilityId, outputArtifactId) }
      }
      this.sqlite.prepare("UPDATE execution_plans SET status='completed',updated_at=? WHERE id=?").run(this.now(), planId)
    } catch (error) {
      const safe = error instanceof Error ? error.message : String(error)
      this.sqlite.prepare("UPDATE execution_plans SET status='failed',error_json=?,updated_at=? WHERE id=?").run(JSON.stringify({ message: safe.slice(0, 1_000) }), this.now(), planId)
    }
  }

  private async waitForRun(identity: WorkflowIdentity, runId: string) {
    for (;;) {
      const run = await this.runs!.get(identity, runId)
      if (run.status === 'completed') return run
      if (run.status === 'failed' || run.status === 'cancelled') throw new Error(run.error?.message ?? `Run ${run.status}`)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  private recordRecipeOutput(projectId: string, recipeId: string, capabilityId: RecipeCapabilityId, artifactId: string): void {
    this.ensureWorkflow(projectId)
    const recipeNode = this.sqlite.prepare("SELECT id FROM workflow_nodes WHERE project_id=? AND subject_type='recipe' AND subject_id=?").get(projectId, recipeId) as { id: string } | undefined
    const artifactNode = this.sqlite.prepare("SELECT id FROM workflow_nodes WHERE project_id=? AND subject_type='artifact' AND subject_id=?").get(projectId, artifactId) as { id: string } | undefined
    if (!recipeNode || !artifactNode) return
    const outputPort = getRecipeCapability(capabilityId).outputPorts[0]?.id ?? 'output'
    const now = this.now()
    this.sqlite.prepare('INSERT OR IGNORE INTO workflow_connections(id,project_id,source_node_id,source_port,target_node_id,target_port,created_at) VALUES(?,?,?,?,?,?,?)').run(this.newId(now), projectId, recipeNode.id, outputPort, artifactNode.id, 'input', now)
    this.sqlite.prepare('UPDATE workflow_graphs SET revision=revision+1,updated_at=? WHERE project_id=?').run(now, projectId)
  }

  async proposeChangeSet(identity: WorkflowIdentity, projectId: string, input: ProposeChangeSet): Promise<ChangeSet> {
    await this.requireProject(identity.workspaceId, projectId)
    this.ensureWorkflow(projectId)
    const validation = this.validate(projectId, input.baseRevision, input.commands)
    const now = this.now()
    const id = this.newId(now)
    this.sqlite.prepare('INSERT INTO change_sets(id, workspace_id, project_id, base_revision, summary, proposer_json, commands_json, validation_json, status, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,\'proposed\',?,?)')
      .run(id, identity.workspaceId, projectId, input.baseRevision, input.summary, JSON.stringify(input.proposer), JSON.stringify(input.commands), JSON.stringify(validation), now, now)
    return this.getChangeSet(identity, id)
  }

  async getChangeSet(identity: WorkflowIdentity, id: string): Promise<ChangeSet> {
    const row = this.sqlite.prepare('SELECT * FROM change_sets WHERE id=? AND workspace_id=?').get(id, identity.workspaceId) as ChangeSetRow | undefined
    if (!row) throw new HttpError({ status: 404, code: 'CHANGE_SET_NOT_FOUND', message: '变更提案不存在。' })
    return mapChangeSet(row)
  }

  async approveChangeSet(identity: WorkflowIdentity, id: string, expectedRevision: number): Promise<ChangeSet> {
    const changeSet = await this.getChangeSet(identity, id)
    if (changeSet.status !== 'proposed') throw new HttpError({ status: 409, code: 'CHANGE_SET_ALREADY_DECIDED', message: '该变更提案已经处理。' })
    if (changeSet.baseRevision !== expectedRevision) throw this.revisionConflict(this.currentRevision(changeSet.projectId))
    const validation = this.validate(changeSet.projectId, expectedRevision, changeSet.commands)
    if (!validation.valid) {
      this.sqlite.prepare('UPDATE change_sets SET validation_json=?, updated_at=? WHERE id=?').run(JSON.stringify(validation), this.now(), id)
      throw this.validationError(validation)
    }
    this.applyValidated(changeSet.projectId, identity.workspaceId, changeSet.commands, expectedRevision)
    const resultingRevision = expectedRevision + 1
    this.sqlite.prepare("UPDATE change_sets SET status='applied', validation_json=?, resulting_revision=?, updated_at=? WHERE id=?")
      .run(JSON.stringify(validation), resultingRevision, this.now(), id)
    return this.getChangeSet(identity, id)
  }

  async rejectChangeSet(identity: WorkflowIdentity, id: string): Promise<ChangeSet> {
    const changeSet = await this.getChangeSet(identity, id)
    if (changeSet.status !== 'proposed') throw new HttpError({ status: 409, code: 'CHANGE_SET_ALREADY_DECIDED', message: '该变更提案已经处理。' })
    this.sqlite.prepare("UPDATE change_sets SET status='rejected', updated_at=? WHERE id=?").run(this.now(), id)
    return this.getChangeSet(identity, id)
  }

  validate(projectId: string, expectedRevision: number, commands: GraphCommand[]): ChangeSetValidation {
    const errors: ValidationError[] = []
    const snapshot = this.readSnapshot(projectId)
    if (snapshot.revision !== expectedRevision) errors.push({ commandIndex: null, code: 'WORKFLOW_REVISION_CONFLICT', message: `画布版本已变更，当前版本为 ${snapshot.revision}。` })
    const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]))
    const recipes = new Map(snapshot.recipes.map((recipe) => [recipe.id, recipe]))
    const artifacts = new Map(snapshot.artifacts.map((artifact) => [artifact.id, artifact]))
    const connections = [...snapshot.connections]
    let nodeCount = nodes.size
    commands.forEach((command, index) => {
      const fail = (code: string, message: string) => errors.push({ commandIndex: index, code, message })
      if (command.type === 'add_artifact_node') {
        const artifact = this.sqlite.prepare('SELECT id, project_id FROM artifacts WHERE id=? AND deleted_at IS NULL').get(command.artifactId) as { id: string; project_id: string } | undefined
        if (!artifact || artifact.project_id !== projectId) fail('ARTIFACT_NOT_FOUND', '作品不存在或不属于当前项目。')
        if ([...nodes.values()].some((node) => node.subjectType === 'artifact' && node.artifactId === command.artifactId)) fail('NODE_ALREADY_EXISTS', '该作品已在画布中。')
        nodeCount += 1
      } else if (command.type === 'create_recipe_node') {
        nodeCount += 1
      } else if (command.type === 'move_node' || command.type === 'resize_node' || command.type === 'remove_node') {
        if (!nodes.has(command.nodeId)) fail('NODE_NOT_FOUND', '节点不存在。')
        if (command.type === 'remove_node') {
          nodes.delete(command.nodeId)
          for (let cursor = connections.length - 1; cursor >= 0; cursor -= 1) if (connections[cursor]?.sourceNodeId === command.nodeId || connections[cursor]?.targetNodeId === command.nodeId) connections.splice(cursor, 1)
        }
      } else if (command.type === 'disconnect_nodes') {
        const connectionIndex = connections.findIndex((connection) => connection.id === command.connectionId)
        if (connectionIndex < 0) fail('CONNECTION_NOT_FOUND', '连线不存在。'); else connections.splice(connectionIndex, 1)
      } else if (command.type === 'update_recipe') {
        if (!recipes.has(command.recipeId)) fail('RECIPE_NOT_FOUND', '工具配置不存在。')
      } else if (command.type === 'connect_nodes') {
        const source = nodes.get(command.sourceNodeId)
        const target = nodes.get(command.targetNodeId)
        if (!source || !target) { fail('NODE_NOT_FOUND', '连线端点不存在。'); return }
        if (source.id === target.id) { fail('WORKFLOW_CYCLE', '节点不能连接到自身。'); return }
        const sourceKind = this.outputKind(source, command.sourcePort, recipes, artifacts)
        const targetKind = this.inputKind(target, command.targetPort, recipes, artifacts)
        if (!sourceKind) fail('SOURCE_PORT_NOT_FOUND', '输出端口不存在。')
        if (!targetKind) fail('TARGET_PORT_NOT_FOUND', '输入端口不存在。')
        if (sourceKind && targetKind && !portsCompatible(sourceKind, targetKind)) fail('PORT_TYPE_MISMATCH', `${sourceKind} 不能连接到 ${targetKind}。`)
        const candidate = { id: `pending-${index}`, projectId, sourceNodeId: source.id, sourcePort: command.sourcePort, targetNodeId: target.id, targetPort: command.targetPort, createdAt: iso(this.now()) }
        if (connections.some((connection) => connection.sourceNodeId === candidate.sourceNodeId && connection.sourcePort === candidate.sourcePort && connection.targetNodeId === candidate.targetNodeId && connection.targetPort === candidate.targetPort)) fail('CONNECTION_ALREADY_EXISTS', '相同连线已经存在。')
        else { connections.push(candidate); if (this.hasCycle(nodes.keys(), connections)) fail('WORKFLOW_CYCLE', '该连线会形成循环依赖。') }
      }
    })
    if (nodeCount > MAX_NODES) errors.push({ commandIndex: null, code: 'WORKFLOW_NODE_LIMIT', message: `单个项目最多 ${MAX_NODES} 个节点。` })
    return changeSetValidationSchema.parse({ valid: errors.length === 0, errors })
  }

  private ensureWorkflow(projectId: string): void {
    const now = this.now()
    this.sqlite.prepare('INSERT OR IGNORE INTO workflow_graphs(project_id, revision, created_at, updated_at) VALUES(?,1,?,?)').run(projectId, now, now)
    this.sqlite.prepare("INSERT OR IGNORE INTO workflow_nodes(id, project_id, subject_type, subject_id, x, y, width, height, collapsed, z_index, renderer, created_at, updated_at) SELECT id, project_id, 'artifact', artifact_id, x, y, width, height, collapsed, z_index, renderer, created_at, updated_at FROM canvas_nodes WHERE project_id=?").run(projectId)
    this.sqlite.prepare("INSERT OR IGNORE INTO workflow_connections(id, project_id, source_node_id, source_port, target_node_id, target_port, created_at) SELECT e.id, e.project_id, s.id, 'output', t.id, e.input_slot, e.created_at FROM edges e JOIN workflow_nodes s ON s.project_id=e.project_id AND s.subject_type='artifact' AND s.subject_id=e.source_artifact_id JOIN workflow_nodes t ON t.project_id=e.project_id AND t.subject_type='artifact' AND t.subject_id=e.target_artifact_id WHERE e.project_id=?").run(projectId)
  }

  private readSnapshot(projectId: string): WorkflowSnapshot {
    const graph = this.sqlite.prepare('SELECT * FROM workflow_graphs WHERE project_id=?').get(projectId) as GraphRow | undefined
    if (!graph) throw new HttpError({ status: 404, code: 'WORKFLOW_NOT_FOUND', message: '项目画布不存在。' })
    const nodeRows = this.sqlite.prepare('SELECT * FROM workflow_nodes WHERE project_id=? ORDER BY created_at,id').all(projectId) as NodeRow[]
    const connectionRows = this.sqlite.prepare('SELECT * FROM workflow_connections WHERE project_id=? ORDER BY created_at,id').all(projectId) as ConnectionRow[]
    const recipeRows = this.sqlite.prepare('SELECT * FROM recipes WHERE project_id=? ORDER BY created_at,id').all(projectId) as RecipeRow[]
    const artifactRows = this.sqlite.prepare('SELECT id,project_id,kind,role,current_version_id,revision,created_at,updated_at FROM artifacts WHERE project_id=? AND deleted_at IS NULL ORDER BY created_at,id').all(projectId) as ArtifactRow[]
    return workflowSnapshotSchema.parse({
      projectId,
      revision: graph.revision,
      nodes: nodeRows.map(mapNode),
      connections: connectionRows.map(mapConnection),
      recipes: recipeRows.map(mapRecipe),
      artifacts: artifactRows.map((row) => artifactSchema.parse({ id: row.id, projectId: row.project_id, kind: row.kind, role: row.role, currentVersionId: row.current_version_id, revision: row.revision, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) })),
    })
  }

  private applyValidated(projectId: string, workspaceId: string, commands: GraphCommand[], expectedRevision: number): void {
    const transaction = this.sqlite.transaction(() => {
      if (this.currentRevision(projectId) !== expectedRevision) throw this.revisionConflict(this.currentRevision(projectId))
      let offset = 0
      for (const command of commands) {
        const now = this.now() + offset++
        if (command.type === 'add_artifact_node') {
          const kind = (this.sqlite.prepare('SELECT kind FROM artifacts WHERE id=?').get(command.artifactId) as { kind: string }).kind
          this.sqlite.prepare('INSERT INTO workflow_nodes(id,project_id,subject_type,subject_id,x,y,width,height,collapsed,z_index,renderer,created_at,updated_at) VALUES(?,?,\'artifact\',?,?,?,NULL,NULL,0,0,?,?,?)')
            .run(this.newId(now), projectId, command.artifactId, command.position.x, command.position.y, `${kind[0]?.toUpperCase()}${kind.slice(1)}Node`, now, now)
        } else if (command.type === 'create_recipe_node') {
          const recipeId = this.newId(now)
          const nodeId = this.newId(now + 1)
          this.sqlite.prepare('INSERT INTO recipes(id,workspace_id,project_id,capability_id,title,config_json,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)').run(recipeId, workspaceId, projectId, command.capabilityId, command.title, JSON.stringify(command.config), now, now)
          this.sqlite.prepare('INSERT INTO workflow_nodes(id,project_id,subject_type,subject_id,x,y,width,height,collapsed,z_index,renderer,created_at,updated_at) VALUES(?,?,\'recipe\',?,?,?,NULL,NULL,0,0,\'RecipeNode\',?,?)').run(nodeId, projectId, recipeId, command.position.x, command.position.y, now, now)
        } else if (command.type === 'move_node') {
          this.sqlite.prepare('UPDATE workflow_nodes SET x=?,y=?,updated_at=? WHERE id=? AND project_id=?').run(command.position.x, command.position.y, now, command.nodeId, projectId)
        } else if (command.type === 'resize_node') {
          this.sqlite.prepare('UPDATE workflow_nodes SET width=?,height=?,updated_at=? WHERE id=? AND project_id=?').run(command.width, command.height, now, command.nodeId, projectId)
        } else if (command.type === 'remove_node') {
          const node = this.sqlite.prepare('SELECT subject_type,subject_id FROM workflow_nodes WHERE id=? AND project_id=?').get(command.nodeId, projectId) as { subject_type: string; subject_id: string }
          this.sqlite.prepare('DELETE FROM workflow_connections WHERE project_id=? AND (source_node_id=? OR target_node_id=?)').run(projectId, command.nodeId, command.nodeId)
          this.sqlite.prepare('DELETE FROM workflow_nodes WHERE id=? AND project_id=?').run(command.nodeId, projectId)
          if (node.subject_type === 'recipe') this.sqlite.prepare('DELETE FROM recipes WHERE id=? AND project_id=?').run(node.subject_id, projectId)
        } else if (command.type === 'connect_nodes') {
          this.sqlite.prepare('INSERT INTO workflow_connections(id,project_id,source_node_id,source_port,target_node_id,target_port,created_at) VALUES(?,?,?,?,?,?,?)').run(this.newId(now), projectId, command.sourceNodeId, command.sourcePort, command.targetNodeId, command.targetPort, now)
        } else if (command.type === 'disconnect_nodes') {
          this.sqlite.prepare('DELETE FROM workflow_connections WHERE id=? AND project_id=?').run(command.connectionId, projectId)
        } else if (command.type === 'update_recipe') {
          const current = this.requireRecipeRow(projectId, command.recipeId)
          this.sqlite.prepare('UPDATE recipes SET title=?,config_json=?,revision=revision+1,updated_at=? WHERE id=? AND project_id=?').run(command.title ?? current.title, command.config === undefined ? current.config_json : JSON.stringify(command.config), now, command.recipeId, projectId)
        }
      }
      this.sqlite.prepare('UPDATE workflow_graphs SET revision=revision+1,updated_at=? WHERE project_id=?').run(this.now(), projectId)
    })
    transaction()
  }

  private outputKind(node: WorkflowNode, port: string, recipes: Map<string, Recipe>, artifacts: Map<string, { kind: string }>) {
    if (node.subjectType === 'artifact') return port === 'output' ? artifactPortKind(artifacts.get(node.artifactId)?.kind ?? 'any') : undefined
    const recipe = recipes.get(node.recipeId); if (!recipe) return undefined
    return getRecipeCapability(recipe.capabilityId).outputPorts.find((candidate) => candidate.id === port)?.kind
  }
  private inputKind(node: WorkflowNode, port: string, recipes: Map<string, Recipe>, artifacts: Map<string, { kind: string }>) {
    if (node.subjectType === 'artifact') return port === 'input' ? artifactPortKind(artifacts.get(node.artifactId)?.kind ?? 'any') : undefined
    const recipe = recipes.get(node.recipeId); if (!recipe) return undefined
    return getRecipeCapability(recipe.capabilityId).inputPorts.find((candidate) => candidate.id === port)?.kind
  }
  private hasCycle(nodeIds: Iterable<string>, connections: WorkflowConnection[]): boolean {
    const degree = new Map([...nodeIds].map((id) => [id, 0]))
    const outgoing = new Map<string, string[]>()
    for (const connection of connections) { degree.set(connection.targetNodeId, (degree.get(connection.targetNodeId) ?? 0) + 1); outgoing.set(connection.sourceNodeId, [...(outgoing.get(connection.sourceNodeId) ?? []), connection.targetNodeId]) }
    const queue = [...degree].filter(([, value]) => value === 0).map(([id]) => id); let visited = 0
    while (queue.length) { const id = queue.shift()!; visited += 1; for (const target of outgoing.get(id) ?? []) { const next = (degree.get(target) ?? 0) - 1; degree.set(target, next); if (next === 0) queue.push(target) } }
    return visited !== degree.size
  }
  private topologicalOrder(selectedIds: string[], connections: WorkflowConnection[]): string[] {
    const selected = new Set(selectedIds); const relevant = connections.filter((connection) => selected.has(connection.sourceNodeId) && selected.has(connection.targetNodeId))
    if (this.hasCycle(selected, relevant)) throw new HttpError({ status: 422, code: 'WORKFLOW_CYCLE', message: '所选工具包含循环依赖。' })
    const degree = new Map(selectedIds.map((id) => [id, 0])); const outgoing = new Map<string, string[]>()
    for (const edge of relevant) { degree.set(edge.targetNodeId, (degree.get(edge.targetNodeId) ?? 0) + 1); outgoing.set(edge.sourceNodeId, [...(outgoing.get(edge.sourceNodeId) ?? []), edge.targetNodeId]) }
    const queue = selectedIds.filter((id) => degree.get(id) === 0); const order: string[] = []
    while (queue.length) { const id = queue.shift()!; order.push(id); for (const target of outgoing.get(id) ?? []) { const next = degree.get(target)! - 1; degree.set(target, next); if (next === 0) queue.push(target) } }
    return order
  }
  private currentRevision(projectId: string): number { return (this.sqlite.prepare('SELECT revision FROM workflow_graphs WHERE project_id=?').get(projectId) as { revision: number }).revision }
  private requireRecipeRow(projectId: string, recipeId: string): RecipeRow { const row = this.sqlite.prepare('SELECT * FROM recipes WHERE id=? AND project_id=?').get(recipeId, projectId) as RecipeRow | undefined; if (!row) throw new HttpError({ status: 404, code: 'RECIPE_NOT_FOUND', message: '工具配置不存在。' }); return row }
  private revisionConflict(currentRevision: number) { return new HttpError({ status: 409, code: 'WORKFLOW_REVISION_CONFLICT', message: '画布已在其他位置更新，请刷新后重试。', details: { currentRevision } }) }
  private validationError(validation: ChangeSetValidation) { const first = validation.errors[0]; return new HttpError({ status: first?.code === 'WORKFLOW_REVISION_CONFLICT' ? 409 : 422, code: first?.code ?? 'WORKFLOW_VALIDATION_FAILED', message: first?.message ?? '画布变更无效。', details: validation }) }
  private async requireProject(workspaceId: string, projectId: string) { if (!await this.projects.getByWorkspaceAndId(workspaceId, projectId)) throw new HttpError({ status: 404, code: 'NOT_FOUND', message: 'Project 不存在。' }) }
}
