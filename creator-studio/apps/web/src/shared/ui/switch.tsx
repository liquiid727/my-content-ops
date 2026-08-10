import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '../lib/cn'

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => (
    <button
      aria-checked={checked}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-fast',
        checked ? 'border-primary bg-primary' : 'border-border bg-elevated',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      ref={ref}
      role="switch"
      type="button"
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow-panel transition-transform duration-fast',
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  ),
)

Switch.displayName = 'Switch'
