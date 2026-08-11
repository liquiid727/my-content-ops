import type { NodeProps } from '@xyflow/react'
import { Send } from 'lucide-react'

import type { FlowNode } from '../store/canvas-store'
import { NodeFrame, useLod } from './node-frame'

export function ActionNode(props: NodeProps<FlowNode>) {
  const lod = useLod()
  const { data, selected } = props
  const role = data.role || 'action'
  return (
    <NodeFrame
      icon={Send}
      lod={lod}
      role={role}
      selected={selected}
      statusText={data.artifact?.currentVersion ? `v${data.artifact.currentVersion.versionNumber}` : undefined}
      title={role}
    >
      {lod === 'full' ? <p className="px-3 pb-2 text-[10px] text-muted">动作节点（副作用）</p> : null}
    </NodeFrame>
  )
}
