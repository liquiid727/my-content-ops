import { useEffect, useRef } from 'react'

export function AmbientField() {
  const fieldRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(pointer: coarse)').matches) return
    const field = fieldRef.current
    if (!field) return
    let frame = 0
    let x = window.innerWidth * 0.62
    let y = window.innerHeight * 0.38
    const move = (event: PointerEvent) => {
      x = event.clientX
      y = event.clientY
      if (frame) return
      frame = requestAnimationFrame(() => {
        field.style.setProperty('--pointer-x', `${x}px`)
        field.style.setProperty('--pointer-y', `${y}px`)
        frame = 0
      })
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden" ref={fieldRef}>
      <div
        className="studio-ambient-breathe absolute inset-0 opacity-60"
        style={{
          background: 'radial-gradient(34rem circle at var(--pointer-x, 62%) var(--pointer-y, 38%), hsl(var(--ambient-primary) / .13), transparent 62%), radial-gradient(28rem circle at 82% 12%, hsl(var(--ambient-secondary) / .09), transparent 70%)',
        }}
      />
      <div className="studio-noise absolute inset-0 opacity-[0.025] dark:opacity-[0.045]" />
    </div>
  )
}
