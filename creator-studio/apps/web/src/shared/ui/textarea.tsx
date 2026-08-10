import { forwardRef, type TextareaHTMLAttributes } from 'react'

import { cn } from '../lib/cn'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        'min-h-28 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/80 transition-colors duration-fast hover:border-muted focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
)

Textarea.displayName = 'Textarea'
