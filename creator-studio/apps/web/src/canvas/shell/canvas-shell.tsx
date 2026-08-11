import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge as FlowEdge,
  type NodeChange,
} from '@xyflow/react'
import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '../../shared/ui'
import { cn } from '../../shared/lib/cn'
import { CustomMiniMap } from '../minimap/custom-minimap'
import { NodePicker } from '../interactions/node-picker'
import { InspectorShell } from '../inspector/inspector-shell'
import { useInspectorStore } from '../inspector/inspector-store'
import { canvasNodeTypes } from '../nodes'
import { useProjectEvents } from '../runtime/use-project-events'
import { useRunStore } from '../runtime/run-store'
import { useCanvasStore, type FlowNode } from '../store/canvas-store'
import { CanvasToolbar } from '../toolbar/canvas-toolbar'

import '@xyflow/react/dist/style.css'

interface CanvasShellProps {
  projectId: string
  className?: string
}

function CanvasInner({ projectId, className }: CanvasShellProps) {
  const { t } = useTranslation()
  const { screenToFlowPosition } = useReactFlow()
  const nodes = useCanvasStore((state) => state.nodes)
  const edges = useCanvasStore((state) => state.edges)
  const loading = useCanvasStore((state) => state.loading)
  const error = useCanvasStore((state) => state.error)
  const applyNodesChange = useCanvasStore((state) => state.applyNodesChange)
  const applyEdgesChange = useCanvasStore((state) => state.applyEdgesChange)
  const setViewport = useCanvasStore((state) => state.setViewport)
  const persistNodePosition = useCanvasStore((state) => state.persistNodePosition)
  const createNode = useCanvasStore((state) => state.createNode)
  const loadGraph = useCanvasStore((state) => state.loadGraph)
  const selectNode = useCanvasStore((state) => state.selectNode)
  const eventsStatus = useProjectEvents(projectId)
  const activeRunCount = useRunStore((state) => state.activeByProject[projectId]?.length ?? 0)

  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  useEffect(() => {
    void loadGraph(projectId)
  }, [loadGraph, projectId])

  const handleNodesChange = (changes: NodeChange<FlowNode>[]) => applyNodesChange(changes)

  const handlePaneDoubleClick = (event: React.MouseEvent) => {
    pickerPosition.current = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    setPickerOpen(true)
  }

  const handleNodeDragStop = (_: MouseEvent | TouchEvent, node: FlowNode) => {
    void persistNodePosition(node.id, node.position).catch(() => undefined)
  }

  const handleSelectionChange = ({ nodes: selected }: { nodes: FlowNode[] }) => {
    const first = selected[0]
    selectNode(first ? first.id : null)
    if (first) {
      useInspectorStore.getState().openForNode(first.id, first.data.artifactId)
    } else {
      useInspectorStore.getState().close()
    }
  }

  return (
    <div className={cn('flex h-full w-full gap-3', className)} data-testid="canvas-shell">
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface/40">
        <ReactFlow<FlowNode, FlowEdge>
          colorMode="dark"
          defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
          edges={edges}
          fitView
          maxZoom={2.5}
          minZoom={0.15}
          nodeTypes={canvasNodeTypes}
          nodes={nodes}
          nodesConnectable
          onDoubleClick={handlePaneDoubleClick}
          onEdgesChange={applyEdgesChange}
          onMove={(_event, viewport) => setViewport(viewport)}
          onNodeDragStop={handleNodeDragStop}
          onNodesChange={handleNodesChange}
          onSelectionChange={handleSelectionChange}
          proOptions={{ hideAttribution: true }}
          selectionOnDrag
          snapToGrid
        >
          <Background color="hsl(var(--border) / 0.5)" gap={20} size={1} variant={BackgroundVariant.Dots} />
          <CustomMiniMap />
          <div className="absolute right-3 top-3 z-10">
            <CanvasToolbar />
          </div>
        </ReactFlow>

        {!loading && !error && nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
            <EmptyState
              description={t('canvas.emptyDescription')}
              icon={<Plus aria-hidden="true" className="h-5 w-5" />}
              title={t('canvas.emptyTitle')}
            />
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-x-0 top-2 z-[5] mx-auto w-fit rounded-md border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        ) : null}

        <div className="absolute bottom-3 left-3 z-[5] flex items-center gap-2" role="status" aria-live="polite">
          <span
            aria-label={t('canvas.connectionStatus', { status: eventsStatus })}
            className={cn('h-2 w-2 rounded-full', eventsStatus === 'connected' ? 'bg-success' : eventsStatus === 'reconnecting' || eventsStatus === 'connecting' ? 'bg-warning' : 'bg-danger')}
          />
          {activeRunCount > 0 ? (
            <span className="rounded-full border border-border bg-surface/90 px-2 py-0.5 text-[10px] font-semibold text-muted">
              {t('canvas.activeRuns', { count: activeRunCount })}
            </span>
          ) : null}
        </div>

        <NodePicker onOpenChange={setPickerOpen} onPick={(kind, role) => void createNode({ kind, role, ...pickerPosition.current }).catch(() => undefined)} open={pickerOpen} />
      </div>
      <InspectorShell />
    </div>
  )
}

export function CanvasShell(props: CanvasShellProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  )
}
