/**
 * Player intents. The UI never changes game state itself: it calls one of these, the
 * authority (the Colyseus room, or the offline stand-in) validates it, and the result
 * comes back as an updated profile or an event (see net/events.js).
 */

let transport = null

/** Installs the active connection: `{ send(type, payload) }`. */
export function setTransport(next) {
  transport = next
}

export function send(type, payload) {
  if (!transport) return
  transport.send(type, payload)
}

export const actions = {
  /**
   * Reached checkpoint `index` (1..N); `splitMs` = time since the previous one;
   * `totalMs` = the whole run, sent at the finish (records the best finish time).
   */
  checkpoint: (index, splitMs, totalMs) =>
    send('checkpoint', { index, splitMs: Math.round(splitMs), ...(totalMs ? { totalMs: Math.round(totalMs) } : {}) }),
  /** Drove through coin `id` (shared stage coin id). */
  coin: (id) => send('coin', { id }),
  /** Found Sky Pearl `index` (shared/adventure.js); the server makes it permanent. */
  pearl: (index) => send('pearl', { index }),
  /** Opened treasure chest `id` (once per run). */
  chest: (id) => send('chest', { id }),
  /** Landed a trick worth `score` points. kind: 'frontflip' | 'backflip' | 'barrel' | 'spin' | 'air' | 'drift' | 'landing' | 'rings'. */
  trick: (kind, score) => send('trick', { kind, score: Math.round(score) }),
  /** Fell off / splashed (stats only). */
  fell: () => send('fell'),
  /** Back to the lobby: the run starts over from checkpoint 0. */
  restart: () => send('restart'),
  /** Spins for a random car with coins. */
  spin: () => send('spin'),
  equipCar: (id) => send('equipCar', { id }),
  /** Buys the next item slot with coins. */
  unlockSlot: () => send('unlockSlot'),
  setSetting: (key, value) => send('setting', { key, value }),
  /** Buys a store product (see shared/balance.js PRODUCTS). */
  purchase: (productId) => send('purchase', { productId }),
  /** Buys a paint or nitro colour with coins and puts it on (shared/cosmetics.js). kind: 'paint' | 'nitro'. */
  buyCosmetic: (kind, id) => send('buyCosmetic', { kind, id }),
  /** Puts on a paint or nitro colour you own. */
  equipCosmetic: (kind, id) => send('equipCosmetic', { kind, id }),
  /**
   * Our car rammed another player's (`to` = their sessionId) on the road: `imp` is the
   * throw for their car (m/s, shared/bump.js), `closing` the closing speed. The room
   * checks it (both there, close, not in a safe zone, rate, size) and forwards it.
   */
  bump: (to, imp, closing) =>
    send('bump', { to, x: Math.round(imp.x * 100) / 100, y: Math.round(imp.y * 100) / 100, z: Math.round(imp.z * 100) / 100, v: Math.round(closing * 10) / 10 }),
  /**
   * Fired a Rocket Missile, homing on player `to` (sessionId, '' for none): the room checks the
   * rate and where we are, and tells the cars nearby (shared/missile.js).
   */
  missile: (to) => send('missile', { to }),
  /** Our missile reached player `to`: the room checks it against that shot and burns them. */
  missileHit: (to) => send('missileHit', { to }),
  /** We were burned by `from`'s missile (ok) or our Bubble Shield blocked it (not ok). */
  missileAck: (from, ok) => send('missileAck', { from, ok }),
  /** A rewarded ad Boxity says was watched; the server verifies the token. */
  adReward: (placement, rewardToken) => send('adReward', { placement, rewardToken }),
}
