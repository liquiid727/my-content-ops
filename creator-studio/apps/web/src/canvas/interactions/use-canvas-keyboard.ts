import { useEffect } from 'react'

export interface CanvasKeyboardActions {
  fitView: () => void
  undo: () => void
  redo: () => void
  copy: () => void
  paste: () => void
  duplicate: () => void
}

/**
 * 画布键盘快捷键（05-canvas-ui §4 / 来源 §53）。
 * React Flow 原生已覆盖：Space+拖拽 Pan、Wheel Zoom、Delete 删除、Esc 取消选中、
 * Cmd/Ctrl+多选、方向键微调焦点节点。这里补充自定义快捷键：
 *  - F 适应视图
 *  - Cmd/Ctrl+Z 撤销，Cmd/Ctrl+Shift+Z / Cmd/Ctrl+Y 重做
 *  - Cmd/Ctrl+C 复制，Cmd/Ctrl+V 粘贴，Cmd/Ctrl+D 复制副本
 */
export function useCanvasKeyboard(actions: CanvasKeyboardActions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 输入框 / 编辑器 / 对话框内不拦截。
      const target = event.target as HTMLElement | null
      if (!target || target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (key === 'z' && mod) {
        event.preventDefault()
        if (event.shiftKey) actions.redo()
        else actions.undo()
        return
      }
      if (key === 'y' && mod) {
        event.preventDefault()
        actions.redo()
        return
      }
      if (key === 'c' && mod) {
        event.preventDefault()
        actions.copy()
        return
      }
      if (key === 'v' && mod) {
        event.preventDefault()
        actions.paste()
        return
      }
      if (key === 'd' && mod) {
        event.preventDefault()
        actions.duplicate()
        return
      }
      if (key === 'f' && !mod && !event.altKey) {
        event.preventDefault()
        actions.fitView()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [actions])
}
