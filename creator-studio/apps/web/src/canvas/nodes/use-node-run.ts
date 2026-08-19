import type { RunSummary } from '../runtime/run-store'
import { useRunStore } from '../runtime/run-store'

export function useNodeRun(artifactId: string | undefined): RunSummary | undefined {
  return useRunStore((state) => {
    if (!artifactId) return undefined
    const mapped = state.runByArtifact[artifactId]
    if (mapped && state.byId[mapped]) return state.byId[mapped]
    return Object.values(state.byId)
      .filter((run) => run.sourceArtifactId === artifactId || (run.sourceArtifactIds ?? []).includes(artifactId) || run.outputArtifactIds?.includes(artifactId))
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]
  })
}
