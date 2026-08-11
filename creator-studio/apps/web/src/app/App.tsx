import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { AppShell } from '../layouts/app-shell/app-shell'
import { RouteErrorBoundary, RouteSkeleton } from '../routes/route-boundary'

const DashboardPage = lazy(() => import('../routes/dashboard-page'))
const ProjectsPage = lazy(() => import('../routes/projects-page'))
const AssetsPage = lazy(() => import('../routes/assets-page'))
const CreatorProfilePage = lazy(() => import('../routes/creator-profile-page'))
const TasksPage = lazy(() => import('../routes/tasks-page'))
const SettingsPage = lazy(() => import('../routes/settings-page'))
const ProjectDetailPage = lazy(() => import('../routes/project-detail-page'))
const NotFoundPage = lazy(() => import('../routes/not-found-page'))

const projectSections = ['overview', 'canvas', 'ideas', 'topics', 'scripts', 'rhythm', 'shots', 'assets', 'tasks'] as const

function RoutedWorkspace() {
  const location = useLocation()

  return (
    <AppShell>
      <RouteErrorBoundary key={location.pathname}>
        <Suspense fallback={<RouteSkeleton />}>
          <Routes>
            <Route element={<DashboardPage />} path="/" />
            <Route element={<ProjectsPage />} path="/projects" />
            <Route element={<Navigate replace to="overview" />} path="/projects/:projectId" />
            {projectSections.map((section) => (
              <Route element={<ProjectDetailPage />} key={section} path={`/projects/:projectId/${section}`} />
            ))}
            <Route element={<CreatorProfilePage />} path="/profile" />
            <Route element={<AssetsPage />} path="/assets" />
            <Route element={<TasksPage />} path="/tasks" />
            <Route element={<SettingsPage />} path="/settings" />
            <Route element={<NotFoundPage />} path="*" />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </AppShell>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <RoutedWorkspace />
    </BrowserRouter>
  )
}
