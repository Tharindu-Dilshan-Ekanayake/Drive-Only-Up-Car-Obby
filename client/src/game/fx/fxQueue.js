/**
 * Hand-off from events (network, physics callbacks, UI) to the particle system, which
 * drains it inside its frame loop. A plain bounded array, never state.
 */

const MAX_BURSTS = 16
const bursts = []

/**
 * Queues a burst at (x, y, z): `{ x, y, z, count, palette, speed }`. palette:
 * 'confetti' | 'gold' | 'item' | 'splash' | 'smoke' | 'spark' | 'flame' | 'soot'. Dropped on presets
 * without particles.
 */
export function burst(b) {
  bursts.push(b)
  if (bursts.length > MAX_BURSTS) bursts.shift()
}

export function drainBursts(handle) {
  while (bursts.length) handle(bursts.shift())
}

/** Preallocated bursts for `burstAt`: more than MAX_BURSTS, so one is never reused while still queued. */
const ring = Array.from({ length: MAX_BURSTS + 8 }, () => ({ x: 0, y: 0, z: 0, count: 0, palette: 'spark', speed: 6 }))
let ringAt = 0

/** `burst` without allocating (for effects that fire every few frames: flames, trails). */
export function burstAt(x, y, z, count, palette, speed) {
  const b = ring[ringAt]
  ringAt = (ringAt + 1) % ring.length
  b.x = x
  b.y = y
  b.z = z
  b.count = count
  b.palette = palette
  b.speed = speed
  burst(b)
}
