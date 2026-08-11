import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ComponentProps } from 'react'

import { cn } from '../lib/cn'

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

/** 语义 token 样式的 Radix Tooltip 内容；sideOffset 让浮层贴住触发元素。 */
export function TooltipContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className={cn(
          'z-50 max-w-xs rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs leading-tight text-foreground shadow-panel data-[state=delayed-open]:animate-[select-pop_120ms_ease-out] data-[state=closed]:animate-[select-fade_80ms_ease-in]',
          className,
        )}
        sideOffset={sideOffset}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}
