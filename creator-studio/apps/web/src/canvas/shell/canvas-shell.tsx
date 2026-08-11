import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge as FlowEdge,
  type NodeChange,
} from '@xyflow/react'
import { Loader2, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, EmptyState } from '../../shared/ui'
import { cn } from '../../shared/lib/cn'
import { CustomMiniMap } from '../minimap/custom-minimap'
import { NodePicker } from '../interactions/node-picker'
import { useCanvasKeyboard } from '../interactions/use-canvas-keyboard'
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
  const { fitView, screenToFlowPosition } = useReactFlow()
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

  // 与 Toolbar「适应视图」一致的稳定 fitView 回调（F 快捷键 / 新节点自动取景共用）。
  const fitViewCanvas = useCallback(() => {
    void fitView({ padding: 0.2, duration: 300 })
  }, [fitView])

  // 节点数量增长（Run 产出新节点 / 初次加载）时 fitView 一次，
  // 否则新节点落在视口外会被 onlyRenderVisibleElements 剔除，用户看不到新内容。
  // 切 project 时重置计数基线，避免把「缓存恢复」误判为新内容而抢走 viewport。
  const projectIdRef = useRef(projectId)
  const prevNodeCount = useRef(nodes.length)
  useEffect(() => {
    if (projectIdRef.current !== projectId) {
      projectIdRef.current = projectId
      prevNodeCount.current = nodes.length
      return
    }
    if (nodes.length > prevNodeCount.current && nodes.length > 0) {
      fitViewCanvas()
    }
    prevNodeCount.current = nodes.length
  }, [nodes.length, projectId, fitViewCanvas])

  // F 键适应视图；Delete/Esc/Space/Wheel 由 React Flow 原生处理。
  useCanvasKeyboard(fitViewCanvas)

  const handleNodesChange = (changes: NodeChange<FlowNode>[]) => applyNodesChange(changes)

  const handlePaneDoubleClick = (event: React.MouseEvent) => {
    // React Flow v12 的 dblclick 会因默认 double-click-zoom 被 d3-zoom 拦截，
    // 这里用 wrapper 的 onDoubleClick + zoomOnDoubleClick=false 才能收到；节点双击则忽略。
    if ((event.target as HTMLElement).closest('.react-flow__node')) return
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
          onlyRenderVisibleElements
          proOptions={{ hideAttribution: true }}
          selectionOnDrag
          snapToGrid
          zoomOnDoubleClick={false}
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
        {loading && nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center" role="status" aria-label={t('canvas.loading')}>
            <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-x-0 top-2 z-[5] mx-auto flex w-fit max-w-[90%] items-center gap-3 rounded-md border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger" role="alert">
            <span className="min-w-0">{error}</span>
            <Button className="min-h-0 shrink-0 rounded px-2 py-1 text-xs" onClick={() => void loadGraph(projectId, true)} variant="ghost">
              {t('common.retry')}
            </Button>
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
