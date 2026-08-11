import { Eye, Loader2, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ulid } from 'ulid'

import type { ArtifactDetail, Run, RunStatus } from '@creator-studio/contracts'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Select, useToastStore } from '../../shared/ui'
import { canvasApi } from '../api/canvas-api'
import { runApi } from '../api/run-api'
import { useRunStore } from '../runtime/run-store'

/** publish 操作可接受的 Artifact role（04-runtime §2.3 action/publish）。 */
const PUBLISHABLE_ROLES = new Set(['script', 'video'])
const TERMINAL: ReadonlySet<RunStatus> = new Set(['completed', 'failed', 'cancelled'])

const ROLE_LABEL_KEYS: Record<string, string> = {
  script: 'nodePicker.script',
  video: 'publish.roleVideo',
}

function roleLabel(role: string, t: (key: string) => string): string {
  return ROLE_LABEL_KEYS[role] ? t(ROLE_LABEL_KEYS[role]!) : role
}

/** 运行状态行：排队/运行/完成/失败 + 副作用详情。 */
function RunStatusLine({ run }: { run: Run }) {
  const { t } = useTranslation()
  const output = useRunStore((state) => state.byId[run.id]?.output) as { sideEffect?: { kind?: string; detail?: string } } | undefined
  const statusKey = `publish.runStatus.${run.status}`
  const failed = run.status === 'failed' && run.error
  return (
    <div className="rounded-md border border-border bg-surface/60 p-3" role="status">
      <p className="flex items-center gap-2 text-sm font-semibold">
        {run.status === 'running' || run.status === 'queued' ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-primary" />
        ) : run.status === 'completed' ? (
          <span className="text-success">✓</span>
        ) : failed ? (
          <span className="text-danger">✕</span>
        ) : null}
        {t(statusKey)}
      </p>
      {output?.sideEffect?.detail ? <p className="mt-1 text-xs leading-5 text-muted">{output.sideEffect.detail}</p> : null}
      {failed ? <p className="mt-1 text-xs leading-5 text-danger">{run.error?.message}</p> : null}
    </div>
  )
}

/** 右上角 Header Publish 入口：选平台 → 预览/发布（MVP 骨架，不接真实平台）。 */
export function PublishDialog({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const notify = useToastStore((state) => state.notify)
  const [open, setOpen] = useState(false)
  const [platform, setPlatform] = useState('douyin')
  const [targets, setTargets] = useState<ArtifactDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [run, setRun] = useState<Run>()
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function loadTargets() {
    setLoading(true)
    setTargets([])
    setRun(undefined)
    try {
      const graph = (await canvasApi.graph(projectId)).data
      const details = await Promise.all(
        graph.nodes.map(async (node) => {
          try { return (await canvasApi.artifact(node.artifactId)).data } catch { return undefined }
        }),
      )
      const publishable = details
        .filter((detail): detail is ArtifactDetail => detail !== undefined && detail !== null && PUBLISHABLE_ROLES.has(detail.role))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      if (mounted.current) setTargets(publishable)
    } catch {
      // 找不到可发布内容时保持空态，按钮禁用即可。
    } finally {
      if (mounted.current) setLoading(false)
    }
  }

  const openDialog = () => {
    setOpen(true)
    void loadTargets()
  }

  async function pollRun(runId: string) {
    while (mounted.current) {
      const current = await runApi.get(runId).catch(() => undefined)
      if (!current || !mounted.current) return
      setRun(current)
      if (TERMINAL.has(current.status)) {
        setBusy(false)
        if (current.status === 'completed') {
          const output = useRunStore.getState().byId[runId]?.output as { sideEffect?: { detail?: string } } | undefined
          notify({ title: t('publish.completed'), ...(output?.sideEffect?.detail ? { description: output.sideEffect.detail } : {}) })
        } else if (current.status === 'failed') {
          notify({ title: t('publish.failed'), ...(current.error ? { description: current.error.message } : {}) })
        }
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 700))
    }
  }

  async function trigger(mode: 'preview' | 'publish') {
    setBusy(true)
    setRun(undefined)
    try {
      const source = targets[0]
      const result = await runApi.create('publish', {
        projectId,
        ...(source ? { sourceArtifactId: source.id } : {}),
        config: { mode, platform },
        idempotencyKey: ulid(),
      })
      void pollRun(result.runId)
    } catch {
      notify({ title: t('publish.triggerFailed') })
      setBusy(false)
    }
  }

  const target = targets[0]

  return (
    <>
      <Button aria-label={t('publish.entry')} className="hidden h-9 sm:inline-flex" onClick={openDialog} variant="secondary">
        <Send aria-hidden="true" className="h-4 w-4" />
        {t('publish.entry')}
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>{t('publish.title')}</DialogTitle>
          <DialogDescription>{t('publish.description')}</DialogDescription>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t('publish.target')}</p>
              {loading ? (
                <p className="mt-1 text-sm text-muted">{t('publish.loadingTarget')}</p>
              ) : target ? (
                <p className="mt-1 text-sm" data-testid="publish-target">
                  {roleLabel(target.role, t)}
                  {target.currentVersion ? <span className="text-muted"> · v{target.currentVersion.versionNumber}</span> : null}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted" role="status">{t('publish.targetNone')}</p>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t('publish.platform')}</p>
              <Select
                aria-label={t('publish.platform')}
                className="mt-1"
                onValueChange={setPlatform}
                options={[
                  { value: 'wechat', label: t('publish.platformWechat') },
                  { value: 'xiaohongshu', label: t('publish.platformXiaohongshu') },
                  { value: 'douyin', label: t('publish.platformDouyin') },
                  { value: 'bilibili', label: t('publish.platformBilibili') },
                ]}
                value={platform}
              />
            </div>

            {run ? <RunStatusLine run={run} /> : null}

            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy || !target} onClick={() => void trigger('preview')} variant="secondary">
                <Eye aria-hidden="true" className="h-4 w-4" />
                {t('publish.preview')}
              </Button>
              <Button className="flex-1" disabled={busy || !target} onClick={() => void trigger('publish')} variant="primary">
                <Send aria-hidden="true" className="h-4 w-4" />
                {t('publish.publish')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
