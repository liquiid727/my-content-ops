import { injectScopeSchema, renderContext, type CreatorProfilePatch, type InjectScope, type SectionKey } from '@creator-studio/contracts'
import { RefreshCw, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  CreatorProfileForm,
  CreatorProfileOverview,
  type CreatorProfileEditorSection,
  useCreatorProfileStore,
  VaultImportCard,
} from '../modules/creator-profile'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, EmptyState, Select, Skeleton, useToastStore } from '../shared/ui'
import { RouteHeading } from './route-heading'

const SCOPES = injectScopeSchema.options

export default function CreatorProfilePage() {
  const { t } = useTranslation()
  const [editor, setEditor] = useState<CreatorProfileEditorSection | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewScope, setPreviewScope] = useState<InjectScope>('project')
  const profile = useCreatorProfileStore((state) => state.profile)
  const loading = useCreatorProfileStore((state) => state.loading)
  const saving = useCreatorProfileStore((state) => state.saving)
  const importing = useCreatorProfileStore((state) => state.importing)
  const error = useCreatorProfileStore((state) => state.error)
  const revisionConflict = useCreatorProfileStore((state) => state.revisionConflict)
  const load = useCreatorProfileStore((state) => state.load)
  const save = useCreatorProfileStore((state) => state.save)
  const importVault = useCreatorProfileStore((state) => state.importVault)
  const clearError = useCreatorProfileStore((state) => state.clearError)
  const notify = useToastStore((state) => state.notify)

  useEffect(() => {
    void load()
  }, [load])

  const previewText = useMemo(
    () => profile ? renderContext(profile.profile, profile.injection, previewScope) : '',
    [profile, previewScope],
  )

  async function handleSave(revision: number, patch: CreatorProfilePatch): Promise<boolean> {
    if (!profile) return false
    const saved = await save(profile.id, revision, patch)
    if (saved) notify({ title: t('profile.saved') })
    return Boolean(saved)
  }

  async function handleImport(vaultPath: string, targetSection: SectionKey): Promise<boolean> {
    const imported = await importVault(vaultPath, targetSection)
    if (imported) notify({ title: t('profile.importSuccess', { section: t(`profile.injectionSections.${imported[0]}`) }) })
    return Boolean(imported)
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <RouteHeading
        description={t('profile.description')}
        eyebrow={t('profile.eyebrow')}
        title={t('profile.title')}
      />

      {error && !revisionConflict ? (
        <div className="mt-6 flex items-center justify-between gap-4 rounded-md border border-danger/40 bg-danger/10 p-4" role="alert">
          <p className="text-sm text-danger">{error}</p>
          <Button onClick={() => void load()}><RefreshCw aria-hidden="true" className="h-4 w-4" />{t('common.retry')}</Button>
        </div>
      ) : null}

      {revisionConflict ? (
        <div className="mt-6 flex items-center justify-between gap-4 rounded-md border border-primary/40 bg-primary/10 p-4" role="status">
          <p className="text-sm text-primary">{t('profile.conflict')}</p>
          <Button onClick={() => { clearError(); void load() }} variant="primary">{t('profile.reload')}</Button>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-8 space-y-4" role="status">
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-40" />
        </div>
      ) : null}

      {!loading && !profile && !error ? (
        <div className="mt-8">
          <EmptyState
            description={t('profile.emptyDescription')}
            icon={<UserRound aria-hidden="true" className="h-5 w-5" />}
            title={t('profile.empty')}
          />
        </div>
      ) : null}

      {!loading && profile ? (
        <div className="mt-8">
          <CreatorProfileOverview
            onEdit={setEditor}
            onOpenImport={() => setImportOpen(true)}
            onOpenPreview={() => setPreviewOpen(true)}
            profile={profile}
          />

          <Dialog open={editor !== null} onOpenChange={(open) => { if (!open) setEditor(null) }}>
            {editor ? (
              <DialogContent className="flex max-h-[86vh] max-w-3xl flex-col overflow-hidden p-0">
                <div className="shrink-0 border-b border-border px-6 py-5 pr-14 sm:px-7">
                  <DialogTitle>{t('profile.editTitle', { section: t(`profile.${editor}`) })}</DialogTitle>
                  <DialogDescription>{t(`profile.editorDescriptions.${editor}`)}</DialogDescription>
                </div>
                <CreatorProfileForm
                  key={`${profile.revision}-${editor}`}
                  onCancel={() => setEditor(null)}
                  onSave={handleSave}
                  profile={profile}
                  saving={saving}
                  section={editor}
                />
              </DialogContent>
            ) : null}
          </Dialog>

          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="max-w-3xl">
              <DialogTitle>{t('profile.preview')}</DialogTitle>
              <DialogDescription>{t('profile.previewDescription')}</DialogDescription>
              <div className="mt-5 flex max-w-xs items-center gap-3">
                <span className="text-sm font-semibold">{t('profile.previewScope')}</span>
                <Select
                  aria-label={t('profile.previewScope')}
                  onValueChange={(value) => setPreviewScope(value as InjectScope)}
                  options={SCOPES.map((value) => ({ value, label: t(`profile.scope.${value}`) }))}
                  value={previewScope}
                />
              </div>
              <pre className="mt-4 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-elevated p-4 text-xs leading-5 text-foreground">
                {previewText || t('profile.previewEmpty')}
              </pre>
            </DialogContent>
          </Dialog>

          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogContent className="flex max-w-2xl flex-col overflow-hidden p-0">
              <div className="border-b border-border px-6 py-5 pr-14 sm:px-7">
                <DialogTitle>{t('profile.importTitle')}</DialogTitle>
                <DialogDescription>{t('profile.importDescription')}</DialogDescription>
              </div>
              <VaultImportCard
                importing={importing}
                onCancel={() => setImportOpen(false)}
                onImport={handleImport}
              />
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
    </div>
  )
}
