import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge as FlowEdge,
  type FinalConnectionState,
  type NodeChange,
  type Connection,
} from '@xyflow/react'
import type { OperationDefinition } from '@creator-studio/contracts'
import { Loader2, Maximize, Plus, Share2, Sparkles } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { formatDateTime, normalizeLocale } from '../../modules/i18n'
import { useProjectStore } from '../../modules/projects'
import { Button, EmptyState, IconButton, useToastStore } from '../../shared/ui'
import { cn } from '../../shared/lib/cn'
import { CustomMiniMap } from '../minimap/custom-minimap'
import { CanvasContextMenu, type CanvasContextMenuState } from '../interactions/canvas-context-menu'
import { GenerateNextMenu } from '../interactions/generate-next-menu'
import { GenerateNextPicker } from '../interactions/generate-next-picker'
import { nextCreateOperations } from '../interactions/generate-next'
import { NodePicker } from '../interactions/node-picker'
import { useCanvasKeyboard } from '../interactions/use-canvas-keyboard'
import { artifactApi } from '../api/artifact-api'
import { executeOperation } from '../inspector/run-operation'
import { InspectorShell } from '../inspector/inspector-shell'
import { useInspectorStore } from '../inspector/inspector-store'
import { canvasNodeTypes } from '../nodes'
import { useProjectEvents } from '../runtime/use-project-events'
import { useRunStore } from '../runtime/run-store'
import { useCanvasStore, type FlowNode } from '../store/canvas-store'
import { CanvasToolbar } from '../toolbar/canvas-toolbar'
import { ChangeSetReview } from '../../workflow/change-set-review'

import '@xyflow/react/dist/style.css'

interface CanvasShellProps {
  projectId: string
  className?: string
}

function CanvasInner({ projectId, className }: CanvasShellProps) {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
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
  const createRecipeNode = useCanvasStore((state) => state.createRecipeNode)
  const applyWorkflowCommands = useCanvasStore((state) => state.applyWorkflowCommands)
  const createExecutionPlan = useCanvasStore((state) => state.createExecutionPlan)
  const capabilities = useCanvasStore((state) => state.capabilities)
  const workflowRevision = useCanvasStore((state) => state.workflowRevision)
  const deleteNode = useCanvasStore((state) => state.deleteNode)
  const copySelection = useCanvasStore((state) => state.copySelection)
  const paste = useCanvasStore((state) => state.paste)
  const duplicateSelection = useCanvasStore((state) => state.duplicateSelection)
  const undo = useCanvasStore((state) => state.undo)
  const redo = useCanvasStore((state) => state.redo)
  const canUndo = useCanvasStore((state) => state.history.length > 0)
  const canRedo = useCanvasStore((state) => state.redoStack.length > 0)
  const hasClipboard = useCanvasStore((state) => state.clipboard !== null)
  const loadGraph = useCanvasStore((state) => state.loadGraph)
  const selectNode = useCanvasStore((state) => state.selectNode)
  const eventsStatus = useProjectEvents(projectId)
  const activeRunCount = useRunStore((state) => state.activeByProject[projectId]?.length ?? 0)
  const project = useProjectStore((state) => state.projects.find((item) => item.id === projectId) ?? state.overviews[projectId]?.project)
  const notify = useToastStore((state) => state.notify)
  const locale = normalizeLocale(i18n.language)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [interactionMode, setInteractionMode] = useState<'select' | 'pan'>('select')
  const pickerPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null)
  const [generateNextOpen, setGenerateNextOpen] = useState(false)
  const [generateNextLoading, setGenerateNextLoading] = useState(false)
  const [generateNextError, setGenerateNextError] = useState<string | null>(null)
  const [generateNextOps, setGenerateNextOps] = useState<OperationDefinition[]>([])
  const generateSourceRef = useRef<{ nodeId: string; artifactId: string } | null>(null)
  const [multiMenuAnchor, setMultiMenuAnchor] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    void loadGraph(projectId)
  }, [loadGraph, projectId])

  useEffect(() => {
    if (project) return
    void useProjectStore.getState().loadOverview(projectId).catch(() => undefined)
  }, [project, projectId])

  const shareCanvas = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      notify({ title: t('shell.linkCopied'), description: t('shell.linkCopiedDescription') })
    } catch {
      notify({ title: t('shell.copyFailed'), description: t('shell.copyFailedDescription') })
    }
  }

  // 与 Toolbar「适应视图」一致的稳定 fitView 回调（F 快捷键 / 新节点自动取景共用）。
  const fitViewCanvas = useCallback(() => {
    void fitView({ padding: 0.2, duration: 300, maxZoom: 1 })
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
  const keyboardActions = useMemo(
    () => ({ fitView: fitViewCanvas, undo: () => void undo(), redo: () => void redo(), copy: copySelection, paste: () => void paste(), duplicate: () => void duplicateSelection() }),
    [fitViewCanvas, undo, redo, copySelection, paste, duplicateSelection],
  )
  useCanvasKeyboard(keyboardActions)

  const handleNodesChange = (changes: NodeChange<FlowNode>[]) => applyNodesChange(changes)

  const handlePaneDoubleClick = (event: React.MouseEvent) => {
    // React Flow v12 的 dblclick 会因默认 double-click-zoom 被 d3-zoom 拦截，
    // 这里用 wrapper 的 onDoubleClick + zoomOnDoubleClick=false 才能收到；节点双击则忽略。
    if ((event.target as HTMLElement).closest('.react-flow__node')) return
    pickerPosition.current = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    setPickerOpen(true)
  }

  const openContextMenu = (event: React.MouseEvent, nodeId: string | null) => {
    event.preventDefault()
    pickerPosition.current = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId, flowPosition: pickerPosition.current })
  }

  const handlePaneContextMenu = (event: React.MouseEvent | MouseEvent) => openContextMenu(event as React.MouseEvent, null)
  const handleNodeContextMenu = (event: React.MouseEvent | MouseEvent, node: FlowNode) => openContextMenu(event as React.MouseEvent, node.id)
  const handleNodeDoubleClick = (_event: React.MouseEvent, node: FlowNode) => {
    if (node.data.subjectType === 'recipe' || !node.data.artifactId) return
    if (node.data.kind === 'text') navigate(`/projects/${projectId}/text/${node.data.artifactId}`)
    if (node.data.kind === 'image' || node.data.kind === 'collection') navigate(`/projects/${projectId}/image/${node.data.artifactId}`)
  }

  const handleAddNodeAtCenter = () => {
    pickerPosition.current = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    setPickerOpen(true)
  }

  const handleNodeDragStop = (_: MouseEvent | TouchEvent, node: FlowNode) => {
    void persistNodePosition(node.id, node.position).catch(() => undefined)
  }

  const handleConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) return
    void applyWorkflowCommands([{ type: 'connect_nodes', sourceNodeId: connection.source, sourcePort: connection.sourceHandle ?? 'output', targetNodeId: connection.target, targetPort: connection.targetHandle ?? 'input' }]).catch(() => undefined)
  }

  const openGenerateNext = (node: FlowNode) => {
    if (!node.data.artifactId || node.data.subjectType === 'recipe') return
    generateSourceRef.current = { nodeId: node.id, artifactId: node.data.artifactId }
    setGenerateNextOps([])
    setGenerateNextError(null)
    setGenerateNextLoading(true)
    setGenerateNextOpen(true)
    void artifactApi.operations(node.data.artifactId)
      .then((operations) => {
        if (generateSourceRef.current?.artifactId !== node.data.artifactId) return
        setGenerateNextOps(nextCreateOperations(operations))
        setGenerateNextLoading(false)
      })
      .catch(() => {
        if (generateSourceRef.current?.artifactId !== node.data.artifactId) return
        setGenerateNextError(t('generateNext.loadFailed'))
        setGenerateNextLoading(false)
      })
  }

  const handleConnectEnd = (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
    if (connectionState.isValid) return
    if (connectionState.fromHandle?.type !== 'source') return
    const fromNodeId = connectionState.fromNode?.id
    const fromNode = fromNodeId ? useCanvasStore.getState().nodes.find((node) => node.id === fromNodeId) : undefined
    if (!fromNode) return
    const droppedOnPane = event.target instanceof Element && Boolean(event.target.closest('.react-flow__pane'))
    if (!droppedOnPane) return
    const clientX = 'changedTouches' in event ? event.changedTouches[0]?.clientX : event.clientX
    const clientY = 'changedTouches' in event ? event.changedTouches[0]?.clientY : event.clientY
    if (typeof clientX === 'number' && typeof clientY === 'number') {
      pickerPosition.current = screenToFlowPosition({ x: clientX, y: clientY })
    }
    openGenerateNext(fromNode)
  }

  const runGenerateNext = (operation: OperationDefinition) => {
    const source = generateSourceRef.current
    if (!source) return
    void executeOperation({ operationId: operation.id, projectId, sourceArtifactId: source.artifactId, config: operation.defaultConfig }).catch(() => undefined)
  }

  const runSelection = () => {
    const recipeIds = nodes.filter((node) => node.selected && node.data.subjectType === 'recipe').map((node) => node.id)
    if (recipeIds.length) void createExecutionPlan(recipeIds).catch(() => undefined)
  }

  // 画布多选（≥2 个 artifact 节点）→「生成」浮动条：以所选节点为素材多源生成，完成后从全部源连线。
  const selectedArtifactIds = nodes
    .filter((node) => node.selected && node.data.subjectType !== 'recipe' && node.data.artifactId)
    .map((node) => node.data.artifactId as string)

  const handleSelectionChange = ({ nodes: selected }: { nodes: FlowNode[] }) => {
    const first = selected[0]
    selectNode(first ? first.id : null)
    if (first && first.data.subjectType !== 'recipe') {
      useInspectorStore.getState().openForNode(first.id, first.data.artifactId)
    } else {
      useInspectorStore.getState().close()
    }
  }

  return (
    <div className={cn('relative flex h-full w-full gap-2', className)} data-testid="canvas-shell">
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-surface/35 shadow-[inset_0_1px_0_hsl(var(--foreground)/.025)]">
        <ReactFlow<FlowNode, FlowEdge>
          colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
          defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
          edges={edges}
          maxZoom={2.5}
          minZoom={0.15}
          nodeTypes={canvasNodeTypes}
          nodes={nodes}
          nodesConnectable
          onDoubleClick={handlePaneDoubleClick}
          onConnect={handleConnect}
          onConnectEnd={handleConnectEnd}
          onEdgesChange={applyEdgesChange}
          onMove={(_event, viewport) => setViewport(viewport)}
          onMoveStart={() => setContextMenu(null)}
          onNodeContextMenu={handleNodeContextMenu}
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeDragStart={() => setContextMenu(null)}
          onNodeDragStop={handleNodeDragStop}
          onNodesChange={handleNodesChange}
          onPaneContextMenu={handlePaneContextMenu}
          onSelectionChange={handleSelectionChange}
          onlyRenderVisibleElements
          proOptions={{ hideAttribution: true }}
          panOnDrag={interactionMode === 'pan'}
          selectionOnDrag={interactionMode === 'select'}
          snapToGrid
          zoomOnDoubleClick={false}
        >
          <Background color="hsl(var(--canvas-grid) / 0.54)" gap={22} size={1.1} variant={BackgroundVariant.Dots} />
          <CustomMiniMap />
          <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
            <CanvasToolbar interactionMode={interactionMode} onAddNode={handleAddNodeAtCenter} onInteractionModeChange={setInteractionMode} />
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

        <div className="studio-glass absolute left-3 top-3 z-[5] flex max-w-[min(36rem,calc(100%-1.5rem))] items-center gap-2 rounded-lg px-2.5 py-1.5" role="status" aria-live="polite">
          <span
            aria-label={t('canvas.connectionStatus', { status: eventsStatus })}
            className={cn('h-2 w-2 shrink-0 rounded-full', eventsStatus === 'connected' ? 'bg-success' : eventsStatus === 'reconnecting' || eventsStatus === 'connecting' ? 'bg-warning' : 'bg-danger')}
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">{project?.title || t('canvas.untitledProject')}</p>
            {project?.updatedAt ? <p className="truncate text-[10px] text-muted">{t('canvas.lastUpdated', { date: formatDateTime(project.updatedAt, locale) })}</p> : null}
          </div>
          {activeRunCount > 0 ? (
            <span className="shrink-0 rounded-full border border-border bg-surface/90 px-2 py-0.5 text-[10px] font-semibold text-muted">
              {t('canvas.activeRuns', { count: activeRunCount })}
            </span>
          ) : null}
          <ChangeSetReview capabilities={capabilities} onApplied={() => loadGraph(projectId, true)} projectId={projectId} revision={workflowRevision} />
          <IconButton aria-label={t('shell.share')} className="h-7 w-7" onClick={() => void shareCanvas()}>
            <Share2 aria-hidden="true" className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton aria-label={t('canvas.fitView')} className="h-7 w-7" onClick={fitViewCanvas}>
            <Maximize aria-hidden="true" className="h-3.5 w-3.5" />
          </IconButton>
        </div>

        <NodePicker capabilities={capabilities} onOpenChange={setPickerOpen} onPick={(kind, role) => void createNode({ kind, role, ...pickerPosition.current }).catch(() => undefined)} onPickRecipe={(capability) => void createRecipeNode({ capabilityId: capability.id, title: capability.label, ...pickerPosition.current }).catch(() => undefined)} open={pickerOpen} />
        <GenerateNextPicker error={generateNextError} loading={generateNextLoading} onOpenChange={setGenerateNextOpen} onPick={runGenerateNext} open={generateNextOpen} operations={generateNextOps} />
        <CanvasContextMenu
          canPaste={hasClipboard}
          canRedo={canRedo}
          canUndo={canUndo}
          menu={contextMenu}
          onAddNode={() => setPickerOpen(true)}
          onClose={() => setContextMenu(null)}
          onCopy={copySelection}
          onDelete={() => {
            const nodeId = contextMenu?.nodeId
            if (nodeId) void deleteNode(nodeId).catch(() => undefined)
          }}
          onDuplicate={() => void duplicateSelection().catch(() => undefined)}
          onFitView={fitViewCanvas}
          onPaste={() => void paste().catch(() => undefined)}
          onRedo={() => void redo().catch(() => undefined)}
          onUndo={() => void undo().catch(() => undefined)}
        />
      </div>
      <InspectorShell />
      {nodes.some((node) => node.selected && node.data.subjectType === 'recipe') ? <div className="studio-glass absolute bottom-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl px-3 py-2"><span className="text-xs text-muted">将按依赖顺序执行所选工具</span><Button className="min-h-8 px-3 py-1 text-xs" onClick={runSelection} variant="primary"><Sparkles className="h-3.5 w-3.5" />执行选中流程</Button></div> : null}
      {selectedArtifactIds.length >= 2 ? (
        <div className="studio-glass absolute bottom-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl px-3 py-2" data-testid="multi-generate-bar">
          <span className="text-xs text-muted">{t('generateNext.selectedCount', { count: selectedArtifactIds.length })}</span>
          <Button
            className="min-h-8 px-3 py-1 text-xs"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setMultiMenuAnchor({ x: rect.left, y: rect.top - 8 })
            }}
            variant="primary"
          >
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            {t('generateNext.generateAction')}
          </Button>
        </div>
      ) : null}
      {multiMenuAnchor && selectedArtifactIds.length >= 2 ? (
        <GenerateNextMenu
          anchor={multiMenuAnchor}
          direction="up"
          onClose={() => setMultiMenuAnchor(null)}
          sourceArtifactIds={selectedArtifactIds}
          title={t('generateNext.multiTitle')}
        />
      ) : null}
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
