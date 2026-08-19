import type { NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'

import type { FlowNode } from '../store/canvas-store'
import { NodeFrame, useLod } from './node-frame'
import { cardStatus, displayTitle, inlineText, nodeIconElement, nodeTone, roleLabelKey } from './node-role'
import { useNodeRun } from './use-node-run'

export function TextNode(props: NodeProps<FlowNode>) {
  const { t } = useTranslation()
  const lod = useLod()
  const { data, id, selected } = props
  const role = data.role || 'text'
  const icon = nodeIconElement(role, data.kind)
  const run = useNodeRun(data.artifactId)
  const fallback = t(roleLabelKey(role), { defaultValue: role })
  const title = displayTitle(data.artifact, role, fallback)
  const text = inlineText(data.artifact)
  const snippet = lod === 'medium' ? text.split('\n')[0]?.slice(0, 48) : text.split('\n').slice(0, 4).join('\n').slice(0, 140)

  return (
    <NodeFrame icon={icon}
      artifactId={data.artifactId}
      lod={lod} nodeId={id} selected={selected} status={cardStatus(data.artifact, run)} title={title} tone={nodeTone(role, data.kind)}>
      <div className="min-h-[4.5rem] px-3 pb-1">
        <p className="whitespace-pre-wrap text-[11px] leading-4 text-muted-foreground">{snippet || t('inspector.emptyPreview')}</p>
      </div>
    </NodeFrame>
  )
}
