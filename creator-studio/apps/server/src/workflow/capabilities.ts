import type { RecipeCapability, RecipeCapabilityId, WorkflowPortKind } from '@creator-studio/contracts'

export const recipeCapabilities: readonly RecipeCapability[] = [
  { id: 'text.draft', label: '起草文本', description: '从提示或参考文本起草 Markdown 内容', inputPorts: [{ id: 'context', kind: 'text', required: false }], outputPorts: [{ id: 'text', kind: 'text' }] },
  { id: 'text.rewrite', label: '改写文本', description: '按指令改写一份文本作品', inputPorts: [{ id: 'source', kind: 'text', required: true }], outputPorts: [{ id: 'text', kind: 'text' }] },
  { id: 'image.generate', label: '生成图片', description: '用提示词与可选参考图生成候选集', inputPorts: [{ id: 'reference', kind: 'image', required: false }], outputPorts: [{ id: 'candidates', kind: 'collection' }] },
  { id: 'image.edit', label: '编辑图片', description: '用自然语言编辑图片，可附参考图或蒙版', inputPorts: [{ id: 'source', kind: 'image', required: true }, { id: 'reference', kind: 'image', required: false }, { id: 'mask', kind: 'mask', required: false }], outputPorts: [{ id: 'candidates', kind: 'collection' }] },
  { id: 'image.outpaint', label: '扩展画面', description: '在透明蒙版区域生成扩展内容', inputPorts: [{ id: 'source', kind: 'image', required: true }, { id: 'mask', kind: 'mask', required: true }], outputPorts: [{ id: 'candidates', kind: 'collection' }] },
  { id: 'image.variation', label: '生成变体', description: '基于现有图片生成新的视觉变体', inputPorts: [{ id: 'source', kind: 'image', required: true }], outputPorts: [{ id: 'candidates', kind: 'collection' }] },
  { id: 'image.enhance', label: 'AI 增强', description: '改善细节、清晰度与整体质感', inputPorts: [{ id: 'source', kind: 'image', required: true }], outputPorts: [{ id: 'candidates', kind: 'collection' }] },
]

const capabilityMap = new Map(recipeCapabilities.map((capability) => [capability.id, capability]))

export function getRecipeCapability(id: RecipeCapabilityId): RecipeCapability {
  return capabilityMap.get(id)!
}

export function artifactPortKind(kind: string): WorkflowPortKind {
  if (kind === 'text' || kind === 'image' || kind === 'collection') return kind
  return 'any'
}

export function portsCompatible(source: WorkflowPortKind, target: WorkflowPortKind): boolean {
  if (source === 'any' || target === 'any') return true
  // Collection outputs resolve to their explicitly selected image candidate at execution time.
  if (source === 'collection' && target === 'image') return true
  if (target === 'mask') return source === 'image'
  return source === target
}
