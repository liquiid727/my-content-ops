import type { ReactNode } from 'react'

interface RouteHeadingProps {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}

export function RouteHeading({ eyebrow, title, description, action }: RouteHeadingProps) {
  return (
    <header className="border-b border-border pb-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-utility text-[11px] uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  )
}
