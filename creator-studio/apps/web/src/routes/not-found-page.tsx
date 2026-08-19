import { ArrowLeft, SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center">
      <div className="w-full rounded-lg border border-border bg-surface p-6 shadow-panel sm:p-9">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-elevated text-primary">
          <SearchX aria-hidden="true" className="h-5 w-5" />
        </div>
        <p className="mt-6 font-utility text-[11px] uppercase tracking-[0.18em] text-primary">{t('notFound.eyebrow')}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">{t('notFound.title')}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">{t('notFound.description')}</p>
        <Link className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" to="/">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {t('notFound.returnDashboard')}
        </Link>
      </div>
    </section>
  )
}
