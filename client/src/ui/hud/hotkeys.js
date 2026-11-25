import { IS_TOUCH } from '../touch'

/**
 * The HUD's keyboard shortcuts (driving keys live in game/player/keyboard.js: WASD /
 * arrows, Shift nitro, Space handbrake, H horn, R respawn). Each HUD component installs
 * its own listener for its keys and uses `skipKey` so typing in a text box, key repeat
 * and browser shortcuts (Ctrl+R...) never trigger them.
 *
 * Keys are matched on `e.code` (the physical key), so they work on any layout.
 */

/** Key hints are drawn only where there is a keyboard to press them. */
export const SHOW_KEYS = !IS_TOUCH

/** Panel buttons: e.code -> panel id. */
export const PANEL_CODES = {
  KeyG: 'garage',
  KeyP: 'spin',
  KeyB: 'store',
  KeyK: 'leaderboards',
  KeyM: 'settings',
}

/** What each HUD control's key hint says. */
export const KEY_LABEL = {
  garage: 'G',
  spin: 'P',
  store: 'B',
  leaderboards: 'K',
  settings: 'M',
  respawn: 'R',
  lobby: 'L',
  nitro: 'SHIFT',
}

/** Item slots: Q / E / F (and the old 1 / 2 / 3, which still work). */
export const SLOT_LABELS = ['Q', 'E', 'F']
export const SLOT_CODES = {
  KeyQ: 0,
  Digit1: 0,
  Numpad1: 0,
  KeyE: 1,
  Digit2: 1,
  Numpad2: 1,
  KeyF: 2,
  Digit3: 2,
  Numpad3: 2,
}

const typing = (e) => e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))

/** True for key events a HUD shortcut must ignore. */
export function skipKey(e) {
  return e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e)
}
