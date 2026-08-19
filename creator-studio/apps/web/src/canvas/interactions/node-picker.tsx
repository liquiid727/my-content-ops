import { FileText, Image as ImageIcon, Lightbulb, Sparkles } from 'lucide-react'
import type { RecipeCapability } from '@creator-studio/contracts'
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
  { kind: 'text', role: 'inspiration', labelKey: 'nodePicker.inspiration', icon: Lightbulb },
  { kind: 'text', role: 'topic', labelKey: 'nodePicker.topic', icon: FileText },
  { kind: 'text', role: 'outline', labelKey: 'nodePicker.outline', icon: FileText },
  { kind: 'text', role: 'script', labelKey: 'nodePicker.script', icon: FileText },
  { kind: 'image', role: 'cover', labelKey: 'nodePicker.cover', icon: ImageIcon },
  { kind: 'image', role: 'illustration', labelKey: 'nodePicker.image', icon: ImageIcon },
]

interface NodePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (kind: string, role: string) => void
  capabilities?: RecipeCapability[]
  onPickRecipe?: (capability: RecipeCapability) => void
}

export function NodePicker({ open, onOpenChange, onPick, capabilities = [], onPickRecipe }: NodePickerProps) {
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
          {capabilities.map((capability) => (
            <Button className="justify-start border-warning/30 bg-warning/5 hover:border-warning/60" key={capability.id} onClick={() => { onPickRecipe?.(capability); onOpenChange(false) }} variant="secondary">
              <Sparkles aria-hidden="true" className="h-4 w-4 text-warning" />
              {capability.label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
