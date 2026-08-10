import { X } from 'lucide-react'
import { create } from 'zustand'
import { useTranslation } from 'react-i18next'

interface ToastMessage {
  id: number
  title: string
  description?: string
}

interface ToastState {
  messages: ToastMessage[]
  notify: (message: Omit<ToastMessage, 'id'>) => void
  dismiss: (id: number) => void
}

let nextToastId = 1

export const useToastStore = create<ToastState>((set) => ({
  messages: [],
  notify: (message) => set((state) => ({ messages: [...state.messages, { ...message, id: nextToastId++ }] })),
  dismiss: (id) => set((state) => ({ messages: state.messages.filter((message) => message.id !== id) })),
}))

export function ToastRegion() {
  const { t } = useTranslation()
  const messages = useToastStore((state) => state.messages)
  const dismiss = useToastStore((state) => state.dismiss)

  return (
    <div aria-atomic="false" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2" data-testid="notification-region">
      {messages.map((message) => (
        <article className="pointer-events-auto w-full max-w-sm rounded-md border border-border bg-surface p-4 shadow-panel" key={message.id}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">{message.title}</h2>
              {message.description ? <p className="mt-1 text-xs leading-5 text-muted">{message.description}</p> : null}
            </div>
            <button aria-label={t('common.dismissNotification')} className="rounded-sm p-1 text-muted hover:bg-elevated hover:text-foreground" onClick={() => dismiss(message.id)}>
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}
