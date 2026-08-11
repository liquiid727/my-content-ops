import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

import { cn } from '../../shared/lib/cn'
import { Button } from '../../shared/ui'
import { useArtifactStore } from '../artifacts/artifact-store'
import { useCanvasStore } from '../store/canvas-store'
import { useInspectorStore, type InspectorTab } from './inspector-store'
import { useInspectorOperations } from './use-inspector'
import { ArtifactPreview } from './preview'
import { OperationActions } from './operation-actions'
import { RunProgress } from './run-progress'
import { VersionHistory } from './version-history'
import { CollectionPanel } from './collection-panel'

const TABS: { id: InspectorTab; labelKey: string }[] = [
  { id: 'overview', labelKey: 'inspector.tabOverview' },
  { id: 'versions', labelKey: 'inspector.tabVersions' },
  { id: 'collection', labelKey: 'inspector.tabCollection' },
]

export function InspectorShell() {
  const { t } = useTranslation()
  const nodeId = useInspectorStore((state) => state.nodeId)
  const artifactId = useInspectorStore((state) => state.artifactId)
  const tab = useInspectorStore((state) => state.tab)
  const setTab = useInspectorStore((state) => state.setTab)
  const close = useInspectorStore((state) => state.close)
  const node = useCanvasStore((state) => state.nodes.find((n) => n.id === nodeId))
  const artifact = useArtifactStore((state) => (artifactId ? state.byId[artifactId] : undefined))

  useInspectorOperations(artifactId)

  useEffect(() => {
    if (!artifactId) return
    void useArtifactStore.getState().getArtifact(artifactId).catch(() => undefined)
  }, [artifactId])

  // 未选中节点：保持 Inspector 固定面板，显示空态引导而非直接消失。
  if (!nodeId || !artifactId) {
    return (
      <aside
        aria-label={t('inspector.title')}
        className="flex w-80 shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface/40 px-6 text-center text-muted"
        data-testid="inspector-shell"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t('inspector.title')}</p>
        <p className="text-sm leading-5">{t('inspector.emptySelection')}</p>
      </aside>
    )
  }

  const isCollection = node?.data.kind === 'collection'
  const tabs = isCollection ? TABS : TABS.filter((item) => item.id !== 'collection')

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-panel" data-testid="inspector-shell" aria-label={t('inspector.title')}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t(`inspector.kind.${node?.data.kind ?? 'text'}`)}</p>
          <h3 className="truncate font-display text-base font-semibold text-foreground">{node?.data.role || t('inspector.untitled')}</h3>
        </div>
        <Button aria-label={t('inspector.close')} className="h-8 w-8 shrink-0 px-0" onClick={() => close()} variant="ghost">
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      </header>

      <nav aria-label={t('inspector.tabsLabel')} className="flex gap-1 border-b border-border px-3 pt-2">
        {tabs.map((item) => (
          <button
            aria-pressed={tab === item.id}
            className={cn(
              'rounded-t-md border-b-2 px-3 py-2 text-sm font-semibold text-muted transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              tab === item.id ? 'border-primary text-foreground' : 'border-transparent',
            )}
            key={item.id}
            onClick={() => setTab(item.id)}
            type="button"
          >
            {t(item.labelKey)}
          </button>
        ))}
      </nav>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {tab === 'overview' ? (
          <>
            <RunProgress artifactId={artifactId} />
            <ArtifactPreview artifactId={artifactId} />
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t('inspector.actions')}</p>
              <OperationActions artifactId={artifactId} />
            </section>
          </>
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
