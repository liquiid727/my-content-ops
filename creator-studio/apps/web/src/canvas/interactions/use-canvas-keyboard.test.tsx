// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCanvasKeyboard, type CanvasKeyboardActions } from './use-canvas-keyboard'

function makeActions(overrides: Partial<CanvasKeyboardActions> = {}): CanvasKeyboardActions {
  return {
    fitView: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    duplicate: vi.fn(),
    ...overrides,
  }
}

function dispatchKey(key: string, options: { target?: HTMLElement; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}): void {
  const target = options.target ?? document.body
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      ctrlKey: options.ctrlKey ?? false,
      metaKey: options.metaKey ?? false,
      shiftKey: options.shiftKey ?? false,
      bubbles: true,
      cancelable: true,
    }),
  )
}

describe('useCanvasKeyboard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls fitView on plain "f" keydown', () => {
    const actions = makeActions()
    renderHook(() => useCanvasKeyboard(actions))
    dispatchKey('f')
    expect(actions.fitView).toHaveBeenCalledTimes(1)
  })

  it('ignores "f" when modifier keys are held', () => {
    const actions = makeActions()
    renderHook(() => useCanvasKeyboard(actions))
    dispatchKey('f', { ctrlKey: true })
    expect(actions.fitView).not.toHaveBeenCalled()
  })

  it('ignores "f" when typing in an input (no shortcut interception)', () => {
    const actions = makeActions()
    renderHook(() => useCanvasKeyboard(actions))
    const input = document.createElement('input')
    document.body.appendChild(input)
    try {
      dispatchKey('f', { target: input })
      expect(actions.fitView).not.toHaveBeenCalled()
    } finally {
      input.remove()
    }
  })

  it('maps Cmd+Z / Ctrl+Z to undo and Cmd+Shift+Z / Cmd+Y to redo', () => {
    const actions = makeActions()
    renderHook(() => useCanvasKeyboard(actions))
    dispatchKey('z', { metaKey: true })
    expect(actions.undo).toHaveBeenCalledTimes(1)
    dispatchKey('z', { ctrlKey: true, shiftKey: true })
    expect(actions.redo).toHaveBeenCalledTimes(1)
    dispatchKey('y', { metaKey: true })
    expect(actions.redo).toHaveBeenCalledTimes(2)
  })

  it('maps Cmd+C / Cmd+V / Cmd+D to copy / paste / duplicate', () => {
    const actions = makeActions()
    renderHook(() => useCanvasKeyboard(actions))
    dispatchKey('c', { metaKey: true })
    expect(actions.copy).toHaveBeenCalledTimes(1)
    dispatchKey('v', { metaKey: true })
    expect(actions.paste).toHaveBeenCalledTimes(1)
    dispatchKey('d', { ctrlKey: true })
    expect(actions.duplicate).toHaveBeenCalledTimes(1)
  })

  it('ignores Cmd+C/V when typing in a contenteditable', () => {
    const actions = makeActions()
    renderHook(() => useCanvasKeyboard(actions))
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    document.body.appendChild(editable)
    try {
      dispatchKey('c', { target: editable, metaKey: true })
      dispatchKey('v', { target: editable, metaKey: true })
      expect(actions.copy).not.toHaveBeenCalled()
      expect(actions.paste).not.toHaveBeenCalled()
    } finally {
      editable.remove()
    }
  })
})
