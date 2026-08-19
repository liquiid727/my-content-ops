import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '../lib/cn'

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, type = 'button', ...props }, ref) => (
    <button
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition-[background-color,color,transform] duration-fast hover:bg-elevated hover:text-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      ref={ref}
      type={type}
      {...props}
    />
  ),
)

IconButton.displayName = 'IconButton'
