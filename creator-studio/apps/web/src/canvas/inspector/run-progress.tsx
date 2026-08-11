import { CheckCircle2, CircleDashed, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ulid } from 'ulid'

import { runApi } from '../api/run-api'
import { useCanvasStore } from '../store/canvas-store'
import { useRunStore } from '../runtime/run-store'
import { Button } from '../../shared/ui'

export function RunProgress({ artifactId }: { artifactId: string }) {
  const { t } = useTranslation()
  const projectId = useCanvasStore((state) => state.projectId)
  const runId = useRunStore((state) => state.runByArtifact[artifactId])
  const run = useRunStore((state) => (runId ? state.byId[runId] : undefined))
  if (!run) return null

  const running = run.status === 'queued' || run.status === 'running' || run.status === 'waiting_review'

  const cancel = async (): Promise<void> => {
    if (!projectId) return
    await runApi.cancel(run.runId).catch(() => undefined)
    useRunStore.getState().applyRunEvent('run.cancelled', { runId: run.runId, operationId: run.operationId, sourceArtifactId: artifactId, projectId })
  }

  const retry = async (): Promise<void> => {
    if (!projectId) return
    const result = await runApi.retry(run.runId, ulid()).catch(() => undefined)
    if (!result) return
    useRunStore.getState().applyRunEvent('run.created', {
      runId: result.runId, operationId: run.operationId, taskId: result.taskId, sourceArtifactId: artifactId, projectId,
    })
  }

  return (
    <div className="rounded-md border border-border bg-surface/60 p-3" data-testid="inspector-run-progress">
      <div className="flex items-center gap-2 text-sm">
        {running ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-primary" /> : run.status === 'completed' ? <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" /> : run.status === 'failed' ? <XCircle aria-hidden="true" className="h-4 w-4 text-danger" /> : <CircleDashed aria-hidden="true" className="h-4 w-4 text-muted" />}
        <span className="font-semibold">{t(`inspector.runStatus.${run.status}`)}</span>
        {run.progress > 0 && running ? <span className="ml-auto text-xs text-muted">{run.progress}%</span> : null}
      </div>
      {running ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
          <div className="h-full bg-primary transition-all duration-fast" style={{ width: `${Math.max(run.progress, 5)}%` }} />
        </div>
      ) : null}
      {run.status === 'failed' && run.error ? (
        <div className="mt-2 rounded border border-danger/40 bg-danger/10 p-2 text-xs text-danger" role="alert">
          <p className="font-semibold">{run.error.code}</p>
          <p className="mt-0.5 break-words">{run.error.message}</p>
        </div>
      ) : null}
      {run.status === 'failed' ? (
        <Button className="mt-2 h-8 px-3 text-xs" onClick={() => void retry()} variant="secondary">
          <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
          {t('inspector.retry')}
        </Button>
      ) : null}
      {running ? (
        <Button className="mt-2 h-8 px-3 text-xs" onClick={() => void cancel()} variant="ghost">
          {t('inspector.cancel')}
        </Button>
      ) : null}
    </div>
  )
}
