import { useEffect } from 'react'
import { useParams } from 'react-router-dom'

import { CanvasHost } from '../canvas/host/canvas-host'
import { useProjectStore } from '../modules/projects'

export default function CanvasPage() {
  const { projectId = 'unknown' } = useParams()
  const project = useProjectStore((state) => state.projects.find((item) => item.id === projectId) ?? state.overviews[projectId]?.project)
  const loadOverview = useProjectStore((state) => state.loadOverview)

  useEffect(() => {
    if (project || projectId === 'unknown') return
    void loadOverview(projectId).catch(() => undefined)
  }, [loadOverview, project, projectId])

  return (
    <div className="h-full min-h-0">
      <CanvasHost projectId={projectId} title={project?.title} />
    </div>
  )
}
