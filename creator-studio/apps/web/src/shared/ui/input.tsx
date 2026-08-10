import { forwardRef, type InputHTMLAttributes } from 'react'

import { cn } from '../lib/cn'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    className={cn(
      'min-h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted/80 hover:border-muted focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    ref={ref}
    {...props}
  />
))

Input.displayName = 'Input'
