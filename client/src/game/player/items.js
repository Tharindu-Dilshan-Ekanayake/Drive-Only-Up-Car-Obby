import { runtime } from '../runtime'

/**
 * Items you pick up from the item crates on the track (each crate holds one fixed item,
 * shared/crateItems.js: you choose by which crate of a row you drive through). Client-side only (they only
 * change how your own car behaves). The car controller applies them
 * (game/player/PlayerCar.jsx); the HUD shows them in the slots.
 */
export const ITEMS = {
  jump: { id: 'jump', name: 'Spring Jump', color: '#7cf25a', blurb: 'Hop straight up - over anything.' },
  turbo: { id: 'turbo', name: 'Turbo Can', color: '#ff7a1a', blurb: 'Full nitro and a big shove forwards.' },
  shield: { id: 'shield', name: 'Bubble Shield', color: '#5fe3ff', blurb: 'Nothing can knock you for 6 seconds.' },
  magnet: { id: 'magnet', name: 'Coin Magnet', color: '#ffcc2e', blurb: 'Pulls in coins around you for 8 seconds.' },
  anchor: { id: 'anchor', name: 'Heavy Anchor', color: '#8a96a3', blurb: 'Super grip and weight - no sliding for 6 seconds.' },
  glider: { id: 'glider', name: 'Gull Glider', color: '#f4f7fb', blurb: 'Float gently down instead of falling.' },
  missile: { id: 'missile', name: 'Missile', color: '#ff4a2a', blurb: 'Fire at a car ahead - or behind if nothing is ahead. A hit sets it ablaze.' },
}

export const ITEM_IDS = Object.keys(ITEMS)

/** Uses the item in `slot` (0-2). Called by the HUD slot buttons and the 1/2/3 keys. */
export function requestItem(slot) {
  runtime.input.useItem = slot
}
