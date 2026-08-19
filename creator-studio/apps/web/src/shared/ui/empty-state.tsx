import type { ReactNode } from 'react'

export interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-dashed border-border/90 bg-surface/55 px-5 py-10 text-center backdrop-blur-sm">
      <span aria-hidden="true" className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.06] blur-3xl" />
      <div className="relative mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">{icon}</div>
      <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  )
}
