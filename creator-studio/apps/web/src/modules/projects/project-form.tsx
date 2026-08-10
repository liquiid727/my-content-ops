import {
  createProjectSchema,
  projectPatchSchema,
  type CreateProject,
  type Project,
  type ProjectPatch,
} from '@creator-studio/contracts'
import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { getLocalizedErrorMessage } from '../i18n'
import { Button, Input, Select, Textarea } from '../../shared/ui'

interface ProjectFormProps {
  project?: Project
  onCancel: () => void
  onCreate?: (input: CreateProject) => Promise<void>
  onUpdate?: (patch: ProjectPatch) => Promise<void>
}

const contentTypes = [
  ['general', 'projects.form.general'],
  ['short_video', 'projects.form.shortVideo'],
  ['long_video', 'projects.form.longVideo'],
  ['article', 'projects.form.article'],
  ['podcast', 'projects.form.podcast'],
] as const

export function ProjectForm({ project, onCancel, onCreate, onUpdate }: ProjectFormProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(project?.title ?? '')
  const [brief, setBrief] = useState(project?.brief ?? '')
  const [contentType, setContentType] = useState(project?.contentType ?? 'general')
  const [status, setStatus] = useState(project?.status === 'active' ? 'active' : 'draft')
  const [targetPlatform, setTargetPlatform] = useState(project?.targetPlatform ?? '')
  const [targetDuration, setTargetDuration] = useState(project?.targetDurationMs?.toString() ?? '')
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const submitLock = useRef(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitLock.current) return

    const common = {
      title,
      brief,
      contentType,
      targetPlatform: targetPlatform.trim() || null,
      targetDurationMs: targetDuration ? Number(targetDuration) : null,
    }
    const result = project
      ? projectPatchSchema.safeParse({ ...common, status })
      : createProjectSchema.safeParse(common)
    if (!result.success) {
      setError(t('projects.form.invalid'))
      return
    }

    submitLock.current = true
    setSubmitting(true)
    setError(undefined)
    try {
      if (project && onUpdate) await onUpdate(result.data as ProjectPatch)
      if (!project && onCreate) await onCreate(result.data as CreateProject)
    } catch (caught) {
      setError(getLocalizedErrorMessage(caught, t, 'projects.form.saveFailed'))
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
  }

  return (
    <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
      <label className="block text-sm font-semibold">
        {t('projects.form.title')}
        <Input autoFocus className="mt-2" maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder={t('projects.form.titlePlaceholder')} required value={title} />
      </label>
      <label className="block text-sm font-semibold">
        {t('projects.form.contentType')}
        <Select
          aria-label={t('projects.form.contentType')}
          className="mt-2 w-full"
          onValueChange={(value) => setContentType(value)}
          options={contentTypes.map(([value, labelKey]) => ({ value, label: t(labelKey) }))}
          value={contentType}
        />
      </label>
      {project ? (
        <label className="block text-sm font-semibold">
          {t('projects.form.status')}
          <Select
            aria-label={t('projects.form.status')}
            className="mt-2 w-full"
            onValueChange={(value) => setStatus(value as 'draft' | 'active')}
            options={[
              { value: 'draft', label: t('projects.draft') },
              { value: 'active', label: t('projects.active') },
            ]}
            value={status}
          />
        </label>
      ) : null}
      <label className="block text-sm font-semibold">
        {t('projects.form.brief')}
        <Textarea
          className="mt-2"
          maxLength={5000}
          onChange={(event) => setBrief(event.target.value)}
          placeholder={t('projects.form.briefPlaceholder')}
          value={brief}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          {t('projects.form.targetPlatform')}
          <Input className="mt-2" maxLength={80} onChange={(event) => setTargetPlatform(event.target.value)} placeholder={t('projects.form.platformPlaceholder')} value={targetPlatform} />
        </label>
        <label className="block text-sm font-semibold">
          {t('projects.form.targetDuration')}
          <Input className="mt-2" max={3_600_000} min={1000} onChange={(event) => setTargetDuration(event.target.value)} step={1000} type="number" value={targetDuration} />
        </label>
      </div>
      {error ? <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p> : null}
      <div className="flex justify-end gap-3 pt-1">
        <Button disabled={submitting} onClick={onCancel} type="button">{t('common.cancel')}</Button>
        <Button disabled={submitting} type="submit" variant="primary">{submitting ? t('common.saving') : project ? t('projects.form.saveChanges') : t('projects.form.create')}</Button>
      </div>
    </form>
  )
}
