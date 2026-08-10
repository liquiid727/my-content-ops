import { and, eq } from 'drizzle-orm'

import { canvasNodes, edges, type CanvasNodeRecord, type EdgeRecord } from '../db/schema.js'
import type { DatabaseClient } from '../repositories/types.js'

export class NodeNotFoundError extends Error {
  constructor(readonly nodeId: string) {
    super(`Canvas node ${nodeId} was not found`)
    this.name = 'NodeNotFoundError'
  }
}

export class EdgeNotFoundError extends Error {
  constructor(readonly edgeId: string) {
    super(`Edge ${edgeId} was not found`)
    this.name = 'EdgeNotFoundError'
  }
}

export interface CanvasNodePatch {
  x?: number | undefined
  y?: number | undefined
  width?: number | null | undefined
  height?: number | null | undefined
  collapsed?: boolean | undefined
  zIndex?: number | undefined
}

export class CanvasRepository {
  constructor(private readonly db: DatabaseClient) {}

  async listNodesByProject(projectId: string): Promise<CanvasNodeRecord[]> {
    return this.db
      .select()
      .from(canvasNodes)
      .where(eq(canvasNodes.projectId, projectId))
      .orderBy(canvasNodes.createdAt, canvasNodes.id)
      .all()
  }

  async listEdgesByProject(projectId: string): Promise<EdgeRecord[]> {
    return this.db
      .select()
      .from(edges)
      .where(eq(edges.projectId, projectId))
      .orderBy(edges.createdAt, edges.id)
      .all()
  }

  async getNodeById(id: string): Promise<CanvasNodeRecord | null> {
    return this.db.select().from(canvasNodes).where(eq(canvasNodes.id, id)).get() ?? null
  }

  async getNodesByArtifact(artifactId: string): Promise<CanvasNodeRecord[]> {
    return this.db
      .select()
      .from(canvasNodes)
      .where(eq(canvasNodes.artifactId, artifactId))
      .orderBy(canvasNodes.createdAt, canvasNodes.id)
      .all()
  }

  async getNodeByProjectAndId(projectId: string, id: string): Promise<CanvasNodeRecord | null> {
    return this.db
      .select()
      .from(canvasNodes)
      .where(and(eq(canvasNodes.id, id), eq(canvasNodes.projectId, projectId)))
      .get() ?? null
  }

  async createNode(input: typeof canvasNodes.$inferInsert): Promise<CanvasNodeRecord> {
    return this.db.insert(canvasNodes).values(input).returning().get()
  }

  async updateNode(id: string, patch: CanvasNodePatch, now = Date.now()): Promise<CanvasNodeRecord | null> {
    return this.db
      .update(canvasNodes)
      .set({ ...patch, updatedAt: now })
      .where(eq(canvasNodes.id, id))
      .returning()
      .get() ?? null
  }

  async deleteNode(id: string): Promise<CanvasNodeRecord | null> {
    return this.db.delete(canvasNodes).where(eq(canvasNodes.id, id)).returning().get() ?? null
  }

  async deleteNodesByArtifact(artifactId: string): Promise<number> {
    return this.db.delete(canvasNodes).where(eq(canvasNodes.artifactId, artifactId)).run().changes
  }

  async getEdgeById(id: string): Promise<EdgeRecord | null> {
    return this.db.select().from(edges).where(eq(edges.id, id)).get() ?? null
  }

  async createEdge(input: typeof edges.$inferInsert): Promise<EdgeRecord> {
    return this.db.insert(edges).values(input).returning().get()
  }

  async deleteEdge(id: string): Promise<EdgeRecord | null> {
    return this.db.delete(edges).where(eq(edges.id, id)).returning().get() ?? null
  }

  async deleteEdgesByArtifact(artifactId: string): Promise<number> {
    return this.db
      .delete(edges)
      .where(and(eq(edges.sourceArtifactId, artifactId), eq(edges.targetArtifactId, artifactId)))
      .run()
      .changes
  }

  /** 环检测：加入 (source→target) 后，target 能否沿现有出边回到 source。 */
  wouldCreateCycle(sourceArtifactId: string, targetArtifactId: string, existingEdges: EdgeRecord[]): boolean {
    if (sourceArtifactId === targetArtifactId) return true
    const adjacency = new Map<string, string[]>()
    for (const edge of existingEdges) {
      const list = adjacency.get(edge.sourceArtifactId) ?? []
      list.push(edge.targetArtifactId)
      adjacency.set(edge.sourceArtifactId, list)
    }
    adjacency.get(sourceArtifactId)?.push(targetArtifactId)
    const visited = new Set<string>()
    const queue = [targetArtifactId]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (current === sourceArtifactId) return true
      if (visited.has(current)) continue
      visited.add(current)
      for (const next of adjacency.get(current) ?? []) queue.push(next)
    }
    return false
  }
}
