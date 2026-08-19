import type { OperationDefinition } from '@creator-studio/contracts'
import { useTranslation } from 'react-i18next'

import { Button } from '../../shared/ui'
import { useCanvasStore } from '../store/canvas-store'
import { useInspectorStore } from './inspector-store'
import { executeOperation } from './run-operation'

const GROUP_ORDER = ['generate', 'edit', 'media', 'publish'] as const

function sortByPriority(ops: OperationDefinition[]): OperationDefinition[] {
  return [...ops].sort((a, b) => a.presentation.priority - b.presentation.priority)
}

function groupLabelKey(group: string): string {
  return GROUP_ORDER.includes(group as (typeof GROUP_ORDER)[number]) ? `inspector.group.${group}` : ''
}

export function OperationActions({ artifactId }: { artifactId: string }) {
  const { t } = useTranslation()
  const projectId = useCanvasStore((state) => state.projectId)
  const operations = useInspectorStore((state) => state.operations)
  const loading = useInspectorStore((state) => state.operationsLoading)
  const error = useInspectorStore((state) => state.operationsError)

  if (loading) return <p className="text-xs text-muted">{t('inspector.loadingOperations')}</p>
  if (error) return <p className="rounded border border-danger/40 bg-danger/10 p-2 text-xs text-danger" role="alert">{error}</p>
  if (!operations || !projectId) return null

  const groups = new Map<string, OperationDefinition[]>()
  for (const op of sortByPriority(operations)) {
    const key = op.presentation.group || 'generate'
    const list = groups.get(key) ?? []
    list.push(op)
    groups.set(key, list)
  }

  const ordered = [
    ...GROUP_ORDER.filter((group) => groups.has(group)),
    ...[...groups.keys()].filter((group) => !GROUP_ORDER.includes(group as (typeof GROUP_ORDER)[number])),
  ]

  const run = (op: OperationDefinition): void => {
    void executeOperation({ operationId: op.id, projectId, sourceArtifactId: artifactId, config: op.defaultConfig }).catch(() => undefined)
  }

  return (
    <div className="space-y-3">
      {ordered.map((group) => {
        const ops = groups.get(group) ?? []
        const labelKey = groupLabelKey(group)
        return (
          <section key={group}>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{labelKey ? t(labelKey) : group}</p>
            <div className="grid grid-cols-2 gap-2">
              {ops.map((op) => (
                <Button
                  className={op.presentation.placement === 'primary' ? 'col-span-2 h-8 text-xs' : 'h-8 text-xs'}
                  key={op.id}
                  onClick={() => run(op)}
                  title={op.description}
                  variant={op.presentation.danger ? 'danger' : op.presentation.placement === 'primary' ? 'primary' : 'secondary'}
                >
                  {op.label}
                </Button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
