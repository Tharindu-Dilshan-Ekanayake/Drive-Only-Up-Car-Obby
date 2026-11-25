import { runtime } from '../runtime'

/**
 * Keyboard driving. Writes runtime.input only when a key changes, so it coexists with
 * the touch controls (whichever was used last wins) instead of overwriting them every
 * frame. Item keys 1/2/3 and Enter belong to the HUD.
 *
 * W/S or arrows: throttle / brake-reverse (and pitch in the air), A/D: steer (spin in
 * the air), Shift: nitro, Space: handbrake (barrel roll in the air), R: respawn, H: horn.
 */
const BINDINGS = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'nitro',
  ShiftRight: 'nitro',
  Space: 'handbrake',
  KeyH: 'horn',
}

const held = new Set()

function apply() {
  const input = runtime.input
  input.throttle = held.has('up') ? 1 : 0
  input.brake = held.has('down') ? 1 : 0
  input.steer = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)
  input.nitro = held.has('nitro')
  input.handbrake = held.has('handbrake')
  input.horn = held.has('horn')
}

const typing = (e) => e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))

function onDown(e) {
  if (typing(e)) return
  if (e.code === 'KeyR' && !e.repeat) {
    runtime.input.respawn = true
    return
  }
  const action = BINDINGS[e.code]
  if (!action) return
  // Keep Space/arrows from scrolling the page.
  e.preventDefault()
  if (held.has(action)) return
  held.add(action)
  apply()
}

function onUp(e) {
  const action = BINDINGS[e.code]
  if (!action || !held.has(action)) return
  held.delete(action)
  apply()
}

function onBlur() {
  if (!held.size) return
  held.clear()
  apply()
}

/** Installs the listeners; returns the uninstaller. */
export function installKeyboard() {
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('blur', onBlur)
  return () => {
    window.removeEventListener('keydown', onDown)
    window.removeEventListener('keyup', onUp)
    window.removeEventListener('blur', onBlur)
    held.clear()
  }
}
