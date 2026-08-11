import type { NodeProps } from '@xyflow/react'
import { AudioLines } from 'lucide-react'

import type { FlowNode } from '../store/canvas-store'
import { NodeFrame, useLod } from './node-frame'

export function AudioNode(props: NodeProps<FlowNode>) {
  const lod = useLod()
  const { data, selected } = props
  const role = data.role || 'audio'
  return (
    <NodeFrame
      icon={AudioLines}
      lod={lod}
      role={role}
      selected={selected}
      statusText={data.artifact?.currentVersion ? `v${data.artifact.currentVersion.versionNumber}` : undefined}
      title={role}
    >
      {lod === 'full' ? (
        <div className="m-3 flex items-center gap-1 rounded-md border border-border/70 bg-surface/60 px-2 py-1.5 text-[10px] text-muted">
          <span className="flex flex-1 items-center gap-0.5" aria-hidden="true">
            {Array.from({ length: 18 }).map((_, index) => (
              <span key={index} className="w-0.5 rounded-full bg-primary/60" style={{ height: `${4 + ((index * 7) % 12)}px` }} />
            ))}
          </span>
          <span className="ml-2">波形</span>
        </div>
      ) : null}
    </NodeFrame>
  )
}
