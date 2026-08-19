import { describe, expect, it } from 'vitest'

import {
  artifactSchema,
  artifactVersionSchema,
  canvasNodeSchema,
  createProjectSchema,
  edgeSchema,
  graphSchema,
  operationDefinitionSchema,
  projectSchema,
  runSchema,
} from './index.js'

const ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const NODE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW'
const EDGE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAX'
const VERSION_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY'
const TASK_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAZ'
const RUN_ID = '01ARZ3NDEKTSV4RRFFQ69G5FBA'

describe('canvas-runtime contracts', () => {
  it('validates an Artifact with kind + role', () => {
    const artifact = artifactSchema.parse({
      id: ID,
      projectId: ID,
      kind: 'text',
      role: 'topic',
      currentVersionId: null,
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
    })
    expect(artifact).toMatchObject({ kind: 'text', role: 'topic' })
    expect(artifactSchema.safeParse({ id: ID, projectId: ID, kind: 'audio', role: 'voice' }).success).toBe(false)
    expect(artifactSchema.safeParse({ id: ID, projectId: ID, kind: 'gif', role: 'cover' }).success).toBe(false)
  })

  it('validates an ArtifactVersion with inline or asset contentRef', () => {
    const inline = artifactVersionSchema.parse({
      id: VERSION_ID,
      artifactId: ID,
      versionNumber: 1,
      parentVersionId: null,
      contentRef: { type: 'inline', text: '第一版大纲' },
      source: 'ai',
      operationRunId: RUN_ID,
      createdBy: ID,
      createdAt: '2026-08-10T00:00:00.000Z',
    })
    expect(inline.contentRef).toEqual({ type: 'inline', text: '第一版大纲' })
    expect(inline.metadata).toEqual({})

    const asset = artifactVersionSchema.parse({
      id: VERSION_ID,
      artifactId: ID,
      versionNumber: 2,
      parentVersionId: VERSION_ID,
      contentRef: { type: 'asset', id: ID },
      source: 'ai',
      operationRunId: null,
      createdBy: ID,
      createdAt: '2026-08-10T00:00:00.000Z',
    })
    expect(asset).toMatchObject({ versionNumber: 2, source: 'ai' })
    expect(artifactVersionSchema.safeParse({ id: VERSION_ID, artifactId: ID, versionNumber: 1, contentRef: { type: 'unknown', id: ID }, source: 'ai' }).success).toBe(false)
    expect(artifactVersionSchema.safeParse({ id: VERSION_ID, artifactId: ID, versionNumber: 0, source: 'ai' }).success).toBe(false)
  })

  it('validates CanvasNode layout and renderer defaults', () => {
    const node = canvasNodeSchema.parse({
      id: NODE_ID,
      projectId: ID,
      artifactId: ID,
      x: 120.5,
      y: -40,
      width: null,
      height: null,
      updatedAt: '2026-08-10T00:00:00.000Z',
    })
    expect(node).toMatchObject({ x: 120.5, y: -40, collapsed: false, zIndex: 0, renderer: 'TextNode' })
    expect(canvasNodeSchema.safeParse({ id: NODE_ID, projectId: ID, artifactId: ID, x: NaN, y: 0 }).success).toBe(false)
  })

  it('validates Edge with input slot semantics', () => {
    const edge = edgeSchema.parse({
      id: EDGE_ID,
      projectId: ID,
      sourceArtifactId: ID,
      targetArtifactId: ID,
      inputSlot: 'outline',
      createdAt: '2026-08-10T00:00:00.000Z',
    })
    expect(edge.inputSlot).toBe('outline')
    expect(edgeSchema.safeParse({ id: EDGE_ID, projectId: ID, sourceArtifactId: ID, targetArtifactId: ID, inputSlot: '' }).success).toBe(false)
  })

  it('validates a Graph of nodes and edges', () => {
    const graph = graphSchema.parse({ nodes: [], edges: [] })
    expect(graph).toEqual({ nodes: [], edges: [] })
  })

  it('validates operation definitions across the four behaviors', () => {
    const outline = operationDefinitionSchema.parse({
      id: 'generate_outline',
      label: '生成大纲',
      behavior: 'create',
      input: { roles: ['topic'] },
      output: { kind: 'text', role: 'outline', behavior: 'new_artifact' },
      executor: 'operation.generate_outline',
      presentation: { group: 'generate', priority: 10, placement: 'primary' },
      runtime: { expectedDuration: 'medium' },
    })
    expect(outline).toMatchObject({ behavior: 'create', presentation: { priority: 10, placement: 'primary' } })

    const polish = operationDefinitionSchema.parse({
      id: 'polish',
      label: '润色',
      behavior: 'transform',
      input: { kinds: ['text'] },
      output: { behavior: 'new_version' },
      executor: 'operation.polish',
      presentation: { group: 'edit', priority: 5 },
    })
    expect(polish.output).toEqual({ behavior: 'new_version' })
    expect(polish.defaultConfig).toEqual({})

    const publish = operationDefinitionSchema.parse({
      id: 'publish',
      label: '发布',
      behavior: 'action',
      input: {},
      output: { behavior: 'side_effect' },
      executor: 'operation.publish',
      presentation: { group: 'publish', priority: 100, placement: 'primary', danger: true },
    })
    expect(publish.behavior).toBe('action')
    expect(operationDefinitionSchema.safeParse({ id: 'bad', label: 'x', behavior: 'create', executor: 'e', presentation: { group: 'g' } }).success).toBe(false)
  })

  it('validates a Run that derives status from tasks', () => {
    const run = runSchema.parse({
      id: RUN_ID,
      projectId: ID,
      taskId: TASK_ID,
      operationId: 'generate_outline',
      sourceArtifactId: null,
      inputVersionIds: [VERSION_ID],
      outputVersionIds: null,
      outputArtifactIds: null,
      status: 'running',
      config: { temperature: 0.7 },
      error: null,
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
    })
    expect(run).toMatchObject({ status: 'running', progress: 0, operationId: 'generate_outline' })
    expect(runSchema.safeParse({ id: RUN_ID, projectId: ID, taskId: TASK_ID, operationId: 'x', status: 'nope' }).success).toBe(false)
  })

  it('extends project contract with canvas bindings', () => {
    const project = projectSchema.parse({
      id: ID,
      workspaceId: ID,
      title: 'AI 工具评测',
      brief: '',
      status: 'draft',
      stage: 'idea',
      contentType: 'short_video',
      targetPlatform: null,
      targetDurationMs: null,
      graphId: ID,
      contextId: null,
      personalStyleId: ID,
      revision: 1,
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
    })
    expect(project).toMatchObject({ graphId: ID, personalStyleId: ID, contextId: null })
  })

  it('accepts optional personalStyleId when creating a project', () => {
    const created = createProjectSchema.parse({ title: '项目', contentType: 'video', personalStyleId: ID })
    expect(created.personalStyleId).toBe(ID)
    expect(createProjectSchema.parse({ title: '项目', contentType: 'video' }).personalStyleId).toBeUndefined()
  })
})
