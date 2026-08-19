import { Plus, Waypoints, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { ulid } from 'ulid'

import type { CreateProject } from '@creator-studio/contracts'
import { ProjectForm, useProjectStore } from '../../modules/projects'
import { useWorkspaceTabsStore } from '../../modules/workspace'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, IconButton } from '../../shared/ui'

export function WorkspaceTabs() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const projects = useProjectStore((state) => state.projects)
  const createProject = useProjectStore((state) => state.createProject)
  const openProjectIds = useWorkspaceTabsStore((state) => state.openProjectIds)
  const lastRouteByProject = useWorkspaceTabsStore((state) => state.lastRouteByProject)
  const activateProject = useWorkspaceTabsStore((state) => state.activateProject)
  const closeProject = useWorkspaceTabsStore((state) => state.closeProject)
  const openProject = useWorkspaceTabsStore((state) => state.openProject)
  const [createOpen, setCreateOpen] = useState(false)
  const pendingSubmission = useRef<{ hash: string; key: string } | undefined>(undefined)

  const projectById = new Map(projects.map((project) => [project.id, project]))
  const routeProjectId = location.pathname.match(/^\/projects\/([^/]+)/)?.[1]
  const visibleProjectId = routeProjectId ? decodeURIComponent(routeProjectId) : undefined

  const visitProject = (projectId: string) => {
    activateProject(projectId)
    navigate(lastRouteByProject[projectId] ?? `/projects/${encodeURIComponent(projectId)}/overview`)
  }

  const handleClose = (projectId: string) => {
    const wasActive = visibleProjectId === projectId
    const next = closeProject(projectId)
    if (wasActive) navigate(next ? (lastRouteByProject[next] ?? `/projects/${encodeURIComponent(next)}/overview`) : '/projects')
  }

  const handleCreate = async (input: CreateProject) => {
    const hash = JSON.stringify(input)
    if (pendingSubmission.current?.hash !== hash) pendingSubmission.current = { hash, key: ulid() }
    const project = await createProject(input, pendingSubmission.current.key)
    pendingSubmission.current = undefined
    const route = `/projects/${encodeURIComponent(project.id)}/overview`
    openProject(project.id, route)
    setCreateOpen(false)
    navigate(route)
  }

  return (
    <>
      <div aria-label={t('workspaceTabs.label')} className="studio-scrollbar flex min-w-0 flex-1 items-end gap-1 overflow-x-auto self-stretch pt-2" role="tablist">
        {openProjectIds.map((projectId) => {
          const project = projectById.get(projectId)
          if (!project) return null
          const active = visibleProjectId === projectId
          return (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="group relative flex h-[3.35rem] min-w-[11rem] max-w-[15rem] items-center rounded-t-lg border border-b-0 border-border/70 bg-surface/55 pl-1 pr-1 backdrop-blur-xl"
              initial={{ opacity: 0, y: 8 }}
              key={projectId}
              layout
              role="presentation"
            >
              {active ? <motion.span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-primary" layoutId="workspace-tab-indicator" /> : null}
              <Button
                aria-selected={active}
                className="min-h-0 min-w-0 flex-1 justify-start gap-2 bg-transparent px-2 py-0 text-left text-xs text-foreground hover:bg-transparent"
                onClick={() => visitProject(projectId)}
                role="tab"
                title={project.title}
                variant="ghost"
              >
                <Waypoints aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">{project.title}</span>
              </Button>
              <IconButton aria-label={t('workspaceTabs.close', { title: project.title })} className="h-7 w-7 opacity-60 group-hover:opacity-100" onClick={() => handleClose(projectId)}>
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </IconButton>
            </motion.div>
          )
        })}
        <Button className="mb-2 h-9 min-h-0 shrink-0 border-dashed px-3 text-xs" onClick={() => setCreateOpen(true)} variant="secondary">
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          {t('workspaceTabs.newProject')}
        </Button>
      </div>

      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent>
          <DialogTitle>{t('projects.createDialogTitle')}</DialogTitle>
          <DialogDescription>{t('projects.createDialogDescription')}</DialogDescription>
          <ProjectForm onCancel={() => setCreateOpen(false)} onCreate={handleCreate} />
        </DialogContent>
      </Dialog>
    </>
  )
}
