import { useReactFlow, useViewport } from '@xyflow/react'
import { Hand, Maximize, Minus, MousePointer2, Plus, Redo2, Scan, Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../shared/lib/cn'
import { IconButton, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../shared/ui'
import { useCanvasStore } from '../store/canvas-store'

interface CanvasToolbarProps {
  interactionMode: 'select' | 'pan'
  onAddNode: () => void
  onInteractionModeChange: (mode: 'select' | 'pan') => void
}

export function CanvasToolbar({ interactionMode, onAddNode, onInteractionModeChange }: CanvasToolbarProps) {
  const { t } = useTranslation()
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const { zoom } = useViewport()
  const hasNodes = useCanvasStore((state) => state.nodes.length > 0)
  const canUndo = useCanvasStore((state) => state.history.length > 0)
  const canRedo = useCanvasStore((state) => state.redoStack.length > 0)
  const undo = useCanvasStore((state) => state.undo)
  const redo = useCanvasStore((state) => state.redo)
  const separator = 'mx-1 h-5 w-px bg-border/70'

  const item = (label: string, icon: React.ReactNode, action: () => void, disabled = false, active = false) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton aria-label={label} className={cn('h-9 w-9', active && 'bg-primary/12 text-primary')} disabled={disabled} onClick={action}>{icon}</IconButton>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )

  return (
    <TooltipProvider delayDuration={200}>
      <div className="studio-glass flex items-center rounded-xl p-1" role="toolbar" aria-label={t('canvas.toolbar')}>
        {item(t('canvas.selectMode'), <MousePointer2 aria-hidden="true" className="h-4 w-4" />, () => onInteractionModeChange('select'), false, interactionMode === 'select')}
        {item(t('canvas.panMode'), <Hand aria-hidden="true" className="h-4 w-4" />, () => onInteractionModeChange('pan'), false, interactionMode === 'pan')}
        <span aria-hidden="true" className={separator} />
        {item(t('canvas.addNode'), <Plus aria-hidden="true" className="h-4 w-4" />, onAddNode)}
        {item(t('canvas.undo'), <Undo2 aria-hidden="true" className="h-4 w-4" />, () => void undo(), !canUndo)}
        {item(t('canvas.redo'), <Redo2 aria-hidden="true" className="h-4 w-4" />, () => void redo(), !canRedo)}
        <span aria-hidden="true" className={separator} />
        {item(t('canvas.zoomOut'), <Minus aria-hidden="true" className="h-4 w-4" />, () => void zoomOut())}
        <span className="w-12 text-center font-utility text-[10px] tabular-nums text-muted">{Math.round(zoom * 100)}%</span>
        {item(t('canvas.zoomIn'), <Plus aria-hidden="true" className="h-4 w-4" />, () => void zoomIn())}
        {item(t('canvas.fitView'), <Maximize aria-hidden="true" className="h-4 w-4" />, () => void fitView({ padding: 0.2, duration: 260, maxZoom: 1 }), !hasNodes)}
        {item(t('canvas.resetView'), <Scan aria-hidden="true" className="h-4 w-4" />, () => void fitView({ padding: 0.2, duration: 260, maxZoom: 1 }))}
      </div>
    </TooltipProvider>
  )
}
