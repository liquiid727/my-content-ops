import { Bell, FolderKanban, Images, LayoutDashboard, ListTodo, Menu, Settings, Sparkles, UserRound, X } from 'lucide-react'
import { type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router-dom'

import { LanguageSwitcher } from '../../modules/i18n'
import { ThemeSwitcher } from '../../modules/theme/theme-switcher'
import { PublishDialog } from '../../canvas/publish/publish-dialog'
import { cn } from '../../shared/lib/cn'
import { Button, ToastRegion } from '../../shared/ui'

const navigation = [
  { labelKey: 'navigation.dashboard', icon: LayoutDashboard, to: '/', end: true },
  { labelKey: 'navigation.projects', icon: FolderKanban, to: '/projects' },
  { labelKey: 'navigation.profile', icon: UserRound, to: '/profile' },
  { labelKey: 'navigation.assets', icon: Images, to: '/assets' },
  { labelKey: 'navigation.tasks', icon: ListTodo, to: '/tasks' },
  { labelKey: 'navigation.settings', icon: Settings, to: '/settings' },
]

function getCurrentContextKey(pathname: string) {
  if (pathname.startsWith('/projects/')) return 'navigation.projectWorkspace'
  if (pathname.startsWith('/projects')) return 'navigation.projects'
  if (pathname.startsWith('/profile')) return 'navigation.profile'
  if (pathname.startsWith('/assets')) return 'navigation.assets'
  if (pathname.startsWith('/tasks')) return 'navigation.tasks'
  if (pathname.startsWith('/settings')) return 'navigation.settings'
  if (pathname === '/') return 'navigation.dashboard'
  return 'navigation.unknown'
}

/** 当前路由是项目画布时，提取 projectId（Header Publish 入口的目标）。 */
function canvasProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)\/canvas$/)
  return match ? decodeURIComponent(match[1]!) : null
}

export function AppShell({ children }: PropsWithChildren) {
  const { t } = useTranslation()
  const [navigationOpen, setNavigationOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const location = useLocation()

  const closeNavigation = useCallback(() => {
    setNavigationOpen(false)
    requestAnimationFrame(() => menuButtonRef.current?.focus())
  }, [])

  useEffect(() => {
    if (navigationOpen) closeButtonRef.current?.focus()
  }, [navigationOpen])

  useEffect(() => {
    if (!navigationOpen) return

    const handleNavigationKeyDown = (event: KeyboardEvent) => {
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

    document.addEventListener('keydown', handleNavigationKeyDown)
    return () => document.removeEventListener('keydown', handleNavigationKeyDown)
  }, [closeNavigation, navigationOpen])

  const openNavigation = () => {
    setNavigationOpen(true)
  }

  return (
    <div className="flex min-h-screen min-w-0 bg-background text-foreground">
      {navigationOpen ? <button aria-label={t('common.closeNavigation')} className="fixed inset-0 z-30 bg-black/55 md:hidden" onClick={closeNavigation} /> : null}
      <aside
        aria-label={t('common.workspaceSidebar')}
        className={`fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col border-r border-border bg-surface p-4 transition-transform duration-normal md:visible md:static md:translate-x-0 ${navigationOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}
        id="workspace-navigation"
        ref={sidebarRef}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-fuchsia-500 via-primary to-orange-500 text-white shadow-panel">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
            </span>
            <div>
              <p className="font-display text-lg font-semibold tracking-tight">{t('common.brand')}</p>
              <p className="font-utility text-[10px] uppercase tracking-[0.18em] text-muted">{t('common.localWorkspace')}</p>
            </div>
          </div>
          <button aria-label={t('common.closeNavigation')} className="rounded-md p-2 text-muted hover:bg-elevated hover:text-foreground md:hidden" onClick={closeNavigation} ref={closeButtonRef}>
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label={t('common.primaryNavigation')} className="mt-8 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                className={({ isActive }) => cn(
                  'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/15 text-primary' : 'text-muted hover:bg-elevated hover:text-foreground',
                )}
                end={item.end ?? false}
                key={item.labelKey}
                onClick={() => {
                  if (navigationOpen) closeNavigation()
                }}
                to={item.to}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {t(item.labelKey)}
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-auto rounded-md border border-border bg-elevated p-3">
          <p className="font-utility text-[10px] uppercase tracking-[0.16em] text-muted">{t('common.foundation')}</p>
          <p className="mt-2 text-sm font-medium">{t('common.interfaceOnline')}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
            <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-primary to-orange-500" />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-6">
          <button
            aria-controls="workspace-navigation"
            aria-expanded={navigationOpen}
            aria-label={t('common.openNavigation')}
            className="rounded-md p-2 text-muted hover:bg-elevated hover:text-foreground md:hidden"
            onClick={openNavigation}
            ref={menuButtonRef}
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-utility text-[10px] uppercase tracking-[0.16em] text-muted">{t('common.currentContext')}</p>
            <p className="truncate text-sm font-semibold">{t(getCurrentContextKey(location.pathname))}</p>
          </div>
          {canvasProjectId(location.pathname) ? <PublishDialog projectId={canvasProjectId(location.pathname)!} /> : null}
          <LanguageSwitcher />
          <ThemeSwitcher />
          <Button aria-label={t('common.notifications')} className="hidden h-9 w-9 px-0 sm:inline-flex" variant="ghost">
            <Bell aria-hidden="true" className="h-4 w-4" />
          </Button>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</main>
        <ToastRegion />
      </div>
    </div>
  )
}
