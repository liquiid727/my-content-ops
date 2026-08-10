import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import type { ThemePreference } from '@creator-studio/contracts'
import { sessionSelectors, useSessionStore } from '../session'
import { Select } from '../../shared/ui'
import { useToastStore } from '../../shared/ui'
import { useThemeStore } from './theme-store'

const themeIcons = {
  dark: Moon,
  light: Sun,
  system: Monitor,
}

export function ThemeSwitcher() {
  const { t } = useTranslation()
  const { theme = 'dark', setTheme } = useTheme()
  const creatorProfile = useSessionStore(sessionSelectors.creatorProfile)
  const syncPreference = useThemeStore((state) => state.syncPreference)
  const saving = useThemeStore((state) => state.saving)
  const notify = useToastStore((state) => state.notify)
  const initialized = useRef(false)
  const selectedTheme = theme in themeIcons ? theme : 'dark'
  const Icon = themeIcons[selectedTheme as keyof typeof themeIcons]

  useEffect(() => {
    if (initialized.current || !creatorProfile) return
    initialized.current = true
    const storage = globalThis.localStorage
    if (typeof storage?.getItem !== 'function' || !storage.getItem('creator-studio-theme')) setTheme(creatorProfile.preferences.theme)
  }, [creatorProfile, setTheme])

  const changeTheme = (nextTheme: ThemePreference) => {
    setTheme(nextTheme)
    void syncPreference(nextTheme).catch(() => notify({ title: t('theme.localApplied'), description: t('theme.syncFailed') }))
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <Icon aria-hidden="true" className="h-4 w-4" />
      <span className="sr-only">{t('theme.label')}</span>
      <Select
        aria-busy={saving}
        aria-label={t('theme.label')}
        className="min-h-9 w-28"
        onValueChange={(value) => changeTheme(value as ThemePreference)}
        options={[
          { value: 'dark', label: t('theme.dark') },
          { value: 'light', label: t('theme.light') },
          { value: 'system', label: t('theme.system') },
        ]}
        value={selectedTheme}
      />
    </label>
  )
}
