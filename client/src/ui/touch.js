/** True on touch-first devices (phones, tablets): on-screen driving controls show. */
export function isTouchDevice() {
  if (typeof window === 'undefined') return false
  return Boolean(window.matchMedia?.('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0
}

export const IS_TOUCH = isTouchDevice()
