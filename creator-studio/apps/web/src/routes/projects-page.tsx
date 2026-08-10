import type { CreateProject, ProjectStatus } from '@creator-studio/contracts'
import { FolderKanban, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { ulid } from 'ulid'

import { ProjectForm, useProjectStore } from '../modules/projects'
import { formatContentType, formatDateTime, normalizeLocale } from '../modules/i18n'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, EmptyState, Select } from '../shared/ui'
import { RouteHeading } from './route-heading'

export default function ProjectsPage() {
  const { t, i18n } = useTranslation()
  const locale = normalizeLocale(i18n.language)
  const navigate = useNavigate()
  const projects = useProjectStore((state) => state.projects)
  const loading = useProjectStore((state) => state.loading)
  const error = useProjectStore((state) => state.error)
  const hasMore = useProjectStore((state) => state.hasMore)
  const nextCursor = useProjectStore((state) => state.nextCursor)
  const loadProjects = useProjectStore((state) => state.loadProjects)
  const createProject = useProjectStore((state) => state.createProject)
  const [status, setStatus] = useState<ProjectStatus | undefined>()
  const [createOpen, setCreateOpen] = useState(false)
  const pendingSubmission = useRef<{ hash: string; key: string } | undefined>(undefined)

  useEffect(() => {
    void loadProjects(status)
  }, [loadProjects, status])

  async function handleCreate(input: CreateProject) {
    const hash = JSON.stringify(input)
    if (pendingSubmission.current?.hash !== hash) pendingSubmission.current = { hash, key: ulid() }
    const project = await createProject(input, pendingSubmission.current.key)
    pendingSubmission.current = undefined
    setCreateOpen(false)
    navigate(`/projects/${project.id}/overview`)
  }

  function closeCreate() {
    pendingSubmission.current = undefined
    setCreateOpen(false)
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <RouteHeading
        action={<Button onClick={() => setCreateOpen(true)} variant="primary"><Plus aria-hidden="true" className="h-4 w-4" />{t('projects.newProject')}</Button>}
        description={t('projects.description')}
        eyebrow={t('projects.eyebrow')}
        title={t('projects.title')}
      />

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
        <label className="flex items-center gap-3 text-sm font-semibold">
          {t('projects.status')}
          <Select
            aria-label={t('projects.statusFilter')}
            onValueChange={(value) => setStatus(value === 'all' ? undefined : value as ProjectStatus)}
            options={[
              { value: 'all', label: t('projects.current') },
              { value: 'draft', label: t('projects.draft') },
              { value: 'active', label: t('projects.active') },
              { value: 'archived', label: t('projects.archived') },
            ]}
            value={status ?? 'all'}
          />
        </label>
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted">{t('projects.updatedMostRecently')}</span>
      </div>

      {error ? (
        <div className="mt-6 flex items-center justify-between gap-4 rounded-md border border-danger/40 bg-danger/10 p-4" role="alert">
          <p className="text-sm text-danger">{error}</p>
          <Button onClick={() => void loadProjects(status)}><RefreshCw aria-hidden="true" className="h-4 w-4" />{t('common.retry')}</Button>
        </div>
      ) : null}

      {!loading && projects.length === 0 && !error ? (
        <div className="mt-8">
          <EmptyState
            action={<Button onClick={() => setCreateOpen(true)} variant="primary">{t('projects.createFirst')}</Button>}
            description={status === 'archived' ? t('projects.archivedEmptyDescription') : t('projects.emptyDescription')}
            icon={<FolderKanban aria-hidden="true" className="h-5 w-5" />}
            title={status === 'archived' ? t('projects.noArchived') : t('projects.emptyDesk')}
          />
        </div>
      ) : null}

      <div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
        {projects.map((project) => (
          <Link
            className="group min-h-48 bg-surface p-6 transition-colors hover:bg-elevated focus-visible:bg-elevated"
            key={project.id}
            to={`/projects/${project.id}/overview`}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted">{t(`projects.${project.status}`)}</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{formatContentType(project.contentType, t)}</span>
            </div>
            <h2 className="mt-8 font-display text-2xl font-semibold tracking-tight transition-colors group-hover:text-primary">{project.title}</h2>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{project.brief || t('projects.missingBrief')}</p>
            <p className="mt-6 text-xs text-muted">{t('projects.updatedAt', { date: formatDateTime(project.updatedAt, locale) })}</p>
          </Link>
        ))}
      </div>

      {loading ? <p className="mt-8 text-center text-sm text-muted" role="status">{t('projects.loading')}</p> : null}
      {hasMore && nextCursor ? (
        <div className="mt-6 flex justify-center"><Button disabled={loading} onClick={() => void loadProjects(status, nextCursor)}>{t('common.loadMore')}</Button></div>
      ) : null}

      <Dialog onOpenChange={(open) => open ? setCreateOpen(true) : closeCreate()} open={createOpen}>
        <DialogContent>
          <DialogTitle>{t('projects.createDialogTitle')}</DialogTitle>
          <DialogDescription>{t('projects.createDialogDescription')}</DialogDescription>
          <ProjectForm onCancel={closeCreate} onCreate={handleCreate} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
