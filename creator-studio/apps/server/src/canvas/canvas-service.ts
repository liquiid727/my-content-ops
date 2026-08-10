import {
  canvasNodeSchema,
  edgeSchema,
  serializeIsoDateTime,
  type Artifact,
  type CanvasNode,
  type CreateEdge,
  type CreateNode,
  type Edge,
  type Graph,
  type UpdateNode,
} from '@creator-studio/contracts'
import { ulid } from 'ulid'

import type { CanvasNodeRecord, EdgeRecord } from '../db/schema.js'
import { HttpError } from '../http/errors.js'
import { ProjectRepository } from '../repositories/project-repository.js'
import { ArtifactRepository } from '../artifacts/artifact-repository.js'
import { mapArtifact, ArtifactService } from '../artifacts/artifact-service.js'
import { CanvasRepository } from './canvas-repository.js'

function nodeDate(value: number): string { return serializeIsoDateTime(new Date(value)) }

export function mapNode(record: CanvasNodeRecord): CanvasNode {
  return canvasNodeSchema.parse({
    id: record.id,
    projectId: record.projectId,
    artifactId: record.artifactId,
    x: record.x,
    y: record.y,
    width: record.width ?? null,
    height: record.height ?? null,
    collapsed: record.collapsed,
    zIndex: record.zIndex,
    renderer: record.renderer,
    updatedAt: nodeDate(record.updatedAt),
  })
}

export function mapEdge(record: EdgeRecord): Edge {
  return edgeSchema.parse({
    id: record.id,
    projectId: record.projectId,
    sourceArtifactId: record.sourceArtifactId,
    targetArtifactId: record.targetArtifactId,
    inputSlot: record.inputSlot,
    createdAt: nodeDate(record.createdAt),
  })
}

export interface CanvasServiceIdentity {
  workspaceId: string
  creatorProfileId: string
}

const rendererByKind: Record<string, string> = {
  text: 'TextNode',
  image: 'ImageNode',
  audio: 'AudioNode',
  video: 'VideoNode',
  collection: 'CollectionNode',
  action: 'ActionNode',
}

export class CanvasService {
  constructor(
    private readonly canvas: CanvasRepository,
    private readonly artifacts: ArtifactRepository,
    private readonly artifactService: ArtifactService,
    private readonly projects: ProjectRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async getGraph(identity: CanvasServiceIdentity, projectId: string): Promise<Graph> {
    await this.requireProject(identity.workspaceId, projectId)
    const [nodes, edges] = await Promise.all([
      this.canvas.listNodesByProject(projectId),
      this.canvas.listEdgesByProject(projectId),
    ])
    return { nodes: nodes.map(mapNode), edges: edges.map(mapEdge) }
  }

  async createNode(identity: CanvasServiceIdentity, projectId: string, input: CreateNode): Promise<{ node: CanvasNode; artifact?: Artifact }> {
    await this.requireProject(identity.workspaceId, projectId)
    const now = this.now()
    let artifactId = input.artifactId
    let createdArtifact: Artifact | undefined
    let kind = input.kind

    if (artifactId === undefined) {
      if (input.kind === undefined || input.role === undefined) {
        throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '新建节点需要 kind 与 role。' })
      }
      const artifactRecord = await this.artifacts.create({
        id: ulid(now),
        workspaceId: identity.workspaceId,
        projectId,
        kind: input.kind,
        role: input.role,
        currentVersionId: null,
        createdBy: identity.creatorProfileId,
        createdAt: now,
        updatedAt: now,
      })
      artifactId = artifactRecord.id
      createdArtifact = mapArtifact(artifactRecord)
    } else {
      const artifact = await this.artifacts.getByWorkspaceAndId(identity.workspaceId, artifactId)
      if (!artifact || artifact.deletedAt !== null) {
        throw new HttpError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: '内容不存在。' })
      }
      if (artifact.projectId !== projectId) {
        throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '内容不属于该 Project。' })
      }
      kind = artifact.kind
    }

    const resolvedKind = kind ?? 'text'
    const node = await this.canvas.createNode({
      id: ulid(now + 1),
      projectId,
      artifactId,
      x: input.x,
      y: input.y,
      width: null,
      height: null,
      collapsed: false,
      zIndex: 0,
      renderer: rendererByKind[resolvedKind] ?? 'TextNode',
      createdAt: now,
      updatedAt: now,
    })
    return { node: mapNode(node), ...(createdArtifact ? { artifact: createdArtifact } : {}) }
  }

  async updateNode(identity: CanvasServiceIdentity, id: string, patch: UpdateNode): Promise<CanvasNode> {
    await this.requireNode(identity, id)
    const updated = await this.canvas.updateNode(id, patch, this.now())
    if (!updated) throw new HttpError({ status: 404, code: 'NODE_NOT_FOUND', message: '节点不存在。' })
    return mapNode(updated)
  }

  async deleteNode(identity: CanvasServiceIdentity, id: string): Promise<void> {
    const node = await this.requireNode(identity, id)
    await this.canvas.deleteNode(id)
    const remaining = await this.canvas.getNodesByArtifact(node.artifactId)
    if (remaining.length === 0) {
      await this.artifactService.markOrphanIfUnreferenced(node.artifactId, 0)
    }
  }

  async createEdge(identity: CanvasServiceIdentity, input: CreateEdge): Promise<Edge> {
    const projectId = await this.resolveSharedProject(identity.workspaceId, input.sourceArtifactId, input.targetArtifactId)
    const existingEdges = await this.canvas.listEdgesByProject(projectId)
    if (this.canvas.wouldCreateCycle(input.sourceArtifactId, input.targetArtifactId, existingEdges)) {
      throw new HttpError({ status: 400, code: 'EDGE_CYCLE', message: '该连线会造成循环依赖。' })
    }
    const now = this.now()
    const edge = await this.canvas.createEdge({
      id: ulid(now),
      projectId,
      sourceArtifactId: input.sourceArtifactId,
      targetArtifactId: input.targetArtifactId,
      inputSlot: input.inputSlot,
      createdAt: now,
    })
    return mapEdge(edge)
  }

  async deleteEdge(identity: CanvasServiceIdentity, id: string): Promise<void> {
    await this.requireEdge(identity, id)
    await this.canvas.deleteEdge(id)
  }

  async listConnectedInputs(identity: CanvasServiceIdentity, targetArtifactId: string): Promise<Edge[]> {
    const artifact = await this.artifacts.getByWorkspaceAndId(identity.workspaceId, targetArtifactId)
    if (!artifact) return []
    const edges = await this.canvas.listEdgesByProject(artifact.projectId)
    return edges.filter((edge) => edge.targetArtifactId === targetArtifactId).map(mapEdge)
  }

  private async requireProject(workspaceId: string, projectId: string): Promise<void> {
    const project = await this.projects.getByWorkspaceAndId(workspaceId, projectId)
    if (!project) throw new HttpError({ status: 404, code: 'NOT_FOUND', message: 'Project 不存在。' })
  }

  private async requireNode(identity: CanvasServiceIdentity, id: string): Promise<CanvasNodeRecord> {
    const node = await this.canvas.getNodeById(id)
    if (!node) throw new HttpError({ status: 404, code: 'NODE_NOT_FOUND', message: '节点不存在。' })
    const artifact = await this.artifacts.getById(node.artifactId)
    if (!artifact || artifact.workspaceId !== identity.workspaceId) {
      throw new HttpError({ status: 404, code: 'NODE_NOT_FOUND', message: '节点不存在。' })
    }
    return node
  }

  private async requireEdge(identity: CanvasServiceIdentity, id: string): Promise<EdgeRecord> {
    const edge = await this.canvas.getEdgeById(id)
    if (!edge) throw new HttpError({ status: 404, code: 'EDGE_NOT_FOUND', message: '连线不存在。' })
    const source = await this.artifacts.getById(edge.sourceArtifactId)
    if (!source || source.workspaceId !== identity.workspaceId) {
      throw new HttpError({ status: 404, code: 'EDGE_NOT_FOUND', message: '连线不存在。' })
    }
    return edge
  }

  private async resolveSharedProject(workspaceId: string, sourceArtifactId: string, targetArtifactId: string): Promise<string> {
    const source = await this.artifacts.getByWorkspaceAndId(workspaceId, sourceArtifactId)
    const target = await this.artifacts.getByWorkspaceAndId(workspaceId, targetArtifactId)
    if (!source || !target || source.deletedAt !== null || target.deletedAt !== null) {
      throw new HttpError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: '连线引用的内容不存在。' })
    }
    if (source.projectId !== target.projectId) {
      throw new HttpError({ status: 400, code: 'VALIDATION_FAILED', message: '连线两端必须属于同一 Project。' })
    }
    return source.projectId
  }
}
