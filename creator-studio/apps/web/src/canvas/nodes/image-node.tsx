import type { NodeProps } from '@xyflow/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { assetContentUrl, versionAssetId } from '../lib/media'
import type { FlowNode } from '../store/canvas-store'
import { NodeFrame, useLod } from './node-frame'
import { cardStatus, displayTitle, nodeIconElement, nodeTone, roleLabelKey } from './node-role'
import { useNodeRun } from './use-node-run'

function ImageThumb({ assetId, overlay }: { assetId: string; overlay: string | undefined }) {
  const { t } = useTranslation()
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <div className="flex h-36 items-center justify-center rounded-md bg-surface/70 text-[11px] text-danger">{t('canvas.mediaLoadFailed')}</div>
  }
  return (
    <div className="relative h-36 overflow-hidden rounded-md bg-surface/70">
      {!loaded ? <div className="flex h-36 items-center justify-center text-[11px] text-muted">{t('canvas.loadingImage')}</div> : null}
      <img alt="" className={loaded ? 'h-36 w-full object-cover' : 'hidden'} loading="lazy" onError={() => setFailed(true)} onLoad={() => setLoaded(true)} src={assetContentUrl(assetId)} />
      {overlay && loaded ? <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent px-2 pb-2 pt-6 text-[11px] font-semibold leading-4 text-foreground">{overlay}</p> : null}
    </div>
  )
}

export function ImageNode(props: NodeProps<FlowNode>) {
  const { t } = useTranslation()
  const lod = useLod()
  const { data, id, selected } = props
  const role = data.role || 'image'
  const icon = nodeIconElement(role, data.kind)
  const run = useNodeRun(data.artifactId)
  const fallback = t(roleLabelKey(role), { defaultValue: role })
  const title = displayTitle(data.artifact, role, fallback)
  const assetId = versionAssetId(data.artifact?.currentVersion)

  return (
    <NodeFrame icon={icon}
      artifactId={data.artifactId}
      lod={lod} nodeId={id} selected={selected} status={cardStatus(data.artifact, run)} title={title} tone={nodeTone(role, data.kind)} widthClass="w-[240px]">
      <div className="px-3 pb-1">
        {assetId ? <ImageThumb assetId={assetId} overlay={role === 'cover' ? title : undefined} /> : <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-border/70 bg-surface/60 text-[11px] text-muted">{t('canvas.imagePlaceholder')}</div>}
      </div>
    </NodeFrame>
  )
}
