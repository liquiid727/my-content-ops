import { sectionKeys, type SectionKey } from '@creator-studio/contracts'
import { FileUp } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Input, Select } from '../../shared/ui'

interface VaultImportCardProps {
  disabled?: boolean
  importing: boolean
  onImport: (vaultPath: string, targetSection: SectionKey) => Promise<void>
}

export function VaultImportCard({ disabled, importing, onImport }: VaultImportCardProps) {
  const { t } = useTranslation()
  const [vaultPath, setVaultPath] = useState('')
  const [targetSection, setTargetSection] = useState<SectionKey>('positioning')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const path = vaultPath.trim()
    if (!path) return
    await onImport(path, targetSection)
    setVaultPath('')
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <h2 className="font-display text-lg font-semibold">{t('profile.importTitle')}</h2>
      <p className="mt-1 text-sm text-muted">{t('profile.importDescription')}</p>
      <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => void handleSubmit(event)}>
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
        <Button disabled={disabled || importing} type="submit" variant="secondary">
          <FileUp aria-hidden="true" className="h-4 w-4" />
          {importing ? t('profile.importing') : t('profile.import')}
        </Button>
      </form>
    </section>
  )
}
