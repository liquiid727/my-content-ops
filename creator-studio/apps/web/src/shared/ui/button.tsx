import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '../lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-[0_10px_24px_hsl(var(--primary)/.2)] hover:bg-primary/90 hover:shadow-[0_14px_32px_hsl(var(--primary)/.27)]',
  secondary: 'border border-border/80 bg-elevated/80 text-foreground hover:border-primary/25 hover:bg-surface',
  ghost: 'text-muted hover:bg-elevated hover:text-foreground',
  danger: 'bg-danger text-background hover:bg-danger/90',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, type = 'button', variant = 'secondary', ...props }, ref) => (
    <button
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-fast active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
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
