import type { NodeProps } from '@xyflow/react'
import { CheckCircle2, Circle, Loader2, Send, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { RunSummary } from '../runtime/run-store'
import { useRunStore } from '../runtime/run-store'
import type { FlowNode } from '../store/canvas-store'
import { NodeFrame, useLod } from './node-frame'

/** 该 artifact 最近一次被 Run 影响的状态（source 或输出命中）。 */
function useAffectingRun(artifactId: string | undefined): RunSummary | undefined {
  return useRunStore((state) => {
    if (!artifactId) return undefined
    const runs = Object.values(state.byId)
      .filter((run) => run.sourceArtifactId === artifactId || run.outputArtifactIds?.includes(artifactId))
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    return runs[0]
  })
}

function StatusIcon({ run }: { run: RunSummary | undefined }) {
  const className = 'h-3 w-3 shrink-0'
  switch (run?.status) {
    case 'running':
    case 'queued':
      return <Loader2 aria-hidden="true" className={`${className} animate-spin text-primary`} />
    case 'completed':
      return <CheckCircle2 aria-hidden="true" className={`${className} text-success`} />
    case 'failed':
      return <XCircle aria-hidden="true" className={`${className} text-danger`} />
    default:
      return <Circle aria-hidden="true" className={`${className} text-muted`} />
  }
}

export function ActionNode(props: NodeProps<FlowNode>) {
  const lod = useLod()
  const { t } = useTranslation()
  const { data, selected } = props
  const role = data.role || 'action'
  const run = useAffectingRun(data.artifactId)
  const statusText = run ? t(`inspector.runStatus.${run.status}`) : t('canvas.actionIdle')
  const failed = run?.status === 'failed'

  return (
    <NodeFrame
      icon={Send}
      lod={lod}
      role={role}
      selected={selected}
      statusIcon={<StatusIcon run={run} />}
      statusText={statusText}
      title={role}
    >
      {lod === 'full' ? (
        <div className="space-y-1 px-3 pb-2">
          <p className={`text-[10px] ${failed ? 'text-danger' : 'text-muted'}`}>{t('canvas.actionHint')}</p>
          {run?.error?.message ? <p className="text-[10px] leading-4 text-danger">{run.error.message}</p> : null}
        </div>
      ) : null}
    </NodeFrame>
  )
}
