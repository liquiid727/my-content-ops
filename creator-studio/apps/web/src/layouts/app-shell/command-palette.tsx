import { ArrowRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useProjectStore } from '../../modules/projects'
import { useWorkspaceTabsStore } from '../../modules/workspace'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input } from '../../shared/ui'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const destinations = [
  ['navigation.dashboard', '/'],
  ['navigation.projects', '/projects'],
  ['navigation.nodes', '/nodes'],
  ['navigation.assets', '/assets'],
  ['navigation.inspiration', '/inspiration'],
  ['navigation.knowledge', '/knowledge'],
  ['navigation.profile', '/profile'],
  ['navigation.templates', '/templates'],
  ['navigation.publish', '/publish'],
  ['navigation.history', '/history'],
] as const

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const projects = useProjectStore((state) => state.projects)
  const openProject = useWorkspaceTabsStore((state) => state.openProject)
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLocaleLowerCase()

  const results = useMemo(() => {
    const routes = destinations.map(([labelKey, to]) => ({ id: to, label: t(labelKey), to, kind: t('commandPalette.page') }))
    const projectRoutes = projects.map((project) => ({
      id: project.id,
      label: project.title,
      to: `/projects/${encodeURIComponent(project.id)}/overview`,
      projectId: project.id,
      kind: t('commandPalette.project'),
    }))
    return [...projectRoutes, ...routes].filter((item) => !normalized || `${item.label} ${item.kind}`.toLocaleLowerCase().includes(normalized)).slice(0, 10)
  }, [normalized, projects, t])

  const visit = (item: (typeof results)[number]) => {
    if ('projectId' in item && item.projectId) openProject(item.projectId, item.to)
    navigate(item.to)
    setQuery('')
    onOpenChange(false)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
        <div className="border-b border-border p-5">
          <DialogTitle className="flex items-center gap-2 text-lg"><Search aria-hidden="true" className="h-5 w-5 text-primary" />{t('commandPalette.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('commandPalette.description')}</DialogDescription>
          <Input autoFocus className="mt-4 border-0 bg-elevated/70" onChange={(event) => setQuery(event.target.value)} placeholder={t('commandPalette.placeholder')} value={query} />
        </div>
        <div className="studio-scrollbar max-h-[24rem] overflow-y-auto p-2">
          {results.length ? results.map((item) => (
            <Button className="h-auto w-full justify-between px-3 py-3 text-left" key={`${item.kind}-${item.id}`} onClick={() => visit(item)} variant="ghost">
              <span className="min-w-0"><span className="block truncate text-sm text-foreground">{item.label}</span><span className="mt-0.5 block font-utility text-[10px] uppercase tracking-[0.14em] text-muted">{item.kind}</span></span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
            </Button>
          )) : <p className="p-8 text-center text-sm text-muted">{t('commandPalette.empty')}</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
