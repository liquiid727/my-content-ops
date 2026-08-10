// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { RouteErrorBoundary, RouteSkeleton } from './route-boundary'

afterEach(cleanup)

function BrokenRoute(): ReactElement {
  throw new Error('route chunk failed')
}

describe('route loading and recovery states', () => {
  it('renders an accessible Skeleton while a route is loading', () => {
    render(<RouteSkeleton />)

    expect(screen.getByRole('status', { name: '正在加载页面' })).toBeTruthy()
    expect(screen.getByText('正在加载路由')).toBeTruthy()
  })

  it('offers a Dashboard recovery action when route rendering fails', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <BrokenRoute />
        </RouteErrorBoundary>
      </MemoryRouter>,
    )

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('link', { name: '返回概览' }).getAttribute('href')).toBe('/')
    consoleError.mockRestore()
  })
})
