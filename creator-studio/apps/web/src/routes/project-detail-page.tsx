import { Archive, ArrowRight, Boxes, Check, Circle, Pencil, RefreshCw, TimerReset } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'

import { ApiClientError, ProjectForm, useProjectStore } from '../modules/projects'
import { formatContentType, formatDate, getLocalizedErrorMessage, i18n as i18nInstance, normalizeLocale } from '../modules/i18n'
import { cn } from '../shared/lib/cn'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, EmptyState, Skeleton, useToastStore } from '../shared/ui'
import { CanvasShell } from '../canvas'
import { PlannedModule } from './planned-module'
import { RouteHeading } from './route-heading'

const sections = [
  { slug: 'overview', nameKey: 'projectDetail.overview', phase: 'Foundation FND-007', descriptionKey: '' },
  { slug: 'canvas', nameKey: 'projectDetail.canvas', phase: 'Canvas Runtime', descriptionKey: '' },
  { slug: 'ideas', nameKey: 'projectDetail.ideas', phase: 'P1', descriptionKey: 'projectDetail.plannedDescriptions.ideas' },
  { slug: 'topics', nameKey: 'projectDetail.topics', phase: 'P1', descriptionKey: 'projectDetail.plannedDescriptions.topics' },
  { slug: 'scripts', nameKey: 'projectDetail.scripts', phase: 'P1', descriptionKey: 'projectDetail.plannedDescriptions.scripts' },
  { slug: 'rhythm', nameKey: 'projectDetail.rhythm', phase: 'P1', descriptionKey: 'projectDetail.plannedDescriptions.rhythm' },
  { slug: 'shots', nameKey: 'projectDetail.shots', phase: 'P1', descriptionKey: 'projectDetail.plannedDescriptions.shots' },
  { slug: 'assets', nameKey: 'projectDetail.assets', phase: 'Foundation FND-008', descriptionKey: 'projectDetail.plannedDescriptions.assets' },
  { slug: 'tasks', nameKey: 'projectDetail.tasks', phase: 'Foundation FND-009–010', descriptionKey: 'projectDetail.plannedDescriptions.tasks' },
] as const

function ProjectOverviewPanel({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation()
  const locale = normalizeLocale(i18n.language)
  const navigate = useNavigate()
  const overview = useProjectStore((state) => state.overviews[projectId])
  const loadOverview = useProjectStore((state) => state.loadOverview)
  const updateProject = useProjectStore((state) => state.updateProject)
  const archiveProject = useProjectStore((state) => state.archiveProject)
  const notify = useToastStore((state) => state.notify)
  const [error, setError] = useState<string>()
  const [editOpen, setEditOpen] = useState(false)
  const [conflictNotice, setConflictNotice] = useState<string>()

  useEffect(() => {
    let active = true
    loadOverview(projectId)
      .then(() => { if (active) setError(undefined) })
      .catch((caught: unknown) => { if (active) setError(getLocalizedErrorMessage(caught, i18nInstance.t, 'projectDetail.loadFailed')) })
    return () => { active = false }
  }, [loadOverview, projectId])

  if (!overview && !error) {
    return (
      <div aria-label={t('projectDetail.loading')} className="space-y-6" role="status">
        <section className="rounded-lg border border-border bg-surface p-6 shadow-panel sm:p-8">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-8 w-3/5" />
          <Skeleton className="mt-3 h-4 w-4/5" />
          <div className="mt-6 flex gap-2"><Skeleton className="h-9 w-24" /><Skeleton className="h-9 w-24" /></div>
        </section>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-56 rounded-lg border border-border bg-surface" />
          <Skeleton className="h-56 rounded-lg border border-border bg-surface" />
        </div>
      </div>
    )
  }
  if (error && !overview) {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger/10 p-5" role="alert">
        <p className="text-sm text-danger">{error}</p>
        <Button className="mt-4" onClick={() => void loadOverview(projectId)}><RefreshCw aria-hidden="true" className="h-4 w-4" />{t('common.reload')}</Button>
      </div>
    )
  }
  if (!overview) return null

  async function handleUpdate(patch: Parameters<typeof updateProject>[2]) {
    try {
      await updateProject(projectId, overview!.project.revision, patch)
      setConflictNotice(undefined)
      setEditOpen(false)
      notify({ title: t('projectDetail.updated') })
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === 'PROJECT_REVISION_CONFLICT') {
        await loadOverview(projectId)
        setConflictNotice(t('projectDetail.conflict'))
      }
      throw caught
    }
  }

  async function handleArchive() {
    if (!window.confirm(t('projectDetail.archiveConfirm'))) return
    try {
      await archiveProject(projectId, overview!.project.revision)
      notify({ title: t('projectDetail.archived'), description: t('projectDetail.archivedDescription') })
      navigate('/projects')
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === 'PROJECT_REVISION_CONFLICT') {
        await loadOverview(projectId)
        setError(t('projectDetail.archiveConflict'))
        return
      }
      setError(getLocalizedErrorMessage(caught, t, 'projectDetail.archiveFailed'))
    }
  }

  const project = overview.project
  return (
    <div className="space-y-6">
      {error ? <p className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}
      <section className="rounded-lg border border-border bg-surface p-6 shadow-panel sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
              <span className="rounded-full border border-border px-2.5 py-1">{t(`projects.${project.status}`)}</span>
              <span className="font-mono uppercase tracking-[0.16em]">{formatContentType(project.contentType, t)}</span>
              <span>{t('common.revision', { revision: project.revision })}</span>
            </div>
            <h2 className="mt-5 max-w-3xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">{project.title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{project.brief || t('projectDetail.noDescription')}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button onClick={() => setEditOpen(true)}><Pencil aria-hidden="true" className="h-4 w-4" />{t('projectDetail.edit')}</Button>
            <Button onClick={() => void handleArchive()} variant="danger"><Archive aria-hidden="true" className="h-4 w-4" />{t('projectDetail.archive')}</Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="pipeline-heading">
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('projectDetail.currentStage')}</p><h2 className="mt-1 font-display text-2xl font-semibold" id="pipeline-heading">{t('projectDetail.pipeline')}</h2></div>
          <span className="text-sm text-muted">{t('projectDetail.nextStep', { label: t('projectDetail.generateTopics') })}</span>
        </div>
        <ol className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
          {overview.pipeline.map((item) => (
            <li className="flex items-center gap-4 bg-surface p-5" key={item.stage}>
              <span className={cn('flex h-9 w-9 items-center justify-center rounded-full bg-elevated', item.status === 'completed' && 'text-primary')}>
                {item.status === 'completed' ? <Check aria-hidden="true" className="h-4 w-4" /> : item.status === 'in_progress' ? <TimerReset aria-hidden="true" className="h-4 w-4" /> : <Circle aria-hidden="true" className="h-3 w-3" />}
              </span>
              <div><p className="font-semibold">{t(`projectDetail.stages.${item.stage}`)}</p><p className="mt-1 text-xs text-muted">{t(`projectDetail.stages.${item.status === 'in_progress' ? 'inProgress' : item.status === 'not_started' ? 'notStarted' : item.status}`)}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {overview.activeTasks.length === 0 ? <EmptyState description={t('projectDetail.noActiveTasksDescription')} icon={<TimerReset aria-hidden="true" className="h-5 w-5" />} title={t('projectDetail.noActiveTasks')} /> : <section className="rounded-lg border border-border bg-surface p-5"><div className="flex items-center justify-between"><h2 className="font-display text-xl font-semibold">{t('projectDetail.activeTasks')}</h2><Link className="text-sm font-semibold text-primary" to="/tasks">{t('common.viewAll')}</Link></div><ol className="mt-4 space-y-4">{overview.activeTasks.map((task) => <li key={task.id}><div className="flex justify-between gap-3 text-sm"><span className="font-mono text-xs text-muted">{task.type}</span><span>{t(`tasks.${task.status === 'waiting_review' ? 'waitingReview' : task.status}`)}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full bg-primary" style={{ width: `${task.progress}%` }} /></div></li>)}</ol></section>}
        {overview.latestAssets.length === 0 ? <EmptyState description={t('projectDetail.noAssetsDescription')} icon={<Boxes aria-hidden="true" className="h-5 w-5" />} title={t('projectDetail.noAssets')} /> : <section className="rounded-lg border border-border bg-surface p-5"><div className="flex items-center justify-between"><h2 className="font-display text-xl font-semibold">{t('projectDetail.recentAssets')}</h2><Link className="text-sm font-semibold text-primary" to={`/assets?projectId=${projectId}`}>{t('projectDetail.assetLibrary')}</Link></div><ul className="mt-4 divide-y divide-border">{overview.latestAssets.map((asset) => <li className="flex items-center justify-between gap-4 py-3" key={asset.id}><div className="min-w-0"><p className="truncate font-semibold">{asset.displayName}</p><p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">{t(`assets.${asset.kind}`)}</p></div><span className="text-xs text-muted">{formatDate(asset.createdAt, locale)}</span></li>)}</ul></section>}
      </div>

      <section aria-labelledby="next-modules-heading"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('projectDetail.continue')}</p><h2 className="mt-1 font-display text-2xl font-semibold" id="next-modules-heading">{t('projectDetail.nextModules')}</h2><div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">{sections.slice(1, 4).map((section) => <Link className="group bg-surface p-5 hover:bg-elevated" key={section.slug} to={`/projects/${projectId}/${section.slug}`}><span className="text-xs uppercase tracking-[0.16em] text-muted">{section.phase}</span><h3 className="mt-5 font-display text-xl font-semibold group-hover:text-primary">{t(section.nameKey)}</h3><span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">{t('projectDetail.viewScope')} <ArrowRight className="h-3.5 w-3.5" /></span></Link>)}</div></section>

      <Dialog onOpenChange={(open) => { setEditOpen(open); if (!open) setConflictNotice(undefined) }} open={editOpen}>
        <DialogContent>
          <DialogTitle>{t('projectDetail.editDialogTitle')}</DialogTitle>
          <DialogDescription>{t('projectDetail.editDialogDescription')}</DialogDescription>
          {conflictNotice ? <p className="mt-4 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-primary" role="status">{conflictNotice}</p> : null}
          <ProjectForm key={project.revision} onCancel={() => setEditOpen(false)} onUpdate={handleUpdate} project={project} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function ProjectDetailPage() {
  const { t } = useTranslation()
  const { projectId = 'unknown' } = useParams()
  const { pathname } = useLocation()
  const sectionSlug = pathname.split('/').at(-1) ?? 'overview'
  const activeSection = sections.find((section) => section.slug === sectionSlug) ?? sections[0]
  const overviewPath = `/projects/${encodeURIComponent(projectId)}/overview`

  return (
    <div className="mx-auto w-full max-w-6xl">
      <RouteHeading
        description={activeSection.slug === 'overview' ? t('projectDetail.overviewDescription') : t('projectDetail.routeDescription', { projectId })}
        eyebrow={t('projectDetail.eyebrow')}
        title={t(activeSection.nameKey)}
      />
      <nav aria-label={t('projectDetail.projectSections')} className="-mx-1 mt-5 flex gap-1 overflow-x-auto px-1 pb-2">
        {sections.map((section) => (
          <NavLink
            className={({ isActive }) => cn(
              'shrink-0 rounded-md px-3 py-2 text-sm font-semibold text-muted hover:bg-elevated hover:text-foreground',
              isActive && 'bg-primary/15 text-primary',
            )}
            key={section.slug}
            to={`/projects/${encodeURIComponent(projectId)}/${section.slug}`}
          >
            {t(section.nameKey)}
          </NavLink>
        ))}
      </nav>
      <div className="mt-6">
        {activeSection.slug === 'overview' ? <ProjectOverviewPanel key={projectId} projectId={projectId} /> : (
          activeSection.slug === 'canvas' ? (
            <CanvasShell className="h-[640px]" projectId={projectId} />
          ) : (
            <PlannedModule
              description={t(activeSection.descriptionKey)}
              name={t(activeSection.nameKey)}
              phase={activeSection.phase}
              returnLabel={t('projectDetail.returnOverview')}
              returnTo={overviewPath}
            />
          )
        )}
      </div>
    </div>
  )
}
