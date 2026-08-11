import { useEffect } from 'react'

import { artifactApi } from '../api/artifact-api'
import { useInspectorStore } from './inspector-store'

/** 选中 artifact 变化时，经 Registry 拉取可用操作。operationsReload 保证重复选中同一 artifact 也重新拉取。 */
export function useInspectorOperations(artifactId: string | null): void {
  const reload = useInspectorStore((state) => state.operationsReload)
  useEffect(() => {
    if (!artifactId) return
    let active = true
    useInspectorStore.setState({ operationsLoading: true, operationsError: null })
    artifactApi.operations(artifactId)
      .then((operations) => { if (active) useInspectorStore.getState().setOperations(operations) })
      .catch(() => { if (active) useInspectorStore.getState().setOperations(null, '加载操作失败。') })
    return () => { active = false }
  }, [artifactId, reload])
}
