import { Handle, Position, type NodeProps } from '@xyflow/react'
import { LoaderCircle, Sparkles } from 'lucide-react'

import type { FlowNode } from '../store/canvas-store'
import { useLod } from './node-frame'
import { cn } from '../../shared/lib/cn'

export function RecipeNode({ data, selected }: NodeProps<FlowNode>) {
  const lod = useLod()
  const inputs = Array.isArray(data.inputPorts) ? data.inputPorts as Array<{ id: string; required: boolean }> : []
  const outputs = Array.isArray(data.outputPorts) ? data.outputPorts as Array<{ id: string }> : []
  return (
    <div className={cn('w-52 overflow-hidden rounded-2xl border bg-[hsl(var(--warning)/.08)] shadow-panel backdrop-blur-xl transition-all', selected ? '-translate-y-0.5 border-warning ring-2 ring-warning/20' : 'border-warning/35 hover:border-warning/65')} data-testid="recipe-node">
      <div className="flex items-center gap-2 border-b border-warning/20 px-3 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/15 text-warning"><Sparkles className="h-3.5 w-3.5" /></span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{data.title || '创作工具'}</span>
        <span className="rounded-full border border-warning/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning">Recipe</span>
      </div>
      {lod !== 'compact' ? <p className="px-3 py-2 text-[10px] leading-4 text-muted">{String(data.description ?? data.capabilityId ?? '')}</p> : null}
      {inputs.map((port, index) => <Handle id={port.id} key={`in-${port.id}`} position={Position.Left} style={{ top: 44 + index * 18 }} type="target"><span className="sr-only">{port.id}</span></Handle>)}
      {outputs.map((port, index) => <Handle id={port.id} key={`out-${port.id}`} position={Position.Right} style={{ top: 44 + index * 18 }} type="source"><span className="sr-only">{port.id}</span></Handle>)}
      {data.status === 'running' ? <div className="flex items-center gap-1.5 border-t border-warning/20 px-3 py-1.5 text-[10px] text-warning"><LoaderCircle className="h-3 w-3 animate-spin" />执行中</div> : null}
    </div>
  )
}
