import { useStore, type NodeProps } from '@xyflow/react'
import { Check, type LucideIcon } from 'lucide-react'
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
  /** 状态行图标（run 状态用 icon+text，不只靠颜色）。 */
  statusIcon?: ReactNode
  children?: ReactNode
}

/** 统一 Node 卡片骨架：语义 token、选中描边、角色徽标。 */
export function NodeFrame({ icon: Icon, role, selected, lod, title, statusText, statusIcon, children }: NodeFrameProps) {
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
        {/* 选中不只靠颜色：勾选图标是非颜色线索。 */}
        {selected ? <Check aria-label="selected" className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" /> : null}
        {lod !== 'compact' ? (
          <span className={cn('shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary', !selected && 'ml-auto')}>{role}</span>
        ) : null}
      </div>
      {statusText ? (
        <p className="flex items-center gap-1 px-3 pb-1 pt-1.5 text-[10px] text-muted">
          {statusIcon}
          <span className="truncate">{statusText}</span>
        </p>
      ) : null}
      {children}
    </div>
  )
}

export type { NodeProps }
