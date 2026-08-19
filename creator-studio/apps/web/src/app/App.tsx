import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '../layouts/app-shell/app-shell'
import { RouteSkeleton } from '../routes/route-boundary'

const DashboardPage = lazy(() => import('../routes/dashboard-page'))
const ProjectsPage = lazy(() => import('../routes/projects-page'))
const AssetsPage = lazy(() => import('../routes/assets-page'))
const CreatorProfilePage = lazy(() => import('../routes/creator-profile-page'))
const TasksPage = lazy(() => import('../routes/tasks-page'))
const SettingsPage = lazy(() => import('../routes/settings-page'))
const KnowledgePage = lazy(() => import('../routes/knowledge-page'))
const ProjectDetailPage = lazy(() => import('../routes/project-detail-page'))
const CanvasPage = lazy(() => import('../routes/canvas-page'))
const TextStudioPage = lazy(() => import('../routes/text-studio-page'))
const ImageStudioPage = lazy(() => import('../routes/image-studio-page'))
const WorkspacePlannedPage = lazy(() => import('../routes/workspace-planned-page'))
const NotFoundPage = lazy(() => import('../routes/not-found-page'))

const projectSections = ['overview', 'sources', 'ideas', 'topics', 'scripts', 'rhythm', 'shots', 'assets', 'tasks'] as const

function RoutedWorkspace() {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Routes>
        <Route element={<AppShell />}>
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
          <Route element={<KnowledgePage />} path="/knowledge" />
          <Route element={<WorkspacePlannedPage />} path="/nodes" />
          <Route element={<WorkspacePlannedPage />} path="/inspiration" />
          <Route element={<WorkspacePlannedPage />} path="/templates" />
          <Route element={<WorkspacePlannedPage />} path="/publish" />
          <Route element={<WorkspacePlannedPage />} path="/history" />
          <Route element={<CanvasPage />} path="/projects/:projectId/canvas" />
          <Route element={<TextStudioPage />} path="/projects/:projectId/text/:artifactId" />
          <Route element={<ImageStudioPage />} path="/projects/:projectId/image/:artifactId" />
          <Route element={<NotFoundPage />} path="*" />
        </Route>
      </Routes>
    </Suspense>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <RoutedWorkspace />
    </BrowserRouter>
  )
}
