import { Loader2, RotateCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, EmptyState } from '../../shared/ui'

const DEFAULT_CANVAS_PORT = 3300

function canvasOrigin() {
  const configured = import.meta.env.VITE_CANVAS_ORIGIN
  if (typeof configured === 'string' && configured.length > 0) return configured.replace(/\/$/, '')
  return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_CANVAS_PORT}`
}

async function hostIsUp(origin: string) {
  try {
    const response = await fetch(`${origin}/`, { method: 'GET', cache: 'no-store' })
    return response.ok
  } catch {
    return false
  }
}

interface CanvasHostProps {
  projectId: string
  title?: string
}

export function CanvasHost({ projectId, title }: CanvasHostProps) {
  const { t } = useTranslation()
  const origin = useMemo(() => canvasOrigin(), [])
  const src = useMemo(() => {
    const params = new URLSearchParams({ embed: '1', externalId: projectId })
    if (title) params.set('title', title)
    return `${origin}/canvas?${params}`
  }, [origin, projectId, title])
  const [ready, setReady] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    const ping = async () => {
      const up = await hostIsUp(origin)
      if (cancelled) return
      setReady(up)
      setChecking(false)
    }
    void ping()
    if (ready) return () => {
      cancelled = true
    }
    const timer = window.setInterval(() => {
      void ping()
    }, 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [origin, ready])

  if (!ready) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-surface/30" data-testid="canvas-host">
        <EmptyState
          action={(
            <Button
              disabled={checking}
              onClick={() => {
                setChecking(true)
                void hostIsUp(origin).then((up) => {
                  setReady(up)
                  setChecking(false)
                })
              }}
              variant="primary"
            >
              {checking ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RotateCw aria-hidden="true" className="h-4 w-4" />}
              {t('canvas.hostEmbedRetry')}
            </Button>
          )}
          description={t('canvas.hostEmbedOfflineDescription')}
          icon={checking ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : <RotateCw aria-hidden="true" className="h-5 w-5" />}
          title={checking ? t('canvas.hostEmbedLoading') : t('canvas.hostEmbedOffline')}
        />
      </div>
    )
  }

  return (
    <iframe
      allow="clipboard-read; clipboard-write"
      className="h-full w-full border-0 bg-background"
      data-testid="canvas-host"
      src={src}
      title={t('canvas.pageTitle')}
    />
  )
}
