import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '../lib/cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  const { t } = useTranslation()
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-md data-[state=open]:animate-[select-pop_180ms_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          'studio-glass fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 text-foreground data-[state=open]:animate-[select-pop_180ms_cubic-bezier(.22,1,.36,1)]',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={t('common.closeDialog')}
          className="absolute right-4 top-4 rounded-sm p-1 text-muted transition-colors hover:bg-elevated hover:text-foreground"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export const DialogTitle = ({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title className={cn('font-display text-2xl font-semibold tracking-tight', className)} {...props} />
)

export const DialogDescription = ({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) => (
  <DialogPrimitive.Description className={cn('mt-2 text-sm leading-6 text-muted', className)} {...props} />
)
