import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '../lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'border border-border bg-elevated text-foreground hover:bg-surface',
  ghost: 'text-muted hover:bg-elevated hover:text-foreground',
  danger: 'bg-danger text-background hover:bg-danger/90',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, type = 'button', variant = 'secondary', ...props }, ref) => (
    <button
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
      ref={ref}
      type={type}
      {...props}
    />
  ),
)

Button.displayName = 'Button'
