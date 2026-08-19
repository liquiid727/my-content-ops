import type { ReactNode } from 'react'

interface RouteHeadingProps {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}

export function RouteHeading({ eyebrow, title, description, action }: RouteHeadingProps) {
  return (
    <header className="flex min-h-11 items-center justify-between gap-4 border-b border-border/70 pb-3">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="h-5 w-0.5 shrink-0 rounded-full bg-primary" />
        <h1 className="truncate font-display text-xl font-semibold tracking-[-0.025em] sm:text-2xl">{title}</h1>
        <span className="sr-only">{eyebrow}. {description}</span>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}
