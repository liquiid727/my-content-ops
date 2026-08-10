import type { CreateProject, Project, ProjectOverview, ProjectPatch, ProjectStatus } from '@creator-studio/contracts'
import { create } from 'zustand'

import { getLocalizedErrorMessage, i18n } from '../i18n'
import { projectApi } from './project-api'

interface ProjectState {
  projects: Project[]
  overviews: Record<string, ProjectOverview>
  nextCursor: string | undefined
  hasMore: boolean
  loading: boolean
  error: string | undefined
  loadProjects: (status?: ProjectStatus, cursor?: string) => Promise<void>
  createProject: (input: CreateProject, idempotencyKey: string, signal?: AbortSignal) => Promise<Project>
  loadOverview: (projectId: string) => Promise<ProjectOverview>
  updateProject: (projectId: string, revision: number, patch: ProjectPatch) => Promise<Project>
  archiveProject: (projectId: string, revision: number) => Promise<Project>
}

function errorMessage(error: unknown): string {
  return getLocalizedErrorMessage(error, i18n.t)
}

function replaceProject(projects: Project[], project: Project): Project[] {
  const exists = projects.some((item) => item.id === project.id)
  return exists ? projects.map((item) => item.id === project.id ? project : item) : [project, ...projects]
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  overviews: {},
  nextCursor: undefined,
  hasMore: false,
  loading: false,
  error: undefined,

  loadProjects: async (status, cursor) => {
    set({ loading: true, error: undefined })
    try {
      const response = await projectApi.list({
        ...(status ? { status } : {}),
        ...(cursor ? { cursor } : {}),
        limit: 30,
      })
      set((state) => ({
        projects: cursor ? [...state.projects, ...response.data] : response.data,
        hasMore: response.meta.hasMore,
        nextCursor: response.meta.nextCursor,
        loading: false,
      }))
    } catch (error) {
      set({ loading: false, error: errorMessage(error) })
    }
  },

  createProject: async (input, idempotencyKey, signal) => {
    const response = await projectApi.create(input, idempotencyKey, signal)
    set((state) => ({ projects: replaceProject(state.projects, response.data) }))
    return response.data
  },

  loadOverview: async (projectId) => {
    const response = await projectApi.overview(projectId)
    set((state) => ({
      overviews: { ...state.overviews, [projectId]: response.data },
      projects: replaceProject(state.projects, response.data.project),
    }))
    return response.data
  },

  updateProject: async (projectId, revision, patch) => {
    const response = await projectApi.update(projectId, revision, patch)
    set((state) => ({
      projects: replaceProject(state.projects, response.data),
      overviews: state.overviews[projectId]
        ? { ...state.overviews, [projectId]: { ...state.overviews[projectId], project: response.data } }
        : state.overviews,
    }))
    return response.data
  },

  archiveProject: async (projectId, revision) => {
    const response = await projectApi.archive(projectId, revision)
    set((state) => ({
      projects: state.projects.filter((project) => project.id !== projectId),
      overviews: state.overviews[projectId]
        ? { ...state.overviews, [projectId]: { ...state.overviews[projectId], project: response.data } }
        : state.overviews,
    }))
    return response.data
  },
}))

export const projectSelectors = {
  projects: (state: ProjectState) => state.projects,
  overview: (projectId: string) => (state: ProjectState) => state.overviews[projectId],
  loading: (state: ProjectState) => state.loading,
  error: (state: ProjectState) => state.error,
  hasMore: (state: ProjectState) => state.hasMore,
  nextCursor: (state: ProjectState) => state.nextCursor,
}
