import type { NodeProps } from '@xyflow/react'
import { LayoutGrid } from 'lucide-react'

import type { FlowNode } from '../store/canvas-store'
import { NodeFrame, useLod } from './node-frame'

export function CollectionNode(props: NodeProps<FlowNode>) {
  const lod = useLod()
  const { data, selected } = props
  const role = data.role || 'collection'
  return (
    <NodeFrame
      icon={LayoutGrid}
      lod={lod}
      role={role}
      selected={selected}
      statusText={data.artifact?.currentVersion ? `v${data.artifact.currentVersion.versionNumber}` : undefined}
      title={role}
    >
      {lod !== 'compact' ? (
        <div className="m-3 grid grid-cols-3 gap-1">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="aspect-square rounded-sm border border-border/60 bg-surface/60" aria-hidden="true" />
          ))}
        </div>
      ) : null}
    </NodeFrame>
  )
}
