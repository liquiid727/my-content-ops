import type { NodeProps } from '@xyflow/react'
import { FileText } from 'lucide-react'

import type { FlowNode } from '../store/canvas-store'
import { NodeFrame, useLod, type Lod } from './node-frame'

function contentText(artifact: FlowNode['data']['artifact']): string {
  const ref = artifact?.currentVersion?.contentRef
  return ref?.type === 'inline' ? ref.text : ''
}

function Preview({ lod, artifact }: { lod: Lod; artifact: FlowNode['data']['artifact'] }) {
  const text = contentText(artifact)
  if (lod === 'compact') return null
  if (!text) {
    return <p className="px-3 py-2 text-[11px] text-muted">暂无内容</p>
  }
  const snippet = lod === 'medium' ? text.split('\n')[0]?.slice(0, 40) : text.split('\n').slice(0, 4).join('\n').slice(0, 120)
  return (
    <div className="max-h-24 overflow-hidden px-3 py-2">
      <p className="whitespace-pre-wrap text-[11px] leading-4 text-muted-foreground">{snippet}</p>
    </div>
  )
}

export function TextNode(props: NodeProps<FlowNode>) {
  const lod = useLod()
  const { data, selected } = props
  const role = data.role || 'text'
  return (
    <NodeFrame
      icon={FileText}
      lod={lod}
      role={role}
      selected={selected}
      statusText={data.artifact?.currentVersion ? `v${data.artifact.currentVersion.versionNumber}` : undefined}
      title={role}
    >
      <Preview artifact={data.artifact} lod={lod} />
    </NodeFrame>
  )
}
