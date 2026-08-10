// jsdom gaps that Radix UI (Select/Popper/DismissableLayer) relies on.
// setupFiles run in every environment (node for server/contracts tests, jsdom for web
// tests), so every polyfill is guarded to stay inert where the API already exists.
const noop = () => undefined

if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = noop
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = noop
  Element.prototype.releasePointerCapture = noop
}

if (typeof globalThis.PointerEvent === 'undefined' && typeof MouseEvent !== 'undefined') {
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {} as unknown as typeof PointerEvent
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
