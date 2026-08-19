import { describe, expect, it } from 'vitest'
import { graphCommandBatchSchema, recipeSchema, workflowNodeSchema } from './workflow.js'

const ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const ID2 = '01ARZ3NDEKTSV4RRFFQ69G5FAW'

describe('creative canvas workflow contracts', () => {
  it('discriminates artifact and recipe nodes', () => {
    expect(workflowNodeSchema.parse({ id: ID, projectId: ID, subjectType: 'artifact', artifactId: ID2, x: 0, y: 0, width: null, height: null, collapsed: false, zIndex: 0, renderer: 'TextNode', updatedAt: '2026-08-14T00:00:00.000Z' }).subjectType).toBe('artifact')
    expect(workflowNodeSchema.safeParse({ id: ID, projectId: ID, subjectType: 'recipe', artifactId: ID2 }).success).toBe(false)
  })

  it('bounds graph command batches', () => {
    const valid = graphCommandBatchSchema.parse({ expectedRevision: 1, commands: [{ type: 'create_recipe_node', capabilityId: 'image.generate', title: '生成图片', position: { x: 10, y: 20 } }] })
    expect(valid.commands).toHaveLength(1)
    expect(graphCommandBatchSchema.safeParse({ expectedRevision: 1, commands: [] }).success).toBe(false)
  })

  it('keeps image model choices in recipe config rather than capability IDs', () => {
    const recipe = recipeSchema.parse({ id: ID, projectId: ID2, capabilityId: 'image.generate', title: '封面', config: { size: '1024x1024' }, revision: 1, createdAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z' })
    expect(recipe.capabilityId).toBe('image.generate')
    expect(recipe.config).toEqual({ size: '1024x1024' })
  })
})
