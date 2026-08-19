import { Handle, Position, useStore, type NodeProps } from '@xyflow/react'
import { AlertCircle, Check, Circle, Loader2, MoreHorizontal, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../shared/lib/cn'
import { Button, IconButton } from '../../shared/ui'
import { GenerateNextMenu } from '../interactions/generate-next-menu'
import { useCanvasStore } from '../store/canvas-store'
import { NODE_TONE_BAR, NODE_TONE_CLASS, NODE_TONE_SOFT, type CardStatus, type NodeTone } from './node-role'

export type Lod = 'compact' | 'medium' | 'full'

export function useLod(): Lod {
  const zoom = useStore((state) => state.transform[2])
  if (zoom < 0.35) return 'compact'
  if (zoom < 0.7) return 'medium'
  return 'full'
}

export interface NodeFrameProps {
  nodeId: string
  tone: NodeTone
  icon: ReactNode
  selected: boolean
  lod: Lod
  title: string
  status: CardStatus
  widthClass?: string
  /** 提供时在右缘悬停显示「+」快捷生成入口。 */
  artifactId?: string
  children?: ReactNode
}

function StatusMark({ status }: { status: CardStatus }) {
  if (status === 'running') return <Loader2 aria-hidden="true" className="h-3 w-3 shrink-0 animate-spin text-primary" />
  if (status === 'failed') return <AlertCircle aria-hidden="true" className="h-3 w-3 shrink-0 text-danger" />
  if (status === 'completed') return <Check aria-hidden="true" className="h-3 w-3 shrink-0 text-success" />
  return <Circle aria-hidden="true" className="h-3 w-3 shrink-0 text-muted" />
}

export function NodeFrame({ nodeId, tone, icon, selected, lod, title, status, widthClass = 'w-[260px]', artifactId, children }: NodeFrameProps) {
  const { t } = useTranslation()
  const [moreOpen, setMoreOpen] = useState(false)
  const [generateAnchor, setGenerateAnchor] = useState<{ x: number; y: number } | null>(null)
  const copySelection = useCanvasStore((state) => state.copySelection)
  const duplicateSelection = useCanvasStore((state) => state.duplicateSelection)
  const deleteNode = useCanvasStore((state) => state.deleteNode)

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-elevated/80 shadow-panel backdrop-blur-xl transition-[border-color,box-shadow,transform] duration-normal',
        widthClass,
        selected ? '-translate-y-0.5 border-primary shadow-[0_18px_44px_hsl(var(--primary)/.18)] ring-2 ring-primary/20' : 'border-border/80 hover:-translate-y-0.5 hover:border-primary/30',
        status === 'failed' && 'border-danger/50',
      )}
      data-testid="canvas-node"
    >
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-0.5', NODE_TONE_BAR[tone])} />
      <Handle className="!h-2.5 !w-2.5 !border-border !bg-elevated" id="input" position={Position.Left} type="target" />
      <Handle className="!h-2.5 !w-2.5 !border-border !bg-elevated" id="output" position={Position.Right} type="source" />

      {artifactId && lod !== 'compact' ? (
        <IconButton
          aria-label={t('generateNext.entry')}
          className="nodrag nopan absolute right-0.5 top-[calc(50%+16px)] z-10 h-6 w-6 rounded-full border border-border bg-elevated/95 opacity-0 shadow-panel transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          data-testid="generate-next-entry"
          onClick={(event) => {
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            setGenerateAnchor({ x: rect.right + 6, y: rect.top - 4 })
          }}
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
        </IconButton>
      ) : null}
      {artifactId && generateAnchor ? <GenerateNextMenu anchor={generateAnchor} onClose={() => setGenerateAnchor(null)} sourceArtifactIds={[artifactId]} /> : null}

      <div className="flex items-center gap-2 px-3 pb-1.5 pt-2.5">
        <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md', NODE_TONE_SOFT[tone], NODE_TONE_CLASS[tone])}>{icon}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{title || t('inspector.untitled')}</span>
        {lod !== 'compact' ? (
          <div className="relative nodrag nopan">
            <IconButton aria-expanded={moreOpen} aria-haspopup="menu" aria-label={t('canvas.nodeMore')} className={cn('h-6 w-6', moreOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')} onClick={() => setMoreOpen((open) => !open)}>
              <MoreHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
            </IconButton>
            {moreOpen ? (
              <div className="absolute right-0 top-7 z-20 min-w-28 rounded-md border border-border bg-surface p-1 shadow-panel" onMouseLeave={() => setMoreOpen(false)} role="menu">
                <Button className="h-7 w-full justify-start px-2 text-[11px]" onClick={() => { copySelection(); setMoreOpen(false) }} role="menuitem" variant="ghost">{t('canvas.copy')}</Button>
                <Button className="h-7 w-full justify-start px-2 text-[11px]" onClick={() => { void duplicateSelection(); setMoreOpen(false) }} role="menuitem" variant="ghost">{t('canvas.duplicate')}</Button>
                <Button className="h-7 w-full justify-start px-2 text-[11px] text-danger hover:bg-danger/10 hover:text-danger" onClick={() => { void deleteNode(nodeId); setMoreOpen(false) }} role="menuitem" variant="ghost">{t('canvas.deleteNode')}</Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {lod !== 'compact' ? children : null}

      <div className="flex items-center gap-1.5 px-3 pb-2 pt-1 text-[10px] text-muted">
        <StatusMark status={status} />
        <span className="truncate">{t(`canvas.cardStatus.${status}`)}</span>
      </div>
    </div>
  )
}

export type { NodeProps }
