/**
 * Safe zones: the lobby pier and every checkpoint plaza. Cars pass through each other
 * there (no car-to-car collisions, no bumps), on the client and in the room's bump
 * validation alike. Pure functions of the stage data - the plaza sizes come from each
 * checkpoint (`length`, `width`, gate position, `yaw` or `forward`), never hard-coded,
 * so bigger plazas are picked up automatically.
 */

import { inLobby } from './lobby.js'
import { stageInfo } from './stages/index.js'

/** Metres of slack around a plaza's slab (its gate, the curb, a car half on the edge). */
export const PLAZA_MARGIN = 2
/** A car this far below / above the plaza deck still counts as on it (jumping, landing). */
export const PLAZA_BELOW = 3
export const PLAZA_ABOVE = 10

/** stage -> its plaza rectangles (built once per stage object). */
const cache = new WeakMap()

/**
 * The plaza rectangle of each checkpoint that has one (the Start has none: it is the
 * lobby's edge): centre, horizontal forward/right unit axes, half sizes, deck height.
 */
export function plazaZones(stage) {
  // No stage loaded yet (the client, still in the lobby): no plazas.
  if (!stage) return []
  let zones = cache.get(stage)
  if (zones) return zones
  zones = []
  for (const cp of stage?.checkpoints || []) {
    const length = Number(cp.length)
    const width = Number(cp.width)
    if (!(length > 0) || !(width > 0)) continue
    let fx
    let fz
    if (cp.forward) {
      fx = Array.isArray(cp.forward) ? cp.forward[0] : cp.forward.x
      fz = Array.isArray(cp.forward) ? cp.forward[2] : cp.forward.z
    } else {
      // shared/track.js forwardOf(yaw): yaw 0 faces -Z.
      fx = -Math.sin(cp.yaw || 0)
      fz = -Math.cos(cp.yaw || 0)
    }
    const fl = Math.hypot(fx, fz) || 1
    fx /= fl
    fz /= fl
    zones.push({
      index: cp.index,
      // The plaza runs `length` metres on from the gate, `width` across it.
      x: cp.x + fx * (length / 2),
      z: cp.z + fz * (length / 2),
      y: cp.y,
      fx,
      fz,
      halfLength: length / 2 + PLAZA_MARGIN,
      halfWidth: width / 2 + PLAZA_MARGIN,
    })
  }
  cache.set(stage, zones)
  return zones
}

/** The plaza (zone object) containing (x, y, z), or null. */
export function plazaAt(stage, x, y, z) {
  const zones = plazaZones(stage)
  for (let i = 0; i < zones.length; i += 1) {
    const p = zones[i]
    const dy = y - p.y
    if (dy < -PLAZA_BELOW || dy > PLAZA_ABOVE) continue
    const dx = x - p.x
    const dz = z - p.z
    // Along the plaza (forward), then across it (the horizontal perpendicular).
    if (Math.abs(dx * p.fx + dz * p.fz) > p.halfLength) continue
    if (Math.abs(dx * p.fz - dz * p.fx) > p.halfWidth) continue
    return p
  }
  return null
}

/** Is (x, y, z) in a safe zone: on the lobby pier or on a checkpoint plaza of `stage` (null: the pier only)? */
export function inSafeZone(stage, x, y, z) {
  return inLobby(x, y, z) || plazaAt(stage, x, y, z) !== null
}

/**
 * Whether players' cars bump each other on `stage` (anywhere outside the safe zones). A
 * map whose registry entry says `pvp: false` (Heat Run, ./stages/heatRun.meta.js) has
 * no player-vs-player bumps at all: other players are always ghosts there, on the client
 * and in the room's bump check. (null: the pier only - the usual rules.)
 */
export function pvpEnabled(stage) {
  return stageInfo(stage?.id)?.pvp !== false
}
