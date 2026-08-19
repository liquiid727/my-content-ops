import { beforeEach, describe, expect, it } from 'vitest'

import { resetWorkspaceTabsStoreForTests, useWorkspaceTabsStore } from './workspace-tabs-store'

describe('workspace tabs store', () => {
  beforeEach(() => resetWorkspaceTabsStoreForTests())

  it('opens projects once and remembers their latest route', () => {
    const store = useWorkspaceTabsStore.getState()
    store.openProject('project-a', '/projects/project-a/overview')
    useWorkspaceTabsStore.getState().openProject('project-a', '/projects/project-a/canvas')
    useWorkspaceTabsStore.getState().openProject('project-b')

    expect(useWorkspaceTabsStore.getState()).toMatchObject({
      openProjectIds: ['project-a', 'project-b'],
      activeProjectId: 'project-b',
      lastRouteByProject: { 'project-a': '/projects/project-a/canvas' },
    })
  })

  it('selects the adjacent project when the active tab closes', () => {
    useWorkspaceTabsStore.getState().openProject('project-a')
    useWorkspaceTabsStore.getState().openProject('project-b')
    useWorkspaceTabsStore.getState().openProject('project-c')

    expect(useWorkspaceTabsStore.getState().closeProject('project-b')).toBe('project-c')
    expect(useWorkspaceTabsStore.getState()).toMatchObject({ openProjectIds: ['project-a', 'project-c'], activeProjectId: 'project-c' })
  })

  it('removes archived or missing projects during reconciliation', () => {
    useWorkspaceTabsStore.getState().openProject('project-a', '/projects/project-a/canvas')
    useWorkspaceTabsStore.getState().openProject('project-b', '/projects/project-b/overview')
    useWorkspaceTabsStore.getState().reconcileProjects(['project-a'])

    expect(useWorkspaceTabsStore.getState()).toMatchObject({
      openProjectIds: ['project-a'],
      activeProjectId: 'project-a',
      lastRouteByProject: { 'project-a': '/projects/project-a/canvas' },
    })
  })
})
