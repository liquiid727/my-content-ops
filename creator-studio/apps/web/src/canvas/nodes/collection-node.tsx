import type { NodeProps } from '@xyflow/react'
import { LayoutGrid } from 'lucide-react'
import { useState } from 'react'

import type { FlowNode } from '../store/canvas-store'
import { assetContentUrl, versionAssetId } from '../lib/media'
import { NodeFrame, useLod } from './node-frame'

function CurrentCover({ assetId, role }: { assetId: string; role: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="m-3 grid grid-cols-3 gap-1">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="aspect-square rounded-sm border border-border/60 bg-surface/60" aria-hidden="true" />
        ))}
      </div>
    )
  }
  return (
    <div className="m-3 overflow-hidden rounded-md border border-border/70 bg-surface/60">
      <img alt={role} className="h-20 w-full object-cover" loading="lazy" onError={() => setFailed(true)} src={assetContentUrl(assetId)} />
    </div>
  )
}

export function CollectionNode(props: NodeProps<FlowNode>) {
  const lod = useLod()
  const { data, selected } = props
  const role = data.role || 'collection'
  const assetId = versionAssetId(data.artifact?.currentVersion)
  return (
    <NodeFrame
      icon={LayoutGrid}
      lod={lod}
      role={role}
      selected={selected}
      statusText={data.artifact?.currentVersion ? `v${data.artifact.currentVersion.versionNumber}` : undefined}
      title={role}
    >
      {lod !== 'compact' && assetId ? <CurrentCover assetId={assetId} role={role} /> : null}
      {lod !== 'compact' && !assetId ? (
        <div className="m-3 grid grid-cols-3 gap-1">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="aspect-square rounded-sm border border-border/60 bg-surface/60" aria-hidden="true" />
          ))}
        </div>
      ) : null}
    </NodeFrame>
  )
}
