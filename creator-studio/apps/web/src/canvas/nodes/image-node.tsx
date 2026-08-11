import type { NodeProps } from '@xyflow/react'
import { Image as ImageIcon } from 'lucide-react'

import type { FlowNode } from '../store/canvas-store'
import { NodeFrame, useLod } from './node-frame'

export function ImageNode(props: NodeProps<FlowNode>) {
  const lod = useLod()
  const { data, selected } = props
  const role = data.role || 'image'
  return (
    <NodeFrame
      icon={ImageIcon}
      lod={lod}
      role={role}
      selected={selected}
      statusText={data.artifact?.currentVersion ? `v${data.artifact.currentVersion.versionNumber}` : undefined}
      title={role}
    >
      {lod !== 'compact' ? (
        <div className="m-3 flex h-24 items-center justify-center rounded-md border border-border/70 bg-surface/60 text-[11px] text-muted">
          图片缩略图
        </div>
      ) : null}
    </NodeFrame>
  )
}
