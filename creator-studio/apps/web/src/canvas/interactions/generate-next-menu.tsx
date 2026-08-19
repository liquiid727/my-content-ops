import type { OperationDefinition } from '@creator-studio/contracts'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'

import { Button } from '../../shared/ui'
import { artifactApi } from '../api/artifact-api'
import { useCanvasStore } from '../store/canvas-store'
import { executeOperation } from '../inspector/run-operation'
import { nextCreateOperations } from './generate-next'
import { operationIcon } from './generate-next-picker'

interface GenerateNextMenuProps {
  /** 源 artifact：单个（节点「+」）或多个（画布多选）。 */
  sourceArtifactIds: string[]
  /** 视口坐标（按钮旁）。 */
  anchor: { x: number; y: number }
  /** 菜单相对锚点展开方向：down（默认，节点「+」）或 up（底部浮动条向上弹）。 */
  direction?: 'down' | 'up'
  title?: string
  onClose: () => void
}

/**
 * 锚定在「+」/浮动条旁的「继续生成」快捷菜单：列出源集合可用的 create 类操作，
 * 点击立即创建 Run（服务端同步落地 loading 占位节点并从全部源连线）。
 * 经 portal 渲染到 body，避免 React Flow viewport transform 影响 fixed 定位。
 */
export function GenerateNextMenu({ sourceArtifactIds, anchor, direction = 'down', title, onClose }: GenerateNextMenuProps) {
  const { t } = useTranslation()
  const projectId = useCanvasStore((state) => state.projectId)
  // key 记录结果对应的源集合：源变化时在渲染层判定为 loading，不在 effect 里同步 setState。
  const [state, setState] = useState<{ key: string; operations: OperationDefinition[] | null; error: string | null }>({ key: '', operations: null, error: null })
  const sourcesKey = sourceArtifactIds.join(',')

  useEffect(() => {
    let cancelled = false
    const ids = sourcesKey.split(',')
    const load = ids.length > 1 && projectId ? artifactApi.operationsForSet(projectId, ids) : artifactApi.operations(ids[0] ?? '')
    load
      .then((available) => { if (!cancelled) setState({ key: sourcesKey, operations: nextCreateOperations(available), error: null }) })
      .catch(() => { if (!cancelled) setState({ key: sourcesKey, operations: null, error: t('generateNext.loadFailed') }) })
    return () => { cancelled = true }
  }, [projectId, sourcesKey, t])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pick = (operation: OperationDefinition) => {
    const primary = sourceArtifactIds[0]
    if (!projectId || !primary) return
    void executeOperation({ operationId: operation.id, projectId, sourceArtifactId: primary, sourceArtifactIds, config: operation.defaultConfig }).catch(() => undefined)
    onClose()
  }

  const left = Math.min(anchor.x, window.innerWidth - 224)
  const top = Math.min(anchor.y, Math.max(12, window.innerHeight - 260))
  const ready = state.key === sourcesKey
  const error = ready ? state.error : null
  const operations = ready ? state.operations : null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} />
      <div
        className="fixed z-[71] w-56 rounded-md border border-border bg-surface p-1 shadow-panel"
        data-testid="generate-next-menu"
        role="menu"
        style={{ left, top, ...(direction === 'up' ? { transform: 'translateY(-100%)' } : {}) }}
      >
        <p className="truncate px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{title ?? t('generateNext.title')}</p>
        {error ? <p className="m-1 rounded border border-danger/40 bg-danger/10 p-1.5 text-[11px] text-danger" role="alert">{error}</p> : null}
        {!error && operations === null ? <p className="flex items-center gap-1.5 px-2 py-2 text-[11px] text-muted"><Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />{t('generateNext.loading')}</p> : null}
        {operations?.length === 0 ? <p className="px-2 py-2 text-[11px] text-muted">{t('generateNext.empty')}</p> : null}
        {operations?.map((operation) => {
          const Icon = operationIcon(operation)
          return (
            <Button
              className="h-8 w-full justify-start px-2 text-xs"
              key={operation.id}
              onClick={() => pick(operation)}
              role="menuitem"
              title={operation.description}
              variant="ghost"
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{operation.label}</span>
            </Button>
          )
        })}
      </div>
    </>,
    document.body,
  )
}
