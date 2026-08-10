import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { forwardRef, type ComponentProps } from 'react'

import { cn } from '../lib/cn'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends ComponentProps<typeof SelectPrimitive.Root> {
  options: SelectOption[]
  placeholder?: string
  className?: string
  'aria-label'?: string
  'aria-busy'?: boolean
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  ({ options, placeholder, className, 'aria-label': ariaLabel, 'aria-busy': ariaBusy, ...props }, ref) => {
    const selectedLabel = options.find((option) => option.value === props.value)?.label

    return (
      <SelectPrimitive.Root {...props}>
        <SelectPrimitive.Trigger
          ref={ref}
          aria-busy={ariaBusy}
          aria-label={ariaLabel}
          className={cn(
            'group inline-flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-sm text-foreground transition-colors duration-fast hover:border-muted focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder}>{selectedLabel}</SelectPrimitive.Value>
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted transition-transform duration-fast group-data-[state=open]:rotate-180"
          />
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-surface text-foreground shadow-panel data-[state=open]:animate-[select-pop_140ms_ease-out] data-[state=closed]:animate-[select-fade_110ms_ease-in]"
            position="popper"
            sideOffset={6}
          >
            <SelectPrimitive.Viewport className="p-1">
              {options.map((option) => (
                <SelectPrimitive.Item
                  className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-sm px-2.5 py-2 text-sm leading-tight text-foreground outline-none data-[highlighted]:bg-elevated data-[highlighted]:text-foreground"
                  key={option.value}
                  value={option.value}
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator>
                    <Check aria-hidden="true" className="h-4 w-4 text-primary" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    )
  },
)

Select.displayName = 'Select'
