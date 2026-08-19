import type { NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'

import type { FlowNode } from '../store/canvas-store'
import { NodeFrame, useLod } from './node-frame'
import { cardStatus, displayTitle, metadataString, nodeIconElement, nodeTone, roleLabelKey } from './node-role'
import { useNodeRun } from './use-node-run'

export function ActionNode(props: NodeProps<FlowNode>) {
  const { t } = useTranslation()
  const lod = useLod()
  const { data, id, selected } = props
  const role = data.role || 'action'
  const icon = nodeIconElement(role, data.kind)
  const run = useNodeRun(data.artifactId)
  const fallback = t(roleLabelKey(role), { defaultValue: role })
  const platforms = metadataString(data.artifact, 'platforms')
  const status = run?.status === 'failed' ? 'failed' : run?.status === 'completed' ? 'completed' : run ? 'running' : 'idle'

  return (
    <NodeFrame icon={icon}
      artifactId={data.artifactId}
      lod={lod} nodeId={id} selected={selected} status={status === 'idle' ? cardStatus(data.artifact, run) : status} title={displayTitle(data.artifact, role, fallback)} tone={nodeTone(role, data.kind)} widthClass="w-[240px]">
      {lod === 'full' ? (
        <div className="space-y-1 px-3 pb-1">
          <p className="text-[10px] leading-4 text-muted">{platforms || t('canvas.actionHint')}</p>
          {run?.error?.message ? <p className="text-[10px] leading-4 text-danger">{run.error.message}</p> : null}
        </div>
      ) : null}
    </NodeFrame>
  )
}
