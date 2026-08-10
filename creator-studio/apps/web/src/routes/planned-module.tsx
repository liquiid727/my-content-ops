import { ArrowLeft, Clock3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface PlannedModuleProps {
  name: string
  phase: string
  description: string
  returnLabel: string
  returnTo: string
}

export function PlannedModule({ name, phase, description, returnLabel, returnTo }: PlannedModuleProps) {
  const { t } = useTranslation()
  return (
    <section className="rounded-lg border border-dashed border-border bg-surface/65 p-6 shadow-panel sm:p-8">
      <div className="flex h-11 w-11 items-center justify-center rounded-md bg-elevated text-primary">
        <Clock3 aria-hidden="true" className="h-5 w-5" />
      </div>
      <p className="mt-6 font-utility text-[11px] uppercase tracking-[0.18em] text-primary">{t('projectDetail.planned', { phase })}</p>
      <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">{name}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{description}</p>
      <Link className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-elevated px-4 text-sm font-semibold text-foreground hover:bg-surface" to={returnTo}>
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {returnLabel}
      </Link>
    </section>
  )
}
