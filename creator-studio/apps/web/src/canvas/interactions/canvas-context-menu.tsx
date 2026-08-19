import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../shared/lib/cn'

export interface CanvasContextMenuState {
  x: number
  y: number
  nodeId: string | null
  flowPosition: { x: number; y: number }
}

interface CanvasContextMenuProps {
  menu: CanvasContextMenuState | null
  onClose: () => void
  onAddNode: () => void
  onPaste: () => void
  onCopy: () => void
  onDuplicate: () => void
  onDelete: () => void
  onFitView: () => void
  onUndo: () => void
  onRedo: () => void
  canPaste: boolean
  canUndo: boolean
  canRedo: boolean
}

interface MenuItem {
  key: string
  label: string
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
}

const MENU_WIDTH = 176

export function CanvasContextMenu({ menu, onClose, onAddNode, onPaste, onCopy, onDuplicate, onDelete, onFitView, onUndo, onRedo, canPaste, canUndo, canRedo }: CanvasContextMenuProps) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)

  const items: MenuItem[] = menu?.nodeId
    ? [
        { key: 'copy', label: t('canvas.copy'), onSelect: onCopy },
        { key: 'duplicate', label: t('canvas.duplicate'), onSelect: onDuplicate },
        { key: 'delete', label: t('canvas.deleteNode'), onSelect: onDelete, danger: true },
      ]
    : [
        { key: 'addNode', label: t('canvas.addNode'), onSelect: onAddNode },
        { key: 'paste', label: t('canvas.paste'), onSelect: onPaste, disabled: !canPaste },
        { key: 'fitView', label: t('canvas.fitView'), onSelect: onFitView },
        { key: 'undo', label: t('canvas.undo'), onSelect: onUndo, disabled: !canUndo },
        { key: 'redo', label: t('canvas.redo'), onSelect: onRedo, disabled: !canRedo },
      ]

  // 打开时聚焦第一个可用项；关闭后移除。
  useEffect(() => {
    if (!menu) return
    const container = menuRef.current
    if (!container) return
    const first = container.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
    first?.focus()
    return () => {
      container.querySelector<HTMLElement>('[role="menuitem"]')?.blur()
    }
  }, [menu])

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const container = menuRef.current
    if (!container) return
    const focusable = Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'))
    if (focusable.length === 0) return
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
    let nextIndex = currentIndex
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % focusable.length
    else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + focusable.length) % focusable.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = focusable.length - 1
    focusable[nextIndex]?.focus()
  }, [onClose])

  if (!menu) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        aria-label={menu.nodeId ? t('canvas.nodeContextMenu') : t('canvas.paneContextMenu')}
        className="fixed z-50 w-44 rounded-md border border-border bg-surface p-1 shadow-panel"
        onKeyDown={handleKeyDown}
        ref={menuRef}
        role="menu"
        style={{ left: Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8), top: Math.min(menu.y, window.innerHeight - items.length * 34 - 16) }}
      >
        {items.map((item, index) => (
          <button
            aria-disabled={item.disabled ?? false}
            className={cn(
              'flex min-h-8 w-full items-center gap-2 rounded px-2 text-left text-sm transition-colors',
              item.disabled ? 'cursor-not-allowed text-muted/50' : item.danger ? 'text-danger hover:bg-danger/10' : 'text-foreground hover:bg-elevated',
              index > 0 && item.key === 'fitView' ? 'mt-1 border-t border-border/60 pt-1' : '',
            )}
            key={item.key}
            onClick={() => {
              if (item.disabled) return
              item.onSelect()
              onClose()
            }}
            role="menuitem"
            tabIndex={-1}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}
