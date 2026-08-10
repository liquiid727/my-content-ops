import type { AssetKind } from '@creator-studio/contracts'
import { FileBox, RefreshCw, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import { useAssetStore } from '../modules/assets'
import { formatNumber, normalizeLocale } from '../modules/i18n'
import { Button, EmptyState, Input, Select, Skeleton } from '../shared/ui'
import { RouteHeading } from './route-heading'

export default function AssetsPage() {
  const { t, i18n } = useTranslation()
  const locale = normalizeLocale(i18n.language)
  const [searchParams] = useSearchParams()
  const assets = useAssetStore((state) => state.assets)
  const loading = useAssetStore((state) => state.loading)
  const error = useAssetStore((state) => state.error)
  const load = useAssetStore((state) => state.load)
  const hasMore = useAssetStore((state) => state.hasMore)
  const nextCursor = useAssetStore((state) => state.nextCursor)
  const uploading = useAssetStore((state) => state.uploading)
  const uploadError = useAssetStore((state) => state.uploadError)
  const uploadAsset = useAssetStore((state) => state.upload)
  const fileInput = useRef<HTMLInputElement>(null)
  const [type, setType] = useState<AssetKind | undefined>()
  const [projectId, setProjectId] = useState(searchParams.get('projectId') ?? '')
  const filter = { ...(type ? { type } : {}), ...(projectId ? { projectId } : {}) }

  useEffect(() => { void load({ ...(type ? { type } : {}), ...(projectId ? { projectId } : {}) }) }, [load, type, projectId])

  return (
    <div className="mx-auto w-full max-w-6xl">
      <RouteHeading action={<Button disabled={uploading} onClick={() => fileInput.current?.click()} variant="primary"><Upload className="h-4 w-4" />{uploading ? t('assets.uploading') : t('assets.upload')}</Button>} description={t('assets.description')} eyebrow={t('assets.eyebrow')} title={t('assets.title')} />
      <input className="sr-only" ref={fileInput} type="file" aria-label={t('assets.chooseFile')} accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,video/mp4,application/pdf,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file, projectId || undefined).catch(() => undefined).finally(() => { event.target.value = '' }) }} />
      {uploadError ? <p className="mt-5 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert">{uploadError}</p> : null}
      <div className="mt-7 grid gap-3 border-y border-border py-3 sm:grid-cols-[12rem_1fr]">
        <Select
          aria-label={t('assets.filterType')}
          onValueChange={(value) => setType(value === 'all' ? undefined : value as AssetKind)}
          options={[
            { value: 'all', label: t('assets.allTypes') },
            { value: 'image', label: t('assets.image') },
            { value: 'audio', label: t('assets.audio') },
            { value: 'video', label: t('assets.video') },
            { value: 'document', label: t('assets.document') },
            { value: 'other', label: t('assets.other') },
          ]}
          value={type ?? 'all'}
        />
        <Input aria-label={t('assets.filterProject')} onChange={(event) => setProjectId(event.target.value.trim())} placeholder={t('assets.filterPlaceholder')} value={projectId} />
      </div>
      {loading && assets.length === 0 ? <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label={t('assets.loading')}>{[1, 2, 3].map((item) => <Skeleton className="h-48" key={item} />)}</div> : null}
      {error ? <div className="mt-6 rounded-md border border-danger/40 bg-danger/10 p-4" role="alert"><p className="text-sm text-danger">{error}</p><Button className="mt-3" onClick={() => void load(filter)}><RefreshCw className="h-4 w-4" />{t('common.retry')}</Button></div> : null}
      {!loading && !error && assets.length === 0 ? <div className="mt-8"><EmptyState description={t('assets.emptyDescription')} icon={<FileBox className="h-5 w-5" />} title={t('assets.empty')} /></div> : null}
      {assets.length > 0 ? <div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">{assets.map((asset) => <article className="bg-surface p-5" key={asset.id}><span className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">{t(`assets.${asset.type}`)}</span><h2 className="mt-5 truncate font-display text-xl font-semibold">{asset.name}</h2><p className="mt-2 text-xs text-muted">{asset.mimeType} · {t('assets.size', { size: formatNumber(asset.size, locale) })}</p><a className="mt-5 inline-flex text-sm font-semibold text-primary hover:underline" href={asset.contentUrl}>{t('assets.readFile')}</a></article>)}</div> : null}
      {hasMore && nextCursor ? <div className="mt-6 text-center"><Button disabled={loading} onClick={() => void load(filter, nextCursor)}>{t('common.loadMore')}</Button></div> : null}
    </div>
  )
}
