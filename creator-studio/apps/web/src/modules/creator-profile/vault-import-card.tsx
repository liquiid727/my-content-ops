import { sectionKeys, type SectionKey } from '@creator-studio/contracts'
import { FileUp } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Input, Select } from '../../shared/ui'

interface VaultImportCardProps {
  disabled?: boolean
  importing: boolean
  onCancel: () => void
  onImport: (vaultPath: string, targetSection: SectionKey) => Promise<boolean>
}

export function VaultImportCard({ disabled, importing, onCancel, onImport }: VaultImportCardProps) {
  const { t } = useTranslation()
  const [vaultPath, setVaultPath] = useState('')
  const [targetSection, setTargetSection] = useState<SectionKey>('positioning')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const path = vaultPath.trim()
    if (!path) return
    const imported = await onImport(path, targetSection)
    if (imported) {
      setVaultPath('')
      onCancel()
    }
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void handleSubmit(event)}>
      <div className="grid gap-5 px-6 py-6 sm:px-7">
        <label className="block min-w-0 flex-1 text-sm font-semibold">
          {t('profile.importVaultPath')}
          <div className="mt-2">
            <Input
              className="font-mono text-xs"
              disabled={disabled}
              onChange={(event) => setVaultPath(event.target.value)}
              placeholder="50_Channels/账号/00-定位.md"
              value={vaultPath}
            />
          </div>
        </label>
        <label className="block w-full text-sm font-semibold sm:w-44">
          {t('profile.importTargetSection')}
          <div className="mt-2">
            <Select
              aria-label={t('profile.importTargetSection')}
              disabled={disabled || false}
              onValueChange={(value) => setTargetSection(value as SectionKey)}
              options={sectionKeys.map((value) => ({ value, label: t(`profile.injectionSections.${value}`) }))}
              value={targetSection}
            />
          </div>
        </label>
      </div>
      <div className="flex justify-end gap-3 border-t border-border bg-surface/95 px-6 py-4 sm:px-7">
        <Button disabled={importing} onClick={onCancel} type="button" variant="ghost">
          {t('common.cancel')}
        </Button>
        <Button disabled={disabled || importing} type="submit" variant="primary">
          <FileUp aria-hidden="true" className="h-4 w-4" />
          {importing ? t('profile.importing') : t('profile.import')}
        </Button>
      </div>
    </form>
  )
}
