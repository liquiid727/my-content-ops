import { useStore, type NodeProps } from '@xyflow/react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../shared/lib/cn'

export type Lod = 'compact' | 'medium' | 'full'

/** 从视口 zoom 推导 LOD 三档（05-canvas-ui §3）。 */
export function useLod(): Lod {
  const zoom = useStore((state) => state.transform[2])
  if (zoom < 0.35) return 'compact'
  if (zoom < 0.7) return 'medium'
  return 'full'
}

export interface NodeFrameProps {
  icon: LucideIcon
  role: string
  selected: boolean
  lod: Lod
  title: string
  statusText?: string | undefined
  children?: ReactNode
}

/** 统一 Node 卡片骨架：语义 token、选中描边、角色徽标。 */
export function NodeFrame({ icon: Icon, role, selected, lod, title, statusText, children }: NodeFrameProps) {
  return (
    <div
      className={cn(
        'w-56 overflow-hidden rounded-lg border bg-elevated/70 shadow-panel backdrop-blur transition-colors duration-fast',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:bg-elevated',
      )}
      data-testid="canvas-node"
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-xs font-semibold text-foreground">{title || '未命名'}</span>
        {lod !== 'compact' ? (
          <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{role}</span>
        ) : null}
      </div>
      {statusText ? <p className="px-3 pb-1 text-[10px] text-muted">{statusText}</p> : null}
      {children}
    </div>
  )
}

export type { NodeProps }
