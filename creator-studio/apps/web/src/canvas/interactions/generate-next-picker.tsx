import type { OperationDefinition } from '@creator-studio/contracts'
import { FileText, Image as ImageIcon, Mic, Sparkles, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../shared/ui'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../shared/ui/dialog'

export function operationIcon(operation: OperationDefinition) {
  const kind = operation.output?.kind
  if (kind === 'image' || kind === 'collection') return ImageIcon
  if (kind === 'audio') return Mic
  if (kind === 'video') return Video
  if (kind === 'text') return FileText
  return Sparkles
}

interface GenerateNextPickerProps {
  open: boolean
  operations: OperationDefinition[]
  loading: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onPick: (operation: OperationDefinition) => void
}

export function GenerateNextPicker({ open, operations, loading, error, onOpenChange, onPick }: GenerateNextPickerProps) {
  const { t } = useTranslation()
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{t('generateNext.title')}</DialogTitle>
        <DialogDescription>{t('generateNext.description')}</DialogDescription>
        {loading ? <p className="mt-4 text-sm text-muted">{t('generateNext.loading')}</p> : null}
        {error ? <p className="mt-4 rounded border border-danger/40 bg-danger/10 p-2 text-xs text-danger" role="alert">{error}</p> : null}
        {!loading && !error && operations.length === 0 ? <p className="mt-4 text-sm text-muted">{t('generateNext.empty')}</p> : null}
        {!loading && operations.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {operations.map((operation) => {
              const Icon = operationIcon(operation)
              return (
                <Button
                  className="justify-start"
                  key={operation.id}
                  onClick={() => {
                    onPick(operation)
                    onOpenChange(false)
                  }}
                  title={operation.description}
                  variant={operation.presentation.placement === 'primary' ? 'primary' : 'secondary'}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {operation.label}
                </Button>
              )
            })}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
