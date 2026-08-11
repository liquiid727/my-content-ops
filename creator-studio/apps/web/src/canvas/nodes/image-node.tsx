import type { NodeProps } from '@xyflow/react'
import { Image as ImageIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { FlowNode } from '../store/canvas-store'
import { assetContentUrl, versionAssetId } from '../lib/media'
import { NodeFrame, useLod } from './node-frame'

function ImageThumb({ assetId, role }: { assetId: string; role: string }) {
  const { t } = useTranslation()
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="m-3 flex h-24 items-center justify-center rounded-md border border-danger/40 bg-danger/10 text-[11px] text-danger" role="img" aria-label={role}>
        {t('canvas.mediaLoadFailed')}
      </div>
    )
  }
  return (
    <div className="m-3 h-24 overflow-hidden rounded-md border border-border/70 bg-surface/60">
      {!loaded ? <div className="flex h-24 items-center justify-center text-[11px] text-muted">{t('canvas.loadingImage')}</div> : null}
      <img
        alt=""
        className={loaded ? 'h-24 w-full object-cover' : 'hidden'}
        loading="lazy"
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
        src={assetContentUrl(assetId)}
      />
    </div>
  )
}

export function ImageNode(props: NodeProps<FlowNode>) {
  const lod = useLod()
  const { data, selected } = props
  const role = data.role || 'image'
  const assetId = versionAssetId(data.artifact?.currentVersion)
  return (
    <NodeFrame
      icon={ImageIcon}
      lod={lod}
      role={role}
      selected={selected}
      statusText={data.artifact?.currentVersion ? `v${data.artifact.currentVersion.versionNumber}` : undefined}
      title={role}
    >
      {lod !== 'compact' && assetId ? <ImageThumb assetId={assetId} role={role} /> : null}
      {lod !== 'compact' && !assetId ? (
        <div className="m-3 flex h-24 items-center justify-center rounded-md border border-border/70 bg-surface/60 text-[11px] text-muted">
          图片缩略图
        </div>
      ) : null}
    </NodeFrame>
  )
}
