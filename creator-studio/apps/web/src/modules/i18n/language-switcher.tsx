import { Languages } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import type { LocalePreference } from '@creator-studio/contracts'
import { sessionSelectors, useSessionStore } from '../session'
import { Select, useToastStore } from '../../shared/ui'
import { useLanguageStore } from './language-store'

export function LanguageSwitcher() {
  const { t } = useTranslation()
  const creatorProfile = useSessionStore(sessionSelectors.creatorProfile)
  const locale = useLanguageStore((state) => state.locale)
  const saving = useLanguageStore((state) => state.saving)
  const initializeFromProfile = useLanguageStore((state) => state.initializeFromProfile)
  const changeLocale = useLanguageStore((state) => state.changeLocale)
  const notify = useToastStore((state) => state.notify)

  useEffect(() => {
    if (creatorProfile) initializeFromProfile(creatorProfile.preferences.locale)
  }, [creatorProfile, initializeFromProfile])

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <Languages aria-hidden="true" className="h-4 w-4" />
      <span className="sr-only">{t('language.label')}</span>
      <Select
        aria-busy={saving}
        aria-label={t('language.label')}
        className="min-h-9 w-28"
        onValueChange={(value) => {
          void changeLocale(value as LocalePreference).catch(() => notify({ title: t('language.localApplied'), description: t('language.syncFailed') }))
        }}
        options={[
          { value: 'zh-CN', label: t('language.chinese') },
          { value: 'en-US', label: t('language.english') },
        ]}
        value={locale}
      />
    </label>
  )
}
