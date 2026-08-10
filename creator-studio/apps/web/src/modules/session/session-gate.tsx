import { AlertTriangle, LoaderCircle } from 'lucide-react'
import { type PropsWithChildren, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import '../i18n/i18n'
import { Button } from '../../shared/ui'
import { sessionSelectors, useSessionStore } from './session-store'

export function SessionGate({ children }: PropsWithChildren) {
  const { t } = useTranslation()
  const status = useSessionStore(sessionSelectors.status)
  const error = useSessionStore(sessionSelectors.error)
  const requestId = useSessionStore(sessionSelectors.requestId)
  const bootstrap = useSessionStore((state) => state.bootstrap)
  useEffect(() => { void bootstrap().catch(() => undefined) }, [bootstrap])

  if (status === 'ready') return children
  if (status === 'error') return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <section className="w-full max-w-lg rounded-lg border border-danger/40 bg-surface p-7" role="alert">
        <AlertTriangle className="h-6 w-6 text-danger" /><h1 className="mt-5 font-display text-2xl font-semibold">{t('session.initFailed')}</h1>
        <p className="mt-2 text-sm text-muted">{t('errors.networkUnavailable')}</p><p className="mt-4 font-mono text-xs text-muted">{error?.code}{requestId ? ` · ${t('common.request', { requestId })}` : ''}</p>
        <Button className="mt-6" onClick={() => void bootstrap(true).catch(() => undefined)}>{t('session.retryBootstrap')}</Button>
      </section>
    </main>
  )
  return <main aria-label={t('session.initializing')} className="grid min-h-screen place-items-center bg-background text-foreground" role="status"><div className="text-center"><LoaderCircle className="mx-auto h-7 w-7 animate-spin text-primary" /><p className="mt-4 text-sm text-muted">{t('session.loadingWorkspace')}</p></div></main>
}
