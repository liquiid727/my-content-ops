// @vitest-environment jsdom

import type { OperationDefinition } from '@creator-studio/contracts'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetApiClientForTests } from '../../shared/api/api-client'
import { useCanvasStore } from '../store/canvas-store'
import '../../modules/i18n'
import { useInspectorStore } from './inspector-store'
import { OperationActions } from './operation-actions'

const PROJECT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAC'
const ARTIFACT_ID = '01ARZ3NDEKTSV4RRFFQ69G5F02'
const REQUEST_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY'

function operation(id: string, label: string, placement: 'primary' | 'secondary', priority: number, danger = false): OperationDefinition {
  return {
    id,
    label,
    description: `${label} 描述`,
    behavior: 'create',
    input: { roles: ['topic'] },
    output: { kind: 'text', role: 'outline', behavior: 'new_artifact' },
    executor: `operation.${id}`,
    defaultConfig: {},
    presentation: { group: 'generate', priority, placement, danger },
    runtime: { retryable: true },
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  resetApiClientForTests()
  useCanvasStore.setState({ projectId: PROJECT_ID })
  useInspectorStore.setState({
    operations: [
      operation('generate_outline', '生成大纲', 'primary', 10),
      operation('polish', '润色', 'secondary', 20),
      operation('publish', '发布', 'primary', 100, true),
    ],
    operationsLoading: false,
    operationsError: null,
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('OperationActions', () => {
  it('renders actions grouped by registry presentation.group', () => {
    render(<OperationActions artifactId={ARTIFACT_ID} />)
    expect(screen.getByText('继续创作')).toBeTruthy()
    expect(screen.getByRole('button', { name: '生成大纲' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '润色' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '发布' })).toBeTruthy()
  })

  it('creates a run when a primary action is clicked', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/operations/generate_outline/runs') && init?.method === 'POST') {
        return json({ data: { runId: '01ARZ3NDEKTSV4RRFFQ69G5F10', taskId: '01ARZ3NDEKTSV4RRFFQ69G5F11', status: 'queued' }, meta: { requestId: REQUEST_ID } }, 202)
      }
      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<OperationActions artifactId={ARTIFACT_ID} />)
    fireEvent.click(screen.getByRole('button', { name: '生成大纲' }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/operations/generate_outline/runs'))).toBe(true)
    })
  })
})
