import { MiniMap } from '@xyflow/react'

/** 暗色低饱和 MiniMap，节点用语义色描边。 */
export function CustomMiniMap() {
  return (
    <MiniMap
      className="!m-3 !h-28 !w-40 !rounded-lg !border !border-border !bg-surface/80"
      maskColor="hsl(var(--background) / 0.7)"
      nodeColor="hsl(var(--primary) / 0.55)"
      nodeStrokeColor="hsl(var(--border))"
      pannable
      position="bottom-left"
      zoomable
    />
  )
}
