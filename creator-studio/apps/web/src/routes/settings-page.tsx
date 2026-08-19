import type { SettingsData } from '@creator-studio/contracts'
import { ChevronRight, DatabaseZap, KeyRound, Palette, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLocalizedErrorMessage, i18n, LanguageSwitcher } from '../modules/i18n'
import { ConnectionsPanel } from '../modules/connections'
import { ThemeSwitcher } from '../modules/theme'
import { loadSettings, saveSetting, testSetting } from '../modules/settings'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Skeleton } from '../shared/ui'
import { RouteHeading } from './route-heading'

type SettingsPanel = 'appearance' | 'provider' | 'connections'

export default function SettingsPage() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<SettingsData>({ providers: [], connectors: [] })
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string>()
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [activePanel, setActivePanel] = useState<SettingsPanel | null>(null)
  const providerCredential = useRef<HTMLInputElement>(null)
  const providerModel = useRef<HTMLInputElement>(null)
  const providerImageModel = useRef<HTMLInputElement>(null)
  const providerBaseUrl = useRef<HTMLInputElement>(null)

  const applyLoadedSettings = (data: SettingsData) => {
    setSettings(data)
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

  async function save(path: string, value: unknown): Promise<boolean> {
    setWorking(path); setError(undefined); setNotice(undefined)
    try {
      const response = await saveSetting(path, value)
      setSettings(response.data)
      if (providerCredential.current) providerCredential.current.value = ''
      setNotice(t('settings.saved'))
      return true
    } catch (caught) { setError(getLocalizedErrorMessage(caught, t, 'settings.saveFailed')); return false }
    finally { setWorking(undefined) }
  }

  async function test(path: string) {
    setWorking(path); setError(undefined); setNotice(undefined)
    try { await testSetting(path); setNotice(t('settings.connectionSuccess')) }
    catch (caught) { setError(getLocalizedErrorMessage(caught, t, 'settings.checkFailed')) }
    finally { setWorking(undefined) }
  }

  const provider = settings.providers.find((item) => item.key === 'openai') ?? settings.providers.find((item) => item.key === 'seed')
  const busy = (path: string) => working === path
  const panelTitle = activePanel === 'appearance' ? t('settings.appearance') : activePanel === 'provider' ? t('settings.provider') : '外部资料连接'
  const panelDescription = activePanel === 'appearance'
    ? t('settings.appearanceDescription')
    : activePanel === 'provider'
      ? `OpenAI Compatible · ${provider?.configured ? t('settings.configuredCredential') : t('settings.unconfiguredCredential')}`
      : '管理 Obsidian、文件夹和飞书的安装、认证、权限与索引状态。'

  const closeAfterSave = async (path: string, value: unknown) => {
    if (await save(path, value)) setActivePanel(null)
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <RouteHeading description={t('settings.description')} eyebrow={t('settings.eyebrow')} title={t('settings.title')} />
      {error ? <div className="mt-5 flex flex-col gap-3 rounded-md border border-danger/40 bg-danger/10 p-4 sm:flex-row sm:items-center sm:justify-between" role="alert"><span>{error}</span><Button onClick={() => void reload()}><RefreshCw className="h-4 w-4" />{t('common.retry')}</Button></div> : null}
      {notice ? <p className="mt-5 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-primary" role="status">{notice}</p> : null}
      {loading ? <div aria-label={t('settings.loading')} className="mt-6 space-y-px overflow-hidden rounded-2xl border border-border bg-border" role="status"><Skeleton className="h-20 rounded-none" /><Skeleton className="h-20 rounded-none" /><Skeleton className="h-20 rounded-none" /><Skeleton className="h-20 rounded-none" /></div> : (
        <section aria-label={t('settings.title')} className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface">
          {([
            { key: 'appearance' as const, label: t('settings.appearance'), detail: `${t('theme.label')} · ${t('language.label')}`, icon: Palette, ready: true },
            { key: 'provider' as const, label: t('settings.provider'), detail: `Text + Images · ${provider?.configured ? t('settings.configuredCredential') : t('settings.unconfiguredCredential')}`, icon: KeyRound, ready: Boolean(provider?.configured) },
            { key: 'connections' as const, label: '外部资料连接', detail: 'Obsidian · 文件夹 · 飞书 / Lark', icon: DatabaseZap, ready: true },
          ]).map(({ key, label, detail, icon: Icon, ready }) => (
            <Button
              aria-label={label}
              className="group flex min-h-20 w-full justify-start rounded-none border-0 border-b border-border px-5 py-4 text-left last:border-b-0 hover:bg-elevated/65"
              key={key}
              onClick={() => setActivePanel(key)}
              variant="ghost"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-elevated text-primary"><Icon aria-hidden="true" className="h-[1.1rem] w-[1.1rem]" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-base font-semibold text-foreground">{label}</span>
                <span className="mt-1 block truncate text-xs font-normal text-muted">{detail}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className={`hidden text-xs sm:inline ${ready ? 'text-success' : 'text-muted'}`}>{ready ? t('settings.ready') : t('settings.actionRequired')}</span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </span>
            </Button>
          ))}
        </section>
      )}

      <Dialog onOpenChange={(open) => { if (!open) setActivePanel(null) }} open={activePanel !== null}>
        {activePanel ? (
          <DialogContent className="max-w-xl p-0">
            <div className="border-b border-border px-6 py-5 pr-14">
              <DialogTitle>{panelTitle}</DialogTitle>
              <DialogDescription>{panelDescription}</DialogDescription>
            </div>

            {activePanel === 'appearance' ? (
              <div className="flex flex-wrap gap-3 px-6 py-6"><div className="inline-flex rounded-lg border border-border bg-elevated p-2"><ThemeSwitcher /></div><div className="inline-flex rounded-lg border border-border bg-elevated p-2"><LanguageSwitcher /></div></div>
            ) : null}

            {activePanel === 'provider' ? (
              <div className="space-y-4 px-6 py-6"><label className="block text-xs font-semibold text-muted">API Key<Input aria-label={t('settings.providerCredential')} className="mt-2" placeholder={t('settings.secretPlaceholder')} ref={providerCredential} type="password" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold text-muted">文本模型<Input className="mt-2" defaultValue={String(provider?.config.model ?? '')} placeholder="由 Provider 配置" ref={providerModel} /></label><label className="block text-xs font-semibold text-muted">图像模型<Input className="mt-2" defaultValue={String(provider?.config.imageModel ?? '')} placeholder="由 Provider 配置" ref={providerImageModel} /></label></div><label className="block text-xs font-semibold text-muted">API Base URL<Input className="mt-2" defaultValue={String(provider?.config.baseUrl ?? '')} placeholder="https://api.openai.com/v1" ref={providerBaseUrl} /></label><p className="text-xs leading-5 text-muted">模型 ID 不在应用代码中写死。图片生成、参考图与蒙版编辑共用这里的图像模型配置。</p><div className="mt-5 flex justify-end gap-2"><Button disabled={busy('/providers/openai/test')} onClick={() => void test('/providers/openai/test')}>{busy('/providers/openai/test') ? t('settings.checking') : t('settings.testConnection')}</Button><Button disabled={busy('/providers/openai')} onClick={() => { const credential = providerCredential.current?.value; void closeAfterSave('/providers/openai', { displayName: 'OpenAI Compatible', enabled: true, model: providerModel.current?.value || undefined, imageModel: providerImageModel.current?.value || undefined, baseUrl: providerBaseUrl.current?.value || undefined, ...(credential ? { credential } : {}) }) }} variant="primary">{busy('/providers/openai') ? t('common.saving') : t('common.save')}</Button></div></div>
            ) : null}

            {activePanel === 'connections' ? <ConnectionsPanel /> : null}
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  )
}
