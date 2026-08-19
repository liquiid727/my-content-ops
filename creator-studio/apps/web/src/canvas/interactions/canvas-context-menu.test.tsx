// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import '../../modules/i18n'
import { CanvasContextMenu, type CanvasContextMenuState } from './canvas-context-menu'

function baseProps(overrides: Partial<Parameters<typeof CanvasContextMenu>[0]> = {}) {
  return {
    menu: null as CanvasContextMenuState | null,
    onClose: vi.fn(),
    onAddNode: vi.fn(),
    onPaste: vi.fn(),
    onCopy: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onFitView: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canPaste: true,
    canUndo: true,
    canRedo: true,
    ...overrides,
  }
}

const paneMenu: CanvasContextMenuState = { x: 40, y: 40, nodeId: null, flowPosition: { x: 40, y: 40 } }
const nodeMenu: CanvasContextMenuState = { x: 40, y: 40, nodeId: 'node-1', flowPosition: { x: 40, y: 40 } }

afterEach(cleanup)

describe('CanvasContextMenu', () => {
  it('renders nothing when closed', () => {
    render(<CanvasContextMenu {...baseProps()} />)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('shows canvas actions and disables undo/redo/paste based on flags', () => {
    render(<CanvasContextMenu {...baseProps({ menu: paneMenu, canPaste: false, canUndo: false, canRedo: false })} />)
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '新建节点' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '适应视图' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '撤销' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('menuitem', { name: '重做' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('menuitem', { name: '粘贴' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('runs the add-node action from the pane menu', () => {
    const props = baseProps({ menu: paneMenu })
    render(<CanvasContextMenu {...props} />)
    fireEvent.click(screen.getByRole('menuitem', { name: '新建节点' }))
    expect(props.onAddNode).toHaveBeenCalledTimes(1)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('shows node actions and deletes the right-clicked node', () => {
    const props = baseProps({ menu: nodeMenu })
    render(<CanvasContextMenu {...props} />)
    expect(screen.queryByRole('menuitem', { name: '新建节点' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: '复制' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '复制副本' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }))
    expect(props.onDelete).toHaveBeenCalledTimes(1)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and on backdrop click', () => {
    const props = baseProps({ menu: paneMenu })
    const { container } = render(<CanvasContextMenu {...props} />)
    fireEvent.keyDown(container.querySelector('[role="menu"]')!, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
    const backdrop = container.firstElementChild as HTMLElement
    expect(backdrop.className).toContain('fixed')
    fireEvent.click(backdrop)
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })
})
