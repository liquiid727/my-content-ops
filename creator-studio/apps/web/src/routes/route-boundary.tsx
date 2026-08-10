import { Component, type ErrorInfo, type ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Skeleton } from '../shared/ui'
import '../modules/i18n/i18n'

export function RouteSkeleton() {
  const { t } = useTranslation()
  return (
    <div aria-label={t('common.loadingPage')} className="mx-auto w-full max-w-6xl space-y-5" role="status">
      <Skeleton className="h-3 w-36" />
      <Skeleton className="h-12 w-full max-w-xl" />
      <Skeleton className="h-5 w-full max-w-2xl" />
      <div className="grid gap-4 pt-4 sm:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <span className="sr-only">{t('common.loadingRoute')}</span>
    </div>
  )
}

interface RouteErrorBoundaryProps {
  children: ReactNode
}

interface RouteErrorBoundaryState {
  hasError: boolean
}

class RouteErrorBoundaryImpl extends Component<RouteErrorBoundaryProps & { t: TFunction }, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route rendering failed', { error, componentStack: info.componentStack })
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props
      return (
        <section className="mx-auto w-full max-w-3xl rounded-lg border border-danger/40 bg-surface p-6 shadow-panel" role="alert">
          <p className="font-utility text-[11px] uppercase tracking-[0.18em] text-danger">{t('routeError.eyebrow')}</p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">{t('routeError.title')}</h1>
          <p className="mt-3 text-sm leading-6 text-muted">{t('routeError.description')}</p>
          <Link className="mt-6 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" to="/">
            {t('routeError.returnDashboard')}
          </Link>
        </section>
      )
    }

    return this.props.children
  }
}

export function RouteErrorBoundary({ children }: RouteErrorBoundaryProps) {
  const { t } = useTranslation()
  return <RouteErrorBoundaryImpl t={t}>{children}</RouteErrorBoundaryImpl>
}
