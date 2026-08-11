import { z } from 'zod'
import {
  artifactDetailResponseSchema,
  canvasNodeResponseSchema,
  createNodeResponseSchema,
  edgeResponseSchema,
  graphResponseSchema,
  type Artifact,
  type ArtifactDetail,
  type CanvasNode,
  type Edge,
  type Graph,
} from '@creator-studio/contracts'
import { apiRequest } from '../../shared/api/api-client'

export type { Artifact, ArtifactDetail, CanvasNode, Edge, Graph }

type GraphEnvelope = z.infer<typeof graphResponseSchema>
type CreateNodeEnvelope = z.infer<typeof createNodeResponseSchema>
type CanvasNodeEnvelope = z.infer<typeof canvasNodeResponseSchema>
type EdgeEnvelope = z.infer<typeof edgeResponseSchema>
type ArtifactDetailEnvelope = z.infer<typeof artifactDetailResponseSchema>

export const canvasApi = {
  async graph(projectId: string): Promise<GraphEnvelope> {
    return apiRequest(`/projects/${encodeURIComponent(projectId)}/graph`, graphResponseSchema)
  },
  async createNode(projectId: string, input: { artifactId?: string; kind?: string; role?: string; x: number; y: number }): Promise<CreateNodeEnvelope> {
    return apiRequest(`/projects/${encodeURIComponent(projectId)}/nodes`, createNodeResponseSchema, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    })
  },
  async moveNode(nodeId: string, patch: { x: number; y: number }): Promise<CanvasNodeEnvelope> {
    return apiRequest(`/nodes/${encodeURIComponent(nodeId)}`, canvasNodeResponseSchema, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
  },
  async deleteNode(nodeId: string): Promise<void> {
    await apiRequest(`/nodes/${encodeURIComponent(nodeId)}`, z.undefined(), { method: 'DELETE' })
  },
  async createEdge(input: { sourceArtifactId: string; targetArtifactId: string; inputSlot: string }): Promise<EdgeEnvelope> {
    return apiRequest('/edges', edgeResponseSchema, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    })
  },
  async artifact(artifactId: string): Promise<ArtifactDetailEnvelope> {
    return apiRequest(`/artifacts/${encodeURIComponent(artifactId)}`, artifactDetailResponseSchema)
  },
}
