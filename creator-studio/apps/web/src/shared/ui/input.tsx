import { forwardRef, type InputHTMLAttributes } from 'react'

import { cn } from '../lib/cn'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    className={cn(
      'min-h-10 w-full rounded-lg border border-border/80 bg-surface/80 px-3 text-sm text-foreground shadow-[inset_0_1px_1px_hsl(var(--foreground)/.025)] placeholder:text-muted/80 hover:border-muted focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    ref={ref}
    {...props}
  />
))

Input.displayName = 'Input'
