import type { OperationDefinition } from '@creator-studio/contracts'

export interface OperationFilterContext {
  artifact: { kind: string; role: string }
  connectedInputs: Array<{ inputSlot: string }>
  projectContext?: unknown
  permissions?: unknown
  featureFlags?: unknown
}

export class OperationRegistry {
  constructor(private readonly definitions: readonly OperationDefinition[]) {}

  getById(id: string): OperationDefinition | undefined {
    return this.definitions.find((definition) => definition.id === id)
  }

  require(id: string): OperationDefinition {
    const definition = this.getById(id)
    if (!definition) throw new Error(`OPERATION_NOT_AVAILABLE:${id}`)
    return definition
  }

  all(): OperationDefinition[] {
    return [...this.definitions]
  }

  /**
   * 按 artifact kind/role + 输入 slot 满足度过滤（04-runtime §2.2）。
   * 禁止在节点组件里写死 if(role==='cover') 分支；前端一律经此查询。
   */
  getAvailableOperations(context: OperationFilterContext): OperationDefinition[] {
    const availableSlots = new Set(context.connectedInputs.map((input) => input.inputSlot))
    return this.definitions.filter((definition) => {
      const { input } = definition
      if (input.kinds && !input.kinds.includes(context.artifact.kind as never)) return false
      if (input.roles && !input.roles.includes(context.artifact.role)) return false
      if (input.slots && !input.slots.every((slot) => availableSlots.has(slot))) return false
      return true
    })
  }

  /**
   * 画布多选集合过滤：任一选中 artifact 单独满足 kinds+roles 即可用（其余节点作为素材/上下文参与生成）；
   * slots 由集合内所有 artifact 的已连输入 slot 并集满足。
   */
  getAvailableOperationsForSet(artifacts: Array<{ kind: string; role: string }>, connectedInputs: Array<{ inputSlot: string }>): OperationDefinition[] {
    const availableSlots = new Set(connectedInputs.map((input) => input.inputSlot))
    return this.definitions.filter((definition) => {
      const { input } = definition
      if (input.slots && !input.slots.every((slot) => availableSlots.has(slot))) return false
      return artifacts.some((artifact) => {
        if (input.kinds && !input.kinds.includes(artifact.kind as never)) return false
        if (input.roles && !input.roles.includes(artifact.role)) return false
        return true
      })
    })
  }
}
