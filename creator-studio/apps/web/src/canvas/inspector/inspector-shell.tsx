import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'

import { cn } from '../../shared/lib/cn'
import { Button } from '../../shared/ui'
import { useArtifactStore } from '../artifacts/artifact-store'
import { useCanvasStore } from '../store/canvas-store'
import { displayTitle, nodeIconElement, nodeTone, NODE_TONE_CLASS, NODE_TONE_SOFT, roleLabelKey } from '../nodes/node-role'
import { useInspectorStore, type InspectorTab } from './inspector-store'
import { useInspectorOperations } from './use-inspector'
import { ArtifactPreview } from './preview'
import { OperationActions } from './operation-actions'
import { RunProgress } from './run-progress'
import { VersionHistory } from './version-history'
import { CollectionPanel } from './collection-panel'

const TABS: { id: InspectorTab; labelKey: string }[] = [
  { id: 'overview', labelKey: 'inspector.tabOverview' },
  { id: 'comments', labelKey: 'inspector.tabComments' },
  { id: 'versions', labelKey: 'inspector.tabVersions' },
  { id: 'collection', labelKey: 'inspector.tabCollection' },
]

function RelatedNodes({ nodeId }: { nodeId: string }) {
  const { t } = useTranslation()
  const nodes = useCanvasStore((state) => state.nodes)
  const edges = useCanvasStore((state) => state.edges)
  const selectNode = useCanvasStore((state) => state.selectNode)
  const current = nodes.find((node) => node.id === nodeId)
  const matches = (value: string) => value === nodeId || value === current?.data.artifactId
  const relatedIds = edges.flatMap((edge) => {
    if (matches(edge.source)) return [edge.target]
    if (matches(edge.target)) return [edge.source]
    return []
  })
  const related = relatedIds
    .map((id) => nodes.find((node) => node.id === id || node.data.artifactId === id))
    .filter((node): node is NonNullable<typeof node> => Boolean(node))
    .filter((node, index, list) => list.findIndex((item) => item.id === node.id) === index)
    .slice(0, 4)

  if (related.length === 0) return <p className="text-xs text-muted">{t('inspector.noRelated')}</p>

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {related.map((node) => {
        const icon = nodeIconElement(node.data.role, node.data.kind)
        return (
          <Button
            className="h-8 justify-start px-2 text-[11px]"
            key={node.id}
            onClick={() => {
              selectNode(node.id)
              if (node.data.subjectType !== 'recipe') useInspectorStore.getState().openForNode(node.id, node.data.artifactId)
            }}
            variant="secondary"
          >
            {icon}
            <span className="truncate">{displayTitle(node.data.artifact, node.data.role, node.data.role)}</span>
          </Button>
        )
      })}
    </div>
  )
}

export function InspectorShell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const nodeId = useInspectorStore((state) => state.nodeId)
  const artifactId = useInspectorStore((state) => state.artifactId)
  const tab = useInspectorStore((state) => state.tab)
  const setTab = useInspectorStore((state) => state.setTab)
  const close = useInspectorStore((state) => state.close)
  const projectId = useCanvasStore((state) => state.projectId)
  const node = useCanvasStore((state) => state.nodes.find((n) => n.id === nodeId))
  const artifact = useArtifactStore((state) => (artifactId ? state.byId[artifactId] : undefined))

  useInspectorOperations(artifactId)

  useEffect(() => {
    if (!artifactId) return
    void useArtifactStore.getState().getArtifact(artifactId).catch(() => undefined)
  }, [artifactId])

  if (!nodeId || !artifactId) {
    return (
      <aside
        aria-label={t('inspector.title')}
        className="hidden w-[21.5rem] shrink-0 flex-col items-center justify-center gap-3 rounded-xl border border-border/70 bg-surface/55 px-8 text-center text-muted shadow-panel backdrop-blur-xl lg:flex"
        data-testid="inspector-shell"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t('inspector.title')}</p>
        <p className="text-sm leading-5">{t('inspector.emptySelection')}</p>
      </aside>
    )
  }

  const role = node?.data.role || artifact?.role || ''
  const kind = node?.data.kind || artifact?.kind || 'text'
  const isCollection = kind === 'collection'
  const tabs = isCollection ? TABS : TABS.filter((item) => item.id !== 'collection')
  const icon = nodeIconElement(role, kind)
  const tone = nodeTone(role, kind)
  const fallback = t(roleLabelKey(role), { defaultValue: role || t('inspector.untitled') })
  const title = displayTitle(artifact ?? node?.data.artifact, role, fallback)
  const studioPath = kind === 'text'
    ? `/projects/${projectId}/text/${artifactId}`
    : kind === 'image' || kind === 'collection'
      ? `/projects/${projectId}/image/${artifactId}`
      : null
  const metadata = artifact?.currentVersion?.metadata ?? {}
  const prompt = typeof metadata.prompt === 'string' ? metadata.prompt : ''
  const style = typeof metadata.style === 'string' ? metadata.style : ''
  const ratio = typeof metadata.ratio === 'string' ? metadata.ratio : ''

  return (
    <aside className="absolute inset-y-2 right-2 z-20 flex w-[calc(100%-1rem)] shrink-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-surface/92 shadow-float backdrop-blur-2xl sm:w-[21.5rem] lg:static lg:w-[21.5rem]" data-testid="inspector-shell" aria-label={t('inspector.title')}>
      <header className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-4">
        <div className="flex min-w-0 items-start gap-2">
          <span className={cn('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md', NODE_TONE_SOFT[tone], NODE_TONE_CLASS[tone])}>
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">{t('inspector.selected')}</p>
            <h3 className="truncate font-display text-base font-semibold text-foreground">{title}</h3>
          </div>
        </div>
        <Button aria-label={t('inspector.close')} className="h-8 w-8 shrink-0 px-0" onClick={() => close()} variant="ghost">
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      </header>

      <nav aria-label={t('inspector.tabsLabel')} className="flex gap-1 border-b border-border/70 px-3 pt-2">
        {tabs.map((item) => (
          <Button
            aria-pressed={tab === item.id}
            className={cn(
              'h-9 rounded-t-md rounded-b-none border-b-2 px-3 text-sm font-semibold',
              tab === item.id ? 'border-primary text-foreground' : 'border-transparent text-muted',
            )}
            key={item.id}
            onClick={() => setTab(item.id)}
            variant="ghost"
          >
            {t(item.labelKey)}
          </Button>
        ))}
      </nav>

      <div className="studio-scrollbar flex-1 space-y-3 overflow-y-auto p-3">
        {tab === 'overview' ? (
          <>
            <RunProgress artifactId={artifactId} />
            <ArtifactPreview artifactId={artifactId} />
            {prompt || style || ratio ? (
              <dl className="space-y-1 rounded-md border border-border/70 bg-surface/60 p-3 text-[11px] text-muted">
                {prompt ? <div><dt className="font-semibold text-foreground">prompt</dt><dd className="mt-0.5 line-clamp-3">{prompt}</dd></div> : null}
                {style ? <div><dt className="font-semibold text-foreground">style</dt><dd>{style}</dd></div> : null}
                {ratio ? <div><dt className="font-semibold text-foreground">ratio</dt><dd>{ratio}</dd></div> : null}
              </dl>
            ) : null}
            <section>
              <OperationActions artifactId={artifactId} />
            </section>
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t('inspector.related')}</p>
              <RelatedNodes nodeId={nodeId} />
            </section>
            {studioPath ? (
              <Button className="h-8 w-full text-xs" onClick={() => navigate(studioPath)} variant="secondary">
                {t('inspector.openStudio')}
              </Button>
            ) : null}
          </>
        ) : null}
        {tab === 'comments' ? (
          <section className="rounded-md border border-dashed border-border/70 bg-surface/40 px-4 py-8 text-center">
            <p className="text-sm font-semibold text-foreground">{t('inspector.commentsEmpty')}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{t('inspector.commentsPlaceholder')}</p>
          </section>
        ) : null}
        {tab === 'versions' ? (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t('inspector.versionHistory')}</p>
            <VersionHistory artifactId={artifactId} />
          </section>
        ) : null}
        {tab === 'collection' && isCollection ? (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t('inspector.collection')}</p>
            <CollectionPanel artifactId={artifactId} />
          </section>
        ) : null}
        {artifact && !isCollection ? (
          <p className="text-[10px] text-muted">{t('inspector.revision', { revision: artifact.revision })}</p>
        ) : null}
      </div>
    </aside>
  )
}
