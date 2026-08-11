import { AudioLines, FileText, Image as ImageIcon, LayoutGrid, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../shared/ui'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../shared/ui/dialog'

export interface NodePickerOption {
  kind: string
  role: string
  labelKey: string
  icon: typeof FileText
}

const OPTIONS: NodePickerOption[] = [
  { kind: 'text', role: 'topic', labelKey: 'nodePicker.topic', icon: FileText },
  { kind: 'text', role: 'outline', labelKey: 'nodePicker.outline', icon: FileText },
  { kind: 'text', role: 'script', labelKey: 'nodePicker.script', icon: FileText },
  { kind: 'collection', role: 'cover', labelKey: 'nodePicker.cover', icon: LayoutGrid },
  { kind: 'audio', role: 'voice', labelKey: 'nodePicker.voice', icon: AudioLines },
  { kind: 'image', role: 'illustration', labelKey: 'nodePicker.image', icon: ImageIcon },
  { kind: 'action', role: 'publish', labelKey: 'nodePicker.publish', icon: Send },
]

interface NodePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (kind: string, role: string) => void
}

export function NodePicker({ open, onOpenChange, onPick }: NodePickerProps) {
  const { t } = useTranslation()
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{t('nodePicker.title')}</DialogTitle>
        <DialogDescription>{t('nodePicker.description')}</DialogDescription>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <Button
                className="justify-start"
                key={`${option.kind}/${option.role}`}
                onClick={() => {
                  onPick(option.kind, option.role)
                  onOpenChange(false)
                }}
                variant="secondary"
              >
                <Icon aria-hidden="true" className="h-4 w-4 text-primary" />
                {t(option.labelKey)}
              </Button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
