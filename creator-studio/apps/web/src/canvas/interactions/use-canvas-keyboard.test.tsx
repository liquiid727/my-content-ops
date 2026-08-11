// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCanvasKeyboard } from './use-canvas-keyboard'

function dispatchKey(key: string, options: { target?: HTMLElement; ctrlKey?: boolean } = {}): void {
  const target = options.target ?? document.body
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, ctrlKey: options.ctrlKey ?? false, bubbles: true, cancelable: true }),
  )
}

describe('useCanvasKeyboard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls fitView on plain "f" keydown', () => {
    const fitView = vi.fn()
    renderHook(() => useCanvasKeyboard(fitView))
    dispatchKey('f')
    expect(fitView).toHaveBeenCalledTimes(1)
  })

  it('ignores "f" when modifier keys are held', () => {
    const fitView = vi.fn()
    renderHook(() => useCanvasKeyboard(fitView))
    dispatchKey('f', { ctrlKey: true })
    expect(fitView).not.toHaveBeenCalled()
  })

  it('ignores "f" when typing in an input (no shortcut interception)', () => {
    const fitView = vi.fn()
    renderHook(() => useCanvasKeyboard(fitView))
    const input = document.createElement('input')
    document.body.appendChild(input)
    try {
      dispatchKey('f', { target: input })
      expect(fitView).not.toHaveBeenCalled()
    } finally {
      input.remove()
    }
  })
})
