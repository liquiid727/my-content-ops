import { ArrowRight, FolderKanban, ListTodo, Plus, RefreshCw, Waypoints } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { projectSelectors, useProjectStore } from '../modules/projects'
import { taskSelectors, useTaskStore } from '../modules/tasks'
import { formatContentType } from '../modules/i18n'
import { Button, EmptyState, Skeleton } from '../shared/ui'
import { RouteHeading } from './route-heading'

export default function DashboardPage() {
  const { t } = useTranslation()
  const projects = useProjectStore(projectSelectors.projects)
  const projectsLoading = useProjectStore(projectSelectors.loading)
  const projectsError = useProjectStore(projectSelectors.error)
  const loadProjects = useProjectStore((state) => state.loadProjects)
  const tasks = useTaskStore(taskSelectors.tasks)
  const tasksLoading = useTaskStore(taskSelectors.loading)
  const tasksError = useTaskStore(taskSelectors.error)
  const startTasks = useTaskStore((state) => state.start)
  const stopTasks = useTaskStore((state) => state.stop)
  useEffect(() => { void loadProjects(); void startTasks(); return stopTasks }, [loadProjects, startTasks, stopTasks])
  const recentProjects = projects.slice(0, 4)
  const recentTasks = tasks.slice(0, 4)

  return (
    <div className="mx-auto w-full max-w-6xl">
      <RouteHeading action={<Link className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" to="/projects"><Plus className="h-4 w-4" />{t('dashboard.startProject')}</Link>} description={t('dashboard.description')} eyebrow={t('dashboard.eyebrow')} title={t('dashboard.title')} />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]">
        <section aria-labelledby="recent-projects-heading">
          <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('dashboard.projectsSection')}</p><h2 className="mt-1 font-display text-2xl font-semibold" id="recent-projects-heading">{t('dashboard.recentProjects')}</h2></div><Link className="text-sm font-semibold text-primary" to="/projects">{t('common.viewAll')}</Link></div>
          {projectsLoading && projects.length === 0 ? <div aria-label={t('dashboard.loadingProjects')} className="mt-4 grid gap-3 sm:grid-cols-2" role="status"><Skeleton className="h-40" /><Skeleton className="h-40" /></div> : null}
          {projectsError ? <div className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-4" role="alert"><p>{projectsError}</p><Button className="mt-3" onClick={() => void loadProjects()}><RefreshCw className="h-4 w-4" />{t('common.retry')}</Button></div> : null}
          {!projectsLoading && !projectsError && recentProjects.length === 0 ? <div className="mt-4"><EmptyState action={<Link className="font-semibold text-primary" to="/projects">{t('dashboard.createFirst')}</Link>} description={t('dashboard.emptyProjectsDescription')} icon={<FolderKanban className="h-5 w-5" />} title={t('dashboard.emptyDesk')} /></div> : null}
          {recentProjects.length > 0 ? <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">{recentProjects.map((project) => <div className="group relative min-h-44 bg-surface p-5 transition-colors hover:bg-elevated" key={project.id}><Link className="block focus-visible:bg-elevated" to={`/projects/${project.id}/overview`}><span className="text-xs uppercase tracking-[0.16em] text-muted">{formatContentType(project.contentType, t)}</span><h3 className="mt-6 font-display text-xl font-semibold group-hover:text-primary">{project.title}</h3><p className="mt-2 line-clamp-2 text-sm text-muted">{project.brief || t('dashboard.missingBrief')}</p><span className="mt-5 inline-flex items-center gap-1 pr-12 text-xs font-semibold text-primary">{t('dashboard.openOverview')} <ArrowRight className="h-3.5 w-3.5" /></span></Link><Link aria-label={t('dashboard.openCanvas')} className="absolute bottom-4 right-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface/95 text-muted shadow-panel transition-colors hover:bg-elevated hover:text-foreground" to={`/projects/${project.id}/canvas`}><Waypoints aria-hidden="true" className="h-4 w-4" /></Link></div>)}</div> : null}
        </section>

        <section aria-labelledby="recent-tasks-heading">
          <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('dashboard.runtime')}</p><h2 className="mt-1 font-display text-2xl font-semibold" id="recent-tasks-heading">{t('dashboard.recentTasks')}</h2></div><Link className="text-sm font-semibold text-primary" to="/tasks">{t('dashboard.taskLedger')}</Link></div>
          {tasksLoading && tasks.length === 0 ? <div aria-label={t('dashboard.loadingTasks')} className="mt-4" role="status"><Skeleton className="h-40" /></div> : null}
          {tasksError ? <div className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-4" role="alert"><p>{tasksError}</p><Button className="mt-3" onClick={() => { stopTasks(); void startTasks() }}><RefreshCw className="h-4 w-4" />{t('common.reconnect')}</Button></div> : null}
          {!tasksLoading && !tasksError && recentTasks.length === 0 ? <div className="mt-4"><EmptyState description={t('dashboard.noTasksDescription')} icon={<ListTodo className="h-5 w-5" />} title={t('dashboard.noTasks')} /></div> : null}
          {recentTasks.length > 0 ? <ol className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">{recentTasks.map((task) => <li className="border-b border-border p-4 last:border-0" key={task.id}><div className="flex items-center justify-between gap-3"><span className="font-mono text-xs text-muted">{task.type}</span><span className="text-xs font-semibold">{t(`tasks.${task.status === 'waiting_review' ? 'waitingReview' : task.status}`)}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full bg-primary" style={{ width: `${task.progress}%` }} /></div></li>)}</ol> : null}
        </section>
      </div>
    </div>
  )
}
