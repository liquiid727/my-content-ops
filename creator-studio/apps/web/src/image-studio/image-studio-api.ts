import { collectionItemListResponseSchema } from '@creator-studio/contracts'
import { apiRequest } from '../shared/api'

export const imageStudioApi = {
  items: async (collectionId: string) => (await apiRequest(`/artifacts/${encodeURIComponent(collectionId)}/collection-items`, collectionItemListResponseSchema)).data.items,
  select: async (collectionId: string, itemArtifactId: string) => (await apiRequest(`/artifacts/${encodeURIComponent(collectionId)}/collection-items/select`, collectionItemListResponseSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemArtifactId }) })).data.items,
}
