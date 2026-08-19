import {
  Bell,
  Clock3,
  FolderKanban,
  History,
  LibraryBig,
  Images,
  LayoutTemplate,
  Lightbulb,
  Menu,
  PanelLeftClose,
  PenTool,
  Search,
  Send,
  Settings,
  Share2,
  UserRound,
  Workflow,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { PublishDialog } from '../../canvas/publish/publish-dialog'
import { useProjectStore } from '../../modules/projects'
import { useTaskStore } from '../../modules/tasks'
import { useWorkspaceTabsStore } from '../../modules/workspace'
import { RouteErrorBoundary } from '../../routes/route-boundary'
import { cn } from '../../shared/lib/cn'
import { Button, IconButton, ToastRegion, useToastStore } from '../../shared/ui'
import { AmbientField } from './ambient-field'
import { CommandPalette } from './command-palette'
import { WorkspaceTabs } from './workspace-tabs'

const navigation = [
  { labelKey: 'navigation.projects', icon: FolderKanban, to: '/projects' },
  { labelKey: 'navigation.nodes', icon: Workflow, to: '/nodes' },
  { labelKey: 'navigation.assets', icon: Images, to: '/assets' },
  { labelKey: 'navigation.inspiration', icon: Lightbulb, to: '/inspiration' },
  { labelKey: 'navigation.knowledge', icon: LibraryBig, to: '/knowledge' },
  { labelKey: 'navigation.profile', icon: UserRound, to: '/profile' },
  { labelKey: 'navigation.templates', icon: LayoutTemplate, to: '/templates' },
  { labelKey: 'navigation.publish', icon: Send, to: '/publish' },
  { labelKey: 'navigation.history', icon: History, to: '/history' },
] as const

function projectIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/projects\/([^/]+)(?:\/|$)/)
  return match?.[1] ? decodeURIComponent(match[1]) : undefined
}

export function AppShell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const projects = useProjectStore((state) => state.projects)
  const projectsHaveMore = useProjectStore((state) => state.hasMore)
  const loadProjects = useProjectStore((state) => state.loadProjects)
  const tasks = useTaskStore((state) => state.tasks)
  const startTasks = useTaskStore((state) => state.start)
  const stopTasks = useTaskStore((state) => state.stop)
  const openProject = useWorkspaceTabsStore((state) => state.openProject)
  const reconcileProjects = useWorkspaceTabsStore((state) => state.reconcileProjects)
  const notify = useToastStore((state) => state.notify)
  const currentProjectId = projectIdFromPath(location.pathname)
  const activeTasks = tasks.filter((task) => ['queued', 'running', 'waiting_review'].includes(task.status))
  const isCanvas = location.pathname.endsWith('/canvas')

  useEffect(() => {
    if (projects.length) {
      if (!projectsHaveMore) reconcileProjects(projects.map((project) => project.id))
      return
    }
    void loadProjects().then(() => {
      const current = useProjectStore.getState()
      if (!current.error && !current.hasMore) reconcileProjects(current.projects.map((project) => project.id))
    })
  }, [loadProjects, projects, projectsHaveMore, reconcileProjects])

  useEffect(() => {
    void startTasks()
    return stopTasks
  }, [startTasks, stopTasks])

  useEffect(() => {
    if (currentProjectId) openProject(currentProjectId, location.pathname)
  }, [currentProjectId, location.pathname, openProject])

  useEffect(() => {
    const openCommand = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', openCommand)
    return () => window.removeEventListener('keydown', openCommand)
  }, [])

  const closeNavigation = useCallback(() => {
    setNavigationOpen(false)
    requestAnimationFrame(() => menuButtonRef.current?.focus())
  }, [])

  useEffect(() => {
    if (navigationOpen) closeButtonRef.current?.focus()
  }, [navigationOpen])

  useEffect(() => {
    if (!navigationOpen) return
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeNavigation()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !sidebarRef.current?.contains(document.activeElement))) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !sidebarRef.current?.contains(document.activeElement))) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', trapFocus)
    return () => document.removeEventListener('keydown', trapFocus)
  }, [closeNavigation, navigationOpen])

  const shareCurrentView = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      notify({ title: t('shell.linkCopied'), description: t('shell.linkCopiedDescription') })
    } catch {
      notify({ title: t('shell.copyFailed'), description: t('shell.copyFailedDescription') })
    }
  }

  return (
    <div className="relative flex h-screen min-w-0 overflow-hidden bg-background text-foreground">
      <AmbientField />
      {navigationOpen ? <button aria-label={t('common.closeNavigation')} className="fixed inset-0 z-30 bg-foreground/30 backdrop-blur-sm lg:hidden" onClick={closeNavigation} type="button" /> : null}

      <aside
        aria-label={t('common.workspaceSidebar')}
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[13rem] flex-col border-r border-border/70 bg-surface/80 p-3 backdrop-blur-2xl transition-[width,transform] duration-normal lg:static lg:translate-x-0',
          navigationOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          sidebarCollapsed && 'lg:w-[4.75rem]',
        )}
        id="workspace-navigation"
        ref={sidebarRef}
      >
        <div className={cn('flex h-12 items-center gap-2 px-1', sidebarCollapsed ? 'lg:justify-center' : 'justify-between')}>
          <NavLink aria-label="HelloAlro" className={cn('flex min-w-0 items-center gap-2.5', sidebarCollapsed && 'lg:hidden')} to="/">
            <motion.span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[0.7rem] bg-foreground text-background shadow-float" whileHover={{ rotate: -6, scale: 1.05 }}>
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,hsl(var(--ambient-primary)/.8),transparent_44%)]" />
              <PenTool aria-hidden="true" className="relative h-4 w-4" />
            </motion.span>
            {!sidebarCollapsed ? <span className="min-w-0"><span className="block truncate font-display text-base font-bold tracking-[-0.02em]">HelloAlro</span><span className="block truncate font-utility text-[9px] uppercase tracking-[0.16em] text-muted">{t('shell.creatorWorkbench')}</span></span> : null}
          </NavLink>
          <IconButton
            aria-label={t('shell.collapseSidebar')}
            className="hidden lg:inline-flex"
            onClick={() => setSidebarCollapsed((value) => !value)}
            title={t('shell.collapseSidebar')}
          >
            <PanelLeftClose aria-hidden="true" className={cn('h-4 w-4 transition-transform', sidebarCollapsed && 'rotate-180')} />
          </IconButton>
          <IconButton aria-label={t('common.closeNavigation')} className="lg:hidden" onClick={closeNavigation} ref={closeButtonRef}><X aria-hidden="true" className="h-4 w-4" /></IconButton>
        </div>

        <nav aria-label={t('common.primaryNavigation')} className="mt-5 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                className={({ isActive }) => cn(
                  'group relative flex min-h-10 items-center gap-3 overflow-hidden rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-elevated/75 hover:text-foreground',
                  isActive && 'bg-elevated text-foreground shadow-[0_1px_0_hsl(var(--border)/.8)]',
                  sidebarCollapsed && 'lg:justify-center lg:px-0',
                )}
                key={item.to}
                onClick={() => { if (navigationOpen) closeNavigation() }}
                title={sidebarCollapsed ? t(item.labelKey) : undefined}
                to={item.to}
              >
                {({ isActive }) => (
                  <>
                    {isActive ? <motion.span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" layoutId="sidebar-active" /> : null}
                    <Icon aria-hidden="true" className={cn('h-4 w-4 shrink-0 transition-transform group-hover:scale-110', isActive && 'text-primary')} />
                    {!sidebarCollapsed ? <span>{t(item.labelKey)}</span> : null}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        <NavLink
          aria-label={t('navigation.settings')}
          className={({ isActive }) => cn(
            'group relative mt-auto flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-elevated/75 hover:text-foreground',
            isActive && 'bg-elevated text-foreground',
            sidebarCollapsed && 'lg:justify-center lg:px-0',
          )}
          title={sidebarCollapsed ? t('navigation.settings') : undefined}
          to="/settings"
        >
          {({ isActive }) => (
            <>
              {isActive ? <motion.span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" layoutId="sidebar-active" /> : null}
              <Settings aria-hidden="true" className={cn('h-4 w-4 shrink-0 transition-transform group-hover:rotate-12', isActive && 'text-primary')} />
              {!sidebarCollapsed ? <span>{t('navigation.settings')}</span> : null}
            </>
          )}
        </NavLink>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border/70 bg-background/72 px-2 backdrop-blur-2xl sm:px-3">
          <IconButton aria-controls="workspace-navigation" aria-expanded={navigationOpen} aria-label={t('common.openNavigation')} className="lg:hidden" onClick={() => setNavigationOpen(true)} ref={menuButtonRef}>
            <Menu aria-hidden="true" className="h-5 w-5" />
          </IconButton>
          <WorkspaceTabs />
          <div className="ml-auto flex shrink-0 items-center gap-1 border-l border-border/70 pl-2">
            <IconButton aria-label={t('shell.search')} onClick={() => setCommandOpen(true)} title={`${t('shell.search')} · ⌘K`}><Search aria-hidden="true" className="h-4 w-4" /></IconButton>
            <div className="relative">
              <IconButton aria-expanded={notificationsOpen} aria-label={t('common.notifications')} onClick={() => setNotificationsOpen((value) => !value)}>
                <Bell aria-hidden="true" className="h-4 w-4" />
                {activeTasks.length ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-background bg-danger" /> : null}
              </IconButton>
              {notificationsOpen ? (
                <div className="studio-glass absolute right-0 top-11 w-80 overflow-hidden rounded-xl p-2">
                  <p className="px-3 py-2 font-utility text-[10px] uppercase tracking-[0.16em] text-muted">{t('shell.activeTasks', { count: activeTasks.length })}</p>
                  {activeTasks.length ? activeTasks.slice(0, 5).map((task) => <div className="rounded-lg px-3 py-2 hover:bg-elevated/70" key={task.id}><div className="flex items-center justify-between gap-3 text-xs"><span className="truncate font-medium">{task.type}</span><span className="font-utility text-[10px] text-muted">{task.progress}%</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-border"><span className="block h-full rounded-full bg-primary" style={{ width: `${task.progress}%` }} /></div></div>) : <p className="px-3 pb-3 text-xs text-muted">{t('shell.noActiveTasks')}</p>}
                  <Button className="mt-1 w-full text-xs" onClick={() => { setNotificationsOpen(false); navigate('/tasks') }} variant="ghost"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{t('shell.viewTasks')}</Button>
                </div>
              ) : null}
            </div>
            <IconButton aria-label={t('shell.share')} className="hidden sm:inline-flex" onClick={() => void shareCurrentView()}><Share2 aria-hidden="true" className="h-4 w-4" /></IconButton>
            {currentProjectId ? <PublishDialog projectId={currentProjectId} /> : null}
          </div>
        </header>

        <AnimatePresence initial={false} mode="wait">
          <motion.main
            animate={{ opacity: 1, y: 0 }}
            className={cn('studio-scrollbar min-h-0 min-w-0 flex-1', isCanvas ? 'overflow-hidden p-0' : 'overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8')}
            initial={{ opacity: 0, y: 8 }}
            key={location.pathname}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <RouteErrorBoundary key={location.pathname}>
              <Outlet />
            </RouteErrorBoundary>
          </motion.main>
        </AnimatePresence>
        <ToastRegion />
      </div>

      <CommandPalette onOpenChange={setCommandOpen} open={commandOpen} />
    </div>
  )
}
