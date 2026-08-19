import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

interface WorkspaceTabsState {
  openProjectIds: string[]
  activeProjectId: string | undefined
  lastRouteByProject: Record<string, string>
  openProject: (projectId: string, route?: string) => void
  activateProject: (projectId: string) => void
  closeProject: (projectId: string) => string | undefined
  rememberProjectRoute: (projectId: string, route: string) => void
  reconcileProjects: (projectIds: string[]) => void
}

const safeBrowserStorage: StateStorage = {
  getItem: (name) => {
    try { return typeof window.localStorage?.getItem === 'function' ? window.localStorage.getItem(name) : null } catch { return null }
  },
  setItem: (name, value) => {
    try { if (typeof window.localStorage?.setItem === 'function') window.localStorage.setItem(name, value) } catch { /* persistence is best-effort */ }
  },
  removeItem: (name) => {
    try { if (typeof window.localStorage?.removeItem === 'function') window.localStorage.removeItem(name) } catch { /* persistence is best-effort */ }
  },
}

const storage = createJSONStorage(() => safeBrowserStorage)

export const useWorkspaceTabsStore = create<WorkspaceTabsState>()(
  persist(
    (set, get) => ({
      openProjectIds: [],
      activeProjectId: undefined,
      lastRouteByProject: {},
      openProject: (projectId, route) => set((state) => ({
        openProjectIds: state.openProjectIds.includes(projectId) ? state.openProjectIds : [...state.openProjectIds, projectId],
        activeProjectId: projectId,
        lastRouteByProject: route ? { ...state.lastRouteByProject, [projectId]: route } : state.lastRouteByProject,
      })),
      activateProject: (projectId) => set((state) => ({
        activeProjectId: projectId,
        openProjectIds: state.openProjectIds.includes(projectId) ? state.openProjectIds : [...state.openProjectIds, projectId],
      })),
      closeProject: (projectId) => {
        const state = get()
        const index = state.openProjectIds.indexOf(projectId)
        const nextIds = state.openProjectIds.filter((id) => id !== projectId)
        const nextActive = state.activeProjectId === projectId
          ? nextIds[Math.min(Math.max(index, 0), nextIds.length - 1)]
          : state.activeProjectId
        const lastRouteByProject = Object.fromEntries(Object.entries(state.lastRouteByProject).filter(([id]) => id !== projectId))
        set({ openProjectIds: nextIds, activeProjectId: nextActive, lastRouteByProject })
        return nextActive
      },
      rememberProjectRoute: (projectId, route) => set((state) => ({
        lastRouteByProject: { ...state.lastRouteByProject, [projectId]: route },
      })),
      reconcileProjects: (projectIds) => set((state) => {
        const allowed = new Set(projectIds)
        const openProjectIds = state.openProjectIds.filter((id) => allowed.has(id))
        const activeProjectId = state.activeProjectId && allowed.has(state.activeProjectId)
          ? state.activeProjectId
          : openProjectIds[0]
        const lastRouteByProject = Object.fromEntries(
          Object.entries(state.lastRouteByProject).filter(([id]) => allowed.has(id)),
        )
        return { openProjectIds, activeProjectId, lastRouteByProject }
      }),
    }),
    {
      name: 'creator-studio-workspace-tabs:v1',
      storage,
      partialize: ({ openProjectIds, activeProjectId, lastRouteByProject }) => ({ openProjectIds, activeProjectId, lastRouteByProject }),
    },
  ),
)

export function resetWorkspaceTabsStoreForTests(): void {
  useWorkspaceTabsStore.setState({ openProjectIds: [], activeProjectId: undefined, lastRouteByProject: {} })
}
