import type { NodeProps } from '@xyflow/react'
import { AudioLines, Play } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { FlowNode } from '../store/canvas-store'
import { assetContentUrl, versionAssetId } from '../lib/media'
import { NodeFrame, useLod } from './node-frame'

function AudioPlayback({ assetId }: { assetId: string }) {
  const { t } = useTranslation()
  const [playing, setPlaying] = useState(false)
  if (playing) {
    return (
      <audio
        autoPlay
        className="m-3 h-8 w-48 max-w-full"
        controls
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        src={assetContentUrl(assetId)}
      />
    )
  }
  return (
    <button
      aria-label={t('canvas.playVoice')}
      className="m-3 flex h-8 w-full items-center justify-center gap-2 rounded-md border border-border/70 bg-surface/60 px-2 text-[10px] text-muted transition-colors hover:bg-elevated hover:text-foreground"
      onClick={() => setPlaying(true)}
      type="button"
    >
      <Play aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
      {t('canvas.playVoice')}
    </button>
  )
}

export function AudioNode(props: NodeProps<FlowNode>) {
  const lod = useLod()
  const { data, selected } = props
  const role = data.role || 'audio'
  const assetId = versionAssetId(data.artifact?.currentVersion)
  return (
    <NodeFrame
      icon={AudioLines}
      lod={lod}
      role={role}
      selected={selected}
      statusText={data.artifact?.currentVersion ? `v${data.artifact.currentVersion.versionNumber}` : undefined}
      title={role}
    >
      {lod === 'full' && assetId ? <AudioPlayback assetId={assetId} /> : null}
      {lod === 'full' && !assetId ? (
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
