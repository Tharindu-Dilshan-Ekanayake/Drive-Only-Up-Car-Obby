/**
 * Car-to-car bumps on the road (outside the safe zones, see safeZones.js): the car that
 * rams another throws it - away from the impact, the way the rammer was going, and up -
 * by an amount set by how fast they closed. A gentle touch is a shove, a fast ram
 * throws it off the road. The rammer feels a smaller reaction (BUMP_REACT).
 *
 * Shared so the client that detects a hit, the client that gets thrown and the room
 * that validates the 'bump' message in between all use the same numbers.
 */

/** Closing speed (m/s, along the contact normal) below which cars just nudge apart. */
export const BUMP_MIN_SPEED = 2.5
/** Horizontal throw: BUMP_BASE + closing * BUMP_GAIN, at most BUMP_MAX_PUSH (m/s). */
export const BUMP_BASE = 2
export const BUMP_GAIN = 0.8
export const BUMP_MAX_PUSH = 28
/** Lift: (closing - BUMP_LIFT_FROM) * BUMP_LIFT_GAIN, at most BUMP_MAX_LIFT (m/s). */
export const BUMP_LIFT_FROM = 6
export const BUMP_LIFT_GAIN = 0.4
export const BUMP_MAX_LIFT = 11
/** How much of its closing speed the rammer loses. */
export const BUMP_REACT = 0.35
/** The throw goes this much the way the rammer was driving (the rest straight away from it). */
export const BUMP_FOLLOW = 0.4
/** At most one bump per pair of cars this often (ms), on the client and the server. */
export const BUMP_COOLDOWN_MS = 500

/**
 * The velocity change (m/s, world) thrown at the car that was hit.
 * @param {number} closing closing speed along the contact normal (m/s, >= 0)
 * @param {number} awayX horizontal direction from the rammer to the car hit (any length)
 * @param {number} awayZ
 * @param {number} rammerVx the rammer's horizontal velocity (m/s), for "the way it was going"
 * @param {number} rammerVz
 * @param {{ x: number, y: number, z: number }} out written and returned (no allocation)
 */
export function bumpImpulse(closing, awayX, awayZ, rammerVx, rammerVz, out) {
  const c = Math.max(0, closing)
  const push = Math.min(BUMP_MAX_PUSH, BUMP_BASE + c * BUMP_GAIN)
  const lift = Math.min(BUMP_MAX_LIFT, Math.max(0, (c - BUMP_LIFT_FROM) * BUMP_LIFT_GAIN))
  let ax = awayX
  let az = awayZ
  const al = Math.hypot(ax, az)
  if (al > 1e-6) {
    ax /= al
    az /= al
  } else {
    ax = 0
    az = -1
  }
  // Lean the throw towards where the rammer was heading, but never back towards it.
  const vl = Math.hypot(rammerVx, rammerVz)
  if (vl > 1) {
    const vx = rammerVx / vl
    const vz = rammerVz / vl
    if (vx * ax + vz * az > 0) {
      ax = ax * (1 - BUMP_FOLLOW) + vx * BUMP_FOLLOW
      az = az * (1 - BUMP_FOLLOW) + vz * BUMP_FOLLOW
      const l = Math.hypot(ax, az) || 1
      ax /= l
      az /= l
    }
  }
  out.x = ax * push
  out.y = lift
  out.z = az * push
  return out
}

/**
 * Makes a bump impulse someone sent safe to apply: finite, horizontal part at most
 * `maxPush`, lift within 0..BUMP_MAX_LIFT. Returns false if it can't be used at all.
 * @param {{ x: number, y: number, z: number }} imp changed in place
 */
export function clampBump(imp, maxPush = BUMP_MAX_PUSH) {
  let x = Number(imp?.x)
  let y = Number(imp?.y)
  let z = Number(imp?.z)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false
  const h = Math.hypot(x, z)
  const cap = Math.max(0, Math.min(maxPush, BUMP_MAX_PUSH))
  if (h > cap) {
    x *= cap / h
    z *= cap / h
  }
  y = Math.max(0, Math.min(BUMP_MAX_LIFT, y))
  imp.x = x
  imp.y = y
  imp.z = z
  return true
}

/** The biggest horizontal throw a closing speed of `closing` m/s can produce. */
export const maxPushFor = (closing) => Math.min(BUMP_MAX_PUSH, BUMP_BASE + Math.max(0, closing) * BUMP_GAIN)

/** The biggest lift a closing speed of `closing` m/s can produce. */
export const maxLiftFor = (closing) => Math.min(BUMP_MAX_LIFT, Math.max(0, (Math.max(0, closing) - BUMP_LIFT_FROM) * BUMP_LIFT_GAIN))

// --- Respawn protection -------------------------------------------------------------

/**
 * After a respawn a car can't bump or be bumped for this long (ms), counted from when it
 * leaves the safe zone it respawned in (respawns land in safe zones - a checkpoint plaza
 * or the lobby - so a plain timer would run out before it reached the road).
 */
export const RESPAWN_GHOST_MS = 3000
/** A jump between two position reports longer than this (m) is a respawn or teleport. */
export const TELEPORT_JUMP = 40

/** Starts respawn protection on `p` (`{ pending, until }`, mutated). */
export function startRespawnGhost(p, now) {
  p.pending = true
  p.until = now + RESPAWN_GHOST_MS
}

/**
 * Advances respawn protection `p` (`{ pending, until }`, mutated) given whether the car
 * is in a safe zone now. True while the car is protected.
 */
export function respawnGhost(p, inZone, now) {
  if (p.pending) {
    if (inZone) p.until = now + RESPAWN_GHOST_MS
    else if (now >= p.until) p.pending = false
  }
  return now < p.until
}
