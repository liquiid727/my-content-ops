import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Save, X } from 'lucide-react'

import type { ArtifactDetail } from '@creator-studio/contracts'
import { artifactApi } from '../api/artifact-api'
import { useArtifactStore } from '../artifacts/artifact-store'
import { assetContentUrl, versionAssetId } from '../lib/media'
import { Button } from '../../shared/ui'
import { Textarea } from '../../shared/ui'

function contentText(detail: ArtifactDetail | undefined): string {
  const ref = detail?.currentVersion?.contentRef
  return ref?.type === 'inline' ? ref.text : ''
}

/** 媒体 artifact 预览：image → 图片；audio → 播放器；否则回退文本。 */
function MediaPreview({ detail }: { detail: ArtifactDetail }) {
  const assetId = versionAssetId(detail.currentVersion)
  if (!assetId) return null
  if (detail.kind === 'image' || detail.kind === 'collection') {
    return <img alt="" className="max-h-56 w-full rounded border border-border/70 object-cover" src={assetContentUrl(assetId)} />
  }
  if (detail.kind === 'audio') {
    return <audio className="w-full" controls src={assetContentUrl(assetId)} />
  }
  return null
}

/** Artifact Preview + 手动编辑（revisionedPatch → 新 Version(source=user)）。 */
export function ArtifactPreview({ artifactId }: { artifactId: string }) {
  const { t } = useTranslation()
  const detail = useArtifactStore((state) => state.byId[artifactId])
  const loadError = useArtifactStore((state) => state.errors[artifactId])
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string>()

  if (loadError) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 p-3" role="alert">
        <p className="text-xs text-danger">{t('inspector.previewLoadFailed')}</p>
        <Button className="mt-2 h-7 px-2 text-xs" onClick={() => void useArtifactStore.getState().refreshArtifact(artifactId).catch(() => undefined)} variant="ghost">
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  if (!detail) {
    return <p className="text-xs text-muted">{t('inspector.loadingPreview')}</p>
  }

  const preview = contentText(detail)

  const beginEdit = (): void => {
    setText(contentText(detail))
    setError(undefined)
    setEditing(true)
  }

  const save = async (): Promise<void> => {
    setError(undefined)
    try {
      await artifactApi.update(artifactId, detail.revision, { text })
      useArtifactStore.getState().invalidate(artifactId)
      await useArtifactStore.getState().refreshArtifact(artifactId).catch(() => undefined)
      setEditing(false)
    } catch {
      setError(t('inspector.saveFailed'))
    }
  }

  return (
    <div className="rounded-md border border-border bg-surface/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t('inspector.preview')}</p>
        {!editing && detail.kind === 'text' ? (
          <Button className="h-7 px-2 text-xs" onClick={() => beginEdit()} variant="ghost">
            <Pencil aria-hidden="true" className="h-3 w-3" />
            {t('inspector.edit')}
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2">
          <Textarea onChange={(event) => setText(event.target.value)} rows={8} value={text} />
          {error ? <p className="mt-1 text-xs text-danger" role="alert">{error}</p> : null}
          <div className="mt-2 flex gap-2">
            <Button className="h-8 px-3 text-xs" onClick={() => void save()}>
              <Save aria-hidden="true" className="h-3.5 w-3.5" />
              {t('inspector.save')}
            </Button>
            <Button className="h-8 px-3 text-xs" onClick={() => setEditing(false)} variant="ghost">
              <X aria-hidden="true" className="h-3.5 w-3.5" />
              {t('inspector.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        versionAssetId(detail.currentVersion) ? (
          <div className="mt-2 overflow-hidden rounded bg-background/50 p-2">
            <MediaPreview detail={detail} />
          </div>
        ) : (
          <div className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-background/50 p-2 text-xs leading-5 text-foreground">
            {preview || <span className="text-muted">{t('inspector.emptyPreview')}</span>}
          </div>
        )
      )}
    </div>
  )
}
