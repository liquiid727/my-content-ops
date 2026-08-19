import type { NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'

import { assetContentUrl, versionAssetId } from '../lib/media'
import type { FlowNode } from '../store/canvas-store'
import { NodeFrame, useLod } from './node-frame'
import { cardStatus, displayTitle, metadataString, nodeIconElement, nodeTone, roleLabelKey } from './node-role'
import { useNodeRun } from './use-node-run'

export function VideoNode(props: NodeProps<FlowNode>) {
  const { t } = useTranslation()
  const lod = useLod()
  const { data, id, selected } = props
  const role = data.role || 'video'
  const icon = nodeIconElement(role, data.kind)
  const run = useNodeRun(data.artifactId)
  const fallback = t(roleLabelKey(role), { defaultValue: role })
  const assetId = versionAssetId(data.artifact?.currentVersion)
  const duration = metadataString(data.artifact, 'duration')

  return (
    <NodeFrame icon={icon}
      artifactId={data.artifactId}
      lod={lod} nodeId={id} selected={selected} status={cardStatus(data.artifact, run)} title={displayTitle(data.artifact, role, fallback)} tone={nodeTone(role, data.kind)}>
      <div className="relative mx-3 mb-1 overflow-hidden rounded-md border border-border/70 bg-surface/60">
        {assetId ? <img alt="" className="aspect-video w-full object-cover" loading="lazy" src={assetContentUrl(assetId)} /> : <div className="flex aspect-video items-center justify-center text-[11px] text-muted">{t('canvas.videoPlaceholder')}</div>}
        {duration ? <span className="absolute bottom-1.5 right-1.5 rounded bg-background/80 px-1.5 py-0.5 font-utility text-[10px] tabular-nums text-foreground">{duration}</span> : null}
      </div>
    </NodeFrame>
  )
}
