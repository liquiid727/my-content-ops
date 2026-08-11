import { useEffect } from 'react'

/**
 * 画布键盘快捷键（05-canvas-ui §4 / 来源 §53）。
 * React Flow 原生已覆盖：Space+拖拽 Pan、Wheel Zoom、Delete 删除、Esc 取消选中、
 * Cmd/Ctrl+多选、方向键微调焦点节点。这里补充自定义快捷键。
 */
export function useCanvasKeyboard(fitView: () => void): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 输入框 / 编辑器 / 对话框内不拦截。
      const target = event.target as HTMLElement | null
      if (!target || target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      const key = event.key.toLowerCase()
      if (key === 'f' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        fitView()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [fitView])
}
