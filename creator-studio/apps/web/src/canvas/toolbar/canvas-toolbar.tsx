import { useReactFlow } from '@xyflow/react'
import { Maximize, Minus, Plus, Scan } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../shared/lib/cn'
import { useCanvasStore } from '../store/canvas-store'

export function CanvasToolbar() {
  const { t } = useTranslation()
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const hasNodes = useCanvasStore((state) => state.nodes.length > 0)

  const buttonClass = 'flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-foreground disabled:opacity-40'

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface/90 shadow-panel backdrop-blur" role="toolbar" aria-label={t('canvas.toolbar')}>
      <button aria-label={t('canvas.zoomIn')} className={buttonClass} onClick={() => zoomIn()} type="button">
        <Plus aria-hidden="true" className="h-4 w-4" />
      </button>
      <button aria-label={t('canvas.zoomOut')} className={buttonClass} onClick={() => zoomOut()} type="button">
        <Minus aria-hidden="true" className="h-4 w-4" />
      </button>
      <button
        aria-label={t('canvas.fitView')}
        className={cn(buttonClass, 'border-t border-border/60')}
        disabled={!hasNodes}
        onClick={() => void fitView({ padding: 0.2 })}
        type="button"
      >
        <Maximize aria-hidden="true" className="h-4 w-4" />
      </button>
      <button aria-label={t('canvas.resetView')} className={cn(buttonClass, 'border-t border-border/60')} onClick={() => void fitView({ padding: 0.2, duration: 200 })} type="button">
        <Scan aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  )
}
