import type { CreatorProfilePatch, SectionKey } from '@creator-studio/contracts'
import { RefreshCw, UserRound } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { CreatorProfileForm, useCreatorProfileStore, VaultImportCard } from '../modules/creator-profile'
import { Button, EmptyState, Skeleton, useToastStore } from '../shared/ui'
import { RouteHeading } from './route-heading'

export default function CreatorProfilePage() {
  const { t } = useTranslation()
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

  async function handleSave(revision: number, patch: CreatorProfilePatch) {
    if (!profile) return
    const saved = await save(profile.id, revision, patch)
    if (saved) notify({ title: t('profile.saved') })
  }

  async function handleImport(vaultPath: string, targetSection: SectionKey) {
    const imported = await importVault(vaultPath, targetSection)
    if (imported) notify({ title: t('profile.importSuccess', { section: t(`profile.injectionSections.${imported[0]}`) }) })
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
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
        <div className="mt-8 space-y-6">
          <VaultImportCard importing={importing} onImport={(path, section) => handleImport(path, section)} />
          <CreatorProfileForm key={profile.revision} profile={profile} onSave={handleSave} saving={saving} />
        </div>
      ) : null}
    </div>
  )
}
