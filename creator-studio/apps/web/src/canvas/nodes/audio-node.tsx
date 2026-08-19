import type { NodeProps } from '@xyflow/react'
import { Play } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../shared/ui'
import { assetContentUrl, versionAssetId } from '../lib/media'
import type { FlowNode } from '../store/canvas-store'
import { NodeFrame, useLod } from './node-frame'
import { cardStatus, displayTitle, metadataString, nodeIconElement, nodeTone, roleLabelKey } from './node-role'
import { useNodeRun } from './use-node-run'

function Waveform() {
  return (
    <span className="flex flex-1 items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 22 }).map((_, index) => (
        <span className="w-0.5 rounded-full bg-node-audio/70" key={index} style={{ height: `${5 + ((index * 9) % 14)}px` }} />
      ))}
    </span>
  )
}

function AudioPlayback({ assetId, duration }: { assetId: string; duration?: string }) {
  const { t } = useTranslation()
  const [playing, setPlaying] = useState(false)
  if (playing) {
    return <audio autoPlay className="h-8 w-full" controls onEnded={() => setPlaying(false)} src={assetContentUrl(assetId)} />
  }
  return (
    <Button
      aria-label={t('canvas.playVoice')}
      className="h-10 w-full justify-start gap-2 rounded-md border border-border/70 bg-surface/60 px-2 text-[10px] text-muted"
      onClick={() => setPlaying(true)}
      variant="ghost"
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-node-audio/15 text-node-audio">
        <Play aria-hidden="true" className="h-3 w-3" />
      </span>
      <Waveform />
      {duration ? <span className="font-utility tabular-nums">{duration}</span> : null}
    </Button>
  )
}

export function AudioNode(props: NodeProps<FlowNode>) {
  const { t } = useTranslation()
  const lod = useLod()
  const { data, id, selected } = props
  const role = data.role || 'audio'
  const icon = nodeIconElement(role, data.kind)
  const run = useNodeRun(data.artifactId)
  const fallback = t(roleLabelKey(role), { defaultValue: role })
  const assetId = versionAssetId(data.artifact?.currentVersion)
  const duration = metadataString(data.artifact, 'duration')

  return (
    <NodeFrame icon={icon}
      artifactId={data.artifactId}
      lod={lod} nodeId={id} selected={selected} status={cardStatus(data.artifact, run)} title={displayTitle(data.artifact, role, fallback)} tone={nodeTone(role, data.kind)} widthClass="w-[240px]">
      <div className="nodrag px-3 pb-1">
        {lod === 'full' && assetId ? <AudioPlayback assetId={assetId} duration={duration} /> : <div className="flex h-10 items-center rounded-md border border-border/70 bg-surface/60 px-2"><Waveform /></div>}
      </div>
    </NodeFrame>
  )
}
