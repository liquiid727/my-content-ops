import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Columns2, RefreshCw, Trash2 } from 'lucide-react'

import type { ArtifactVersion } from '@creator-studio/contracts'
import { artifactApi } from '../api/artifact-api'
import { canvasApi } from '../api/canvas-api'
import { useArtifactStore } from '../artifacts/artifact-store'
import { useCanvasStore } from '../store/canvas-store'
import { useRunStore } from '../runtime/run-store'
import { useInspectorStore } from './inspector-store'
import { executeOperation } from './run-operation'
import { Button } from '../../shared/ui'

function versionText(version: ArtifactVersion | undefined): string {
  const ref = version?.contentRef
  return ref?.type === 'inline' ? ref.text : ''
}

/** Collection 节点面板：候选网格 + Select/Compare/Regenerate/Promote/Delete。 */
export function CollectionPanel({ artifactId }: { artifactId: string }) {
  const { t } = useTranslation()
  const projectId = useCanvasStore((state) => state.projectId)
  const versions = useArtifactStore((state) => state.versions[artifactId])
  const detail = useArtifactStore((state) => state.byId[artifactId])
  const [compare, setCompare] = useState<string[]>([])
  const [busy, setBusy] = useState<string>()

  const candidates = versions ?? []
  const currentVersionId = detail?.currentVersionId

  const producingRun = useMemo(
    () => Object.values(useRunStore.getState().byId).find((run) => run.outputArtifactIds?.includes(artifactId)),
    [artifactId],
  )

  async function select(versionId: string): Promise<void> {
    setBusy(versionId)
    try {
      await artifactApi.restore(artifactId, versionId)
      useArtifactStore.getState().invalidate(artifactId)
      await useArtifactStore.getState().getVersions(artifactId).catch(() => undefined)
    } finally {
      setBusy(undefined)
    }
  }

  function toggleCompare(versionId: string): void {
    setCompare((current) => (current.includes(versionId) ? current.filter((id) => id !== versionId) : current.length >= 2 ? [...current.slice(1), versionId] : [...current, versionId]))
  }

  async function regenerate(): Promise<void> {
    if (!projectId || !producingRun?.sourceArtifactId) return
    setBusy('regenerate')
    try {
      await executeOperation({
        operationId: producingRun.operationId,
        projectId,
        sourceArtifactId: producingRun.sourceArtifactId,
        config: {},
      })
    } finally {
      setBusy(undefined)
    }
  }

  async function remove(): Promise<void> {
    if (!window.confirm(t('inspector.deleteCollectionConfirm'))) return
    setBusy('delete')
    try {
      const node = useCanvasStore.getState().nodes.find((n) => n.data.artifactId === artifactId)
      if (node) await canvasApi.deleteNode(node.id).catch(() => undefined)
      await artifactApi.deleteArtifact(artifactId)
      useArtifactStore.getState().invalidate(artifactId)
      useInspectorStore.getState().close()
      await useCanvasStore.getState().loadGraph(useCanvasStore.getState().projectId ?? '', true).catch(() => undefined)
    } finally {
      setBusy(undefined)
    }
  }

  if (candidates.length === 0) {
    return <p className="text-xs text-muted">{t('inspector.noCollectionCandidates')}</p>
  }

  const compareVersions = compare.map((id) => candidates.find((version) => version.id === id)).filter((version): version is ArtifactVersion => version !== undefined)

  return (
    <div className="space-y-3" data-testid="inspector-collection">
      <div className="grid grid-cols-2 gap-2">
        {candidates.map((version) => {
          const active = version.id === currentVersionId
          const inCompare = compare.includes(version.id)
          return (
            <div className={`rounded-md border p-2 ${active ? 'border-primary ring-1 ring-primary/30' : 'border-border bg-surface/60'}`} key={version.id}>
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-[10px] text-muted">v{version.versionNumber}</span>
                {active ? <Check aria-hidden="true" className="h-3.5 w-3.5 text-primary" /> : null}
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[10px] leading-4 text-muted-foreground">{versionText(version) || '—'}</p>
              <div className="mt-2 flex gap-1">
                <Button className="h-6 flex-1 px-1 text-[10px]" disabled={busy !== undefined} onClick={() => void select(version.id)} variant={active ? 'secondary' : 'primary'}>
                  {active ? t('inspector.promote') : t('inspector.select')}
                </Button>
                <Button className="h-6 px-1 text-[10px]" disabled={busy !== undefined} onClick={() => toggleCompare(version.id)} variant={inCompare ? 'primary' : 'secondary'}>
                  <Columns2 aria-hidden="true" className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {compareVersions.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface/60 p-2">
          {compareVersions.map((version) => (
            <div key={version.id}>
              <p className="font-mono text-[10px] text-muted">v{version.versionNumber}</p>
              <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-muted-foreground">{versionText(version) || '—'}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button className="h-8 flex-1 text-xs" disabled={busy !== undefined || !producingRun?.sourceArtifactId} onClick={() => void regenerate()}>
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          {t('inspector.regenerate')}
        </Button>
        <Button className="h-8 text-xs" disabled={busy !== undefined} onClick={() => void remove()} variant="danger">
          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
          {t('inspector.delete')}
        </Button>
      </div>
    </div>
  )
}
