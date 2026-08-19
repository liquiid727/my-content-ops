import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'

import { artifactApi } from '../api/artifact-api'
import { useArtifactStore } from '../artifacts/artifact-store'
import { Button } from '../../shared/ui'

export function VersionHistory({ artifactId }: { artifactId: string }) {
  const { t } = useTranslation()
  const versions = useArtifactStore((state) => state.versions[artifactId])
  const [error, setError] = useState<string>()
  const [restoring, setRestoring] = useState<string>()

  useEffect(() => {
    let active = true
    useArtifactStore.getState().getVersions(artifactId)
      .catch(() => { if (active) setError(t('inspector.loadVersionsFailed')) })
    return () => { active = false }
  }, [artifactId, t])

  async function restore(versionId: string): Promise<void> {
    setRestoring(versionId)
    try {
      await artifactApi.restore(artifactId, versionId)
      useArtifactStore.getState().invalidate(artifactId)
      await useArtifactStore.getState().getVersions(artifactId).catch(() => undefined)
    } catch {
      setError(t('inspector.restoreFailed'))
    } finally {
      setRestoring(undefined)
    }
  }

  if (error) return <p className="text-xs text-danger" role="alert">{error}</p>
  if (!versions) return <p className="text-xs text-muted">{t('inspector.loadingVersions')}</p>
  if (versions.length === 0) return <p className="text-xs text-muted">{t('inspector.noVersions')}</p>

  return (
    <ol className="space-y-2" data-testid="inspector-versions">
      {versions.map((version) => (
        <li className="rounded-md border border-border bg-surface/60 p-3" key={version.id}>
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-muted">v{version.versionNumber}</span>
            <span className="text-muted">{t(`inspector.versionSource.${version.source}`)}</span>
            <span className="ml-auto text-[10px] text-muted">{new Date(version.createdAt).toLocaleString()}</span>
          </div>
          <Button className="mt-2 h-7 px-2 text-xs" disabled={restoring === version.id} onClick={() => void restore(version.id)} variant="secondary">
            <RotateCcw aria-hidden="true" className="h-3 w-3" />
            {t('inspector.restore')}
          </Button>
        </li>
      ))}
    </ol>
  )
}
