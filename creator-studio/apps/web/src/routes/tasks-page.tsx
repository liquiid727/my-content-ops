import type { TaskStatus } from '@creator-studio/contracts'
import { Activity, CircleCheck, CircleX, Clock3, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { taskSelectors, useTaskStore } from '../modules/tasks'
import { formatDateTime, getLocalizedErrorCodeMessage, normalizeLocale } from '../modules/i18n'
import { Button, EmptyState, Skeleton } from '../shared/ui'
import { RouteHeading } from './route-heading'

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === 'completed') return <CircleCheck className="h-4 w-4 text-primary" />
  if (status === 'failed' || status === 'cancelled') return <CircleX className="h-4 w-4 text-danger" />
  if (status === 'running') return <Activity className="h-4 w-4 animate-pulse text-primary" />
  return <Clock3 className="h-4 w-4 text-muted" />
}

export default function TasksPage() {
  const { t, i18n } = useTranslation()
  const locale = normalizeLocale(i18n.language)
  const tasks = useTaskStore(taskSelectors.tasks)
  const loading = useTaskStore(taskSelectors.loading)
  const error = useTaskStore(taskSelectors.error)
  const connection = useTaskStore(taskSelectors.connection)
  const lastEventId = useTaskStore(taskSelectors.lastEventId)
  const cancellingIds = useTaskStore(taskSelectors.cancellingIds)
  const hasMore = useTaskStore(taskSelectors.hasMore)
  const nextCursor = useTaskStore(taskSelectors.nextCursor)
  const loadingMore = useTaskStore(taskSelectors.loadingMore)
  const start = useTaskStore((state) => state.start)
  const stop = useTaskStore((state) => state.stop)
  const cancelTask = useTaskStore((state) => state.cancelTask)
  const loadMore = useTaskStore((state) => state.loadMore)
  useEffect(() => { void start(); return stop }, [start, stop])

  return (
    <div className="mx-auto w-full max-w-6xl">
      <RouteHeading description={t('tasks.description')} eyebrow={t('tasks.eyebrow')} title={t('tasks.title')} />
      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-sm">
          <span className={`h-2.5 w-2.5 rounded-full ${connection === 'connected' ? 'bg-primary shadow-[0_0_14px_var(--color-primary)]' : 'bg-warning'}`} />
          <span className="font-medium">{connection === 'connected' ? t('tasks.connected') : connection === 'reconnecting' ? t('tasks.reconnecting') : t('tasks.calibrating')}</span>
          <span className="text-muted">{t('tasks.lastEvent', { id: lastEventId || '—' })}</span>
        </div>
        <Button onClick={() => { stop(); void start() }}><RefreshCw className="h-4 w-4" />{t('common.reconnect')}</Button>
      </div>

      {loading ? <div aria-label={t('tasks.loading')} className="mt-6 grid gap-3" role="status"><Skeleton className="h-28" /><Skeleton className="h-28" /></div> : null}
      {error ? <div className="mt-6 flex items-center justify-between rounded-lg border border-danger/40 bg-danger/10 p-4" role="alert"><span>{error}</span><Button onClick={() => void start()}>{t('common.retry')}</Button></div> : null}
      {!loading && !error && tasks.length === 0 ? <div className="mt-8"><EmptyState description={t('tasks.emptyDescription')} icon={<Activity className="h-5 w-5" />} title={t('tasks.empty')} /></div> : null}
      {!loading && tasks.length > 0 ? (
        <>
          <ol className="mt-6 grid gap-3" aria-label={t('tasks.records')}>
            {tasks.map((task) => (
            <li className="relative overflow-hidden rounded-lg border border-border bg-surface p-5" key={task.id}>
              <div className="absolute inset-y-0 left-0 w-1 bg-primary/70" style={{ opacity: Math.max(0.25, task.progress / 100) }} />
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">{task.type}</p><h2 className="mt-2 font-display text-xl font-semibold">{task.projectId ? t('tasks.projectTask', { id: task.projectId.slice(-6) }) : t('tasks.workspaceTask')}</h2></div>
                <span className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm"><StatusIcon status={task.status} />{t(`tasks.${task.status === 'waiting_review' ? 'waitingReview' : task.status}`)}</span>
              </div>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${task.progress}%` }} /></div>
              <div className="mt-3 flex flex-wrap justify-between gap-2 font-mono text-xs text-muted"><span>{t('tasks.attempt', { progress: task.progress, attempt: task.retryCount + 1 })}</span><time dateTime={task.createdAt}>{formatDateTime(task.createdAt, locale)}</time></div>
              {task.error ? <p className="mt-3 text-sm text-danger">{task.error.code} · {getLocalizedErrorCodeMessage(task.error.code, t)}</p> : null}
              {['queued', 'running', 'waiting_review'].includes(task.status) ? <Button className="mt-4" disabled={cancellingIds.includes(task.id)} onClick={() => void cancelTask(task.id)} variant="danger">{cancellingIds.includes(task.id) ? t('tasks.cancelling') : t('tasks.cancel')}</Button> : null}
            </li>
            ))}
          </ol>
          {hasMore && nextCursor ? <div className="mt-6 text-center"><Button disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? t('common.loadingMore') : t('common.loadMore')}</Button></div> : null}
        </>
      ) : null}
    </div>
  )
}
