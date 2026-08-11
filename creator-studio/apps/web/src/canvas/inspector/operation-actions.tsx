import type { OperationDefinition } from '@creator-studio/contracts'
import { useTranslation } from 'react-i18next'

import { Button } from '../../shared/ui'
import { useCanvasStore } from '../store/canvas-store'
import { useInspectorStore } from './inspector-store'
import { executeOperation } from './run-operation'

function sortByPriority(ops: OperationDefinition[]): OperationDefinition[] {
  return [...ops].sort((a, b) => a.presentation.priority - b.presentation.priority)
}

/** Registry 驱动的操作按钮区：按 placement（primary/secondary）分组，无写死分支。 */
export function OperationActions({ artifactId }: { artifactId: string }) {
  const { t } = useTranslation()
  const projectId = useCanvasStore((state) => state.projectId)
  const operations = useInspectorStore((state) => state.operations)
  const loading = useInspectorStore((state) => state.operationsLoading)
  const error = useInspectorStore((state) => state.operationsError)

  if (loading) return <p className="text-xs text-muted">{t('inspector.loadingOperations')}</p>
  if (error) return <p className="rounded border border-danger/40 bg-danger/10 p-2 text-xs text-danger" role="alert">{error}</p>
  if (!operations || !projectId) return null

  const primary = sortByPriority(operations.filter((op) => op.presentation.placement === 'primary'))
  const secondary = sortByPriority(operations.filter((op) => op.presentation.placement !== 'primary'))

  const run = (op: OperationDefinition): void => {
    void executeOperation({ operationId: op.id, projectId, sourceArtifactId: artifactId, config: op.defaultConfig }).catch(() => undefined)
  }

  return (
    <div className="space-y-2">
      {primary.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {primary.map((op) => (
            <Button key={op.id} onClick={() => run(op)} title={op.description} variant={op.presentation.danger ? 'danger' : 'primary'}>
              {op.label}
            </Button>
          ))}
        </div>
      ) : null}
      {secondary.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {secondary.map((op) => (
            <Button key={op.id} onClick={() => run(op)} title={op.description} variant="secondary">
              {op.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
