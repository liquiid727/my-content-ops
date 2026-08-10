import type { SettingsData } from '@creator-studio/contracts'
import { CheckCircle2, KeyRound, Palette, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLocalizedErrorMessage, i18n, LanguageSwitcher } from '../modules/i18n'
import { ThemeSwitcher } from '../modules/theme'
import { loadSettings, saveSetting, testSetting } from '../modules/settings'
import { Button, Input, Skeleton } from '../shared/ui'
import { RouteHeading } from './route-heading'

export default function SettingsPage() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<SettingsData>({ providers: [], connectors: [] })
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string>()
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const providerCredential = useRef<HTMLInputElement>(null)
  const [larkCommand, setLarkCommand] = useState('seed-lark')
  const larkCredential = useRef<HTMLInputElement>(null)
  const [vaultRoot, setVaultRoot] = useState('')
  const obsidianCredential = useRef<HTMLInputElement>(null)

  const applyLoadedSettings = (data: SettingsData) => {
    const loadedLark = data.connectors.find((item) => item.key === 'lark_cli')?.config.command
    const loadedObsidian = data.connectors.find((item) => item.key === 'obsidian')?.config.vaultRoot
    setSettings(data)
    setLarkCommand(typeof loadedLark === 'string' ? loadedLark : 'seed-lark')
    setVaultRoot(typeof loadedObsidian === 'string' ? loadedObsidian : '')
  }

  const reload = async () => {
    setLoading(true)
    try { const response = await loadSettings(); applyLoadedSettings(response.data); setError(undefined) }
    catch (caught) { setError(getLocalizedErrorMessage(caught, t, 'settings.loadFailed')) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    let active = true
    loadSettings().then((response) => { if (active) { applyLoadedSettings(response.data); setError(undefined) } })
      .catch((caught: unknown) => { if (active) setError(getLocalizedErrorMessage(caught, i18n.t, 'settings.loadFailed')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function save(path: string, value: unknown) {
    setWorking(path); setError(undefined); setNotice(undefined)
    try {
      const response = await saveSetting(path, value)
      setSettings(response.data)
      for (const field of [providerCredential, larkCredential, obsidianCredential]) if (field.current) field.current.value = ''
      setNotice(t('settings.saved'))
    } catch (caught) { setError(getLocalizedErrorMessage(caught, t, 'settings.saveFailed')) }
    finally { setWorking(undefined) }
  }

  async function test(path: string) {
    setWorking(path); setError(undefined); setNotice(undefined)
    try { await testSetting(path); setNotice(t('settings.connectionSuccess')) }
    catch (caught) { setError(getLocalizedErrorMessage(caught, t, 'settings.checkFailed')) }
    finally { setWorking(undefined) }
  }

  const seed = settings.providers.find((item) => item.key === 'seed')
  const lark = settings.connectors.find((item) => item.key === 'lark_cli')
  const obsidian = settings.connectors.find((item) => item.key === 'obsidian')
  const busy = (path: string) => working === path

  return (
    <div className="mx-auto w-full max-w-6xl">
      <RouteHeading description={t('settings.description')} eyebrow={t('settings.eyebrow')} title={t('settings.title')} />
      {error ? <div className="mt-5 flex flex-col gap-3 rounded-md border border-danger/40 bg-danger/10 p-4 sm:flex-row sm:items-center sm:justify-between" role="alert"><span>{error}</span><Button onClick={() => void reload()}><RefreshCw className="h-4 w-4" />{t('common.retry')}</Button></div> : null}
      {notice ? <p className="mt-5 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-primary" role="status">{notice}</p> : null}
      {loading ? <div aria-label={t('settings.loading')} className="mt-7 grid gap-5 sm:grid-cols-2" role="status"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div> : (
        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <section className="rounded-lg border border-border bg-surface p-5"><Palette className="h-5 w-5 text-primary" /><h2 className="mt-4 font-display text-2xl font-semibold">{t('settings.appearance')}</h2><p className="mt-2 text-sm text-muted">{t('settings.appearanceDescription')}</p><div className="mt-5 flex flex-wrap gap-2"><div className="inline-flex rounded-md border border-border bg-elevated p-2"><ThemeSwitcher /></div><div className="inline-flex rounded-md border border-border bg-elevated p-2"><LanguageSwitcher /></div></div></section>

          <section className="rounded-lg border border-border bg-surface p-5"><KeyRound className="h-5 w-5 text-primary" /><h2 className="mt-4 font-display text-2xl font-semibold">{t('settings.provider')}</h2><p className="mt-2 text-sm text-muted">Seed Provider · {seed?.configured ? t('settings.configuredCredential') : t('settings.unconfiguredCredential')}</p><Input aria-label={t('settings.providerCredential')} className="mt-5" placeholder={t('settings.secretPlaceholder')} ref={providerCredential} type="password" /><div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy('/providers/seed')} onClick={() => { const credential = providerCredential.current?.value; void save('/providers/seed', { displayName: 'Seed Provider', enabled: true, model: 'seed-text-v1', ...(credential ? { credential } : {}) }) }}>{busy('/providers/seed') ? t('common.saving') : t('common.save')}</Button><Button disabled={busy('/providers/seed/test')} onClick={() => void test('/providers/seed/test')}>{busy('/providers/seed/test') ? t('settings.checking') : t('settings.testConnection')}</Button></div></section>

          <section className="rounded-lg border border-border bg-surface p-5"><CheckCircle2 className="h-5 w-5 text-primary" /><h2 className="mt-4 font-display text-2xl font-semibold">Lark CLI</h2><p className="mt-2 text-sm text-muted">{lark?.configured ? t('settings.configuredCredential') : t('settings.unconfiguredCredential')} · {t('settings.stubOnly')}</p><Input aria-label={t('settings.larkCommand')} className="mt-5" onChange={(event) => setLarkCommand(event.target.value)} value={larkCommand} /><Input aria-label={t('settings.larkCredential')} className="mt-3" ref={larkCredential} type="password" /><div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy('/connectors/lark_cli')} onClick={() => { const credential = larkCredential.current?.value; void save('/connectors/lark_cli', { enabled: true, command: larkCommand, args: [], ...(credential ? { credential } : {}) }) }}>{busy('/connectors/lark_cli') ? t('common.saving') : t('common.save')}</Button><Button disabled={busy('/connectors/lark_cli/test')} onClick={() => void test('/connectors/lark_cli/test')}>{busy('/connectors/lark_cli/test') ? t('settings.checking') : t('settings.testConnection')}</Button></div></section>

          <section className="rounded-lg border border-border bg-surface p-5"><CheckCircle2 className="h-5 w-5 text-primary" /><h2 className="mt-4 font-display text-2xl font-semibold">Obsidian</h2><p className="mt-2 text-sm text-muted">{obsidian?.configured ? t('settings.configuredCredential') : t('settings.unconfiguredCredential')} · {t('settings.stubOnly')}</p><Input aria-label={t('settings.obsidianRoot')} className="mt-5" onChange={(event) => setVaultRoot(event.target.value)} placeholder={t('settings.absolutePath')} value={vaultRoot} /><Input aria-label={t('settings.obsidianCredential')} className="mt-3" ref={obsidianCredential} type="password" /><div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy('/connectors/obsidian')} onClick={() => { const credential = obsidianCredential.current?.value; void save('/connectors/obsidian', { enabled: true, vaultRoot, ...(credential ? { credential } : {}) }) }}>{busy('/connectors/obsidian') ? t('common.saving') : t('common.save')}</Button><Button disabled={busy('/connectors/obsidian/test')} onClick={() => void test('/connectors/obsidian/test')}>{busy('/connectors/obsidian/test') ? t('settings.checking') : t('settings.testConnection')}</Button></div></section>
        </div>
      )}
    </div>
  )
}
