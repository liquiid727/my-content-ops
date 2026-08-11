// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ArtifactDetail, Run } from '@creator-studio/contracts'
import '../../modules/i18n'
import { resetApiClientForTests } from '../../shared/api/api-client'
import { useRunStore } from '../runtime/run-store'
import { PublishDialog } from './publish-dialog'

const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAC'
const ARTIFACT_ID = '01ARZ3NDEKTSV4RRFFQ69G5F02'
const RUN_ID = '01ARZ3NDEKTSV4RRFFQ69G5F10'
const TASK_ID = '01ARZ3NDEKTSV4RRFFQ69G5F11'
const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY'

const scriptArtifact: ArtifactDetail = {
  id: ARTIFACT_ID,
  projectId: PROJECT_ID,
  kind: 'text',
  role: 'script',
  currentVersionId: null,
  revision: 1,
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  currentVersion: null,
}

const completedRun: Run = {
  id: RUN_ID,
  projectId: PROJECT_ID,
  taskId: TASK_ID,
  operationId: 'publish',
  sourceArtifactId: ARTIFACT_ID,
  inputVersionIds: [],
  outputVersionIds: [],
  outputArtifactIds: [],
  status: 'completed',
  progress: 100,
  config: { mode: 'publish', platform: 'douyin' },
  error: null,
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function graphEnvelope() {
  return {
    data: {
      nodes: [
        { id: '01ARZ3NDEKTSV4RRFFQ69G5F03', projectId: PROJECT_ID, artifactId: ARTIFACT_ID, x: 0, y: 0, width: null, height: null, collapsed: false, zIndex: 0, renderer: 'TextNode', updatedAt: '2026-08-11T00:00:00.000Z' },
      ],
      edges: [],
    },
    meta: { requestId: REQUEST_ID },
  }
}

function artifactEnvelope() {
  return { data: scriptArtifact, meta: { requestId: REQUEST_ID } }
}

function runEnvelope(run: Run) {
  return { data: run, meta: { requestId: REQUEST_ID } }
}

beforeEach(() => {
  resetApiClientForTests()
  useRunStore.setState({ byId: {}, activeByProject: {}, runByArtifact: {} })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PublishDialog', () => {
  it('opens, finds the script target, and triggers a publish run with no content artifact', async () => {
    let publishPostSeen = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith(`/projects/${PROJECT_ID}/graph`)) return json(graphEnvelope())
      if (url.endsWith(`/artifacts/${ARTIFACT_ID}`)) return json(artifactEnvelope())
      if (url.endsWith('/operations/publish/runs') && init?.method === 'POST') {
        publishPostSeen = true
        const body = JSON.parse(init.body as string) as { sourceArtifactId?: string; config?: { mode?: string; platform?: string } }
        expect(body.sourceArtifactId).toBe(ARTIFACT_ID)
        expect(body.config?.mode).toBe('publish')
        return json({ data: { runId: RUN_ID, taskId: TASK_ID, status: 'queued' }, meta: { requestId: REQUEST_ID } }, 202)
      }
      if (url.endsWith(`/runs/${RUN_ID}`)) return json(runEnvelope(completedRun))
      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<PublishDialog projectId={PROJECT_ID} />)
    fireEvent.click(screen.getByRole('button', { name: '发布' }))

    await waitFor(() => {
      expect(screen.getByTestId('publish-target').textContent).toContain('口播稿')
    })

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '发布' }))

    await waitFor(() => {
      expect(publishPostSeen).toBe(true)
      expect(within(screen.getByRole('dialog')).getByText('发布完成')).toBeTruthy()
    })
  })

  it('shows an empty hint when no publishable script/video node exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith(`/projects/${PROJECT_ID}/graph`)) {
        return json({ data: { nodes: [], edges: [] }, meta: { requestId: REQUEST_ID } })
      }
      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<PublishDialog projectId={PROJECT_ID} />)
    fireEvent.click(screen.getByRole('button', { name: '发布' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('还没有可发布')
    })

    const publishButton = within(screen.getByRole('dialog')).getByRole('button', { name: '发布' })
    expect((publishButton as HTMLButtonElement).disabled).toBe(true)
  })
})
