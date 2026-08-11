import type { NodeProps } from '@xyflow/react'
import { Clapperboard } from 'lucide-react'

import type { FlowNode } from '../store/canvas-store'
import { NodeFrame, useLod } from './node-frame'

export function VideoNode(props: NodeProps<FlowNode>) {
  const lod = useLod()
  const { data, selected } = props
  const role = data.role || 'video'
  return (
    <NodeFrame
      icon={Clapperboard}
      lod={lod}
      role={role}
      selected={selected}
      statusText={data.artifact?.currentVersion ? `v${data.artifact.currentVersion.versionNumber}` : undefined}
      title={role}
    >
      {lod !== 'compact' ? (
        <div className="m-3 flex aspect-video items-center justify-center rounded-md border border-border/70 bg-surface/60 text-[11px] text-muted">
          视频封面
        </div>
      ) : null}
    </NodeFrame>
  )
}
