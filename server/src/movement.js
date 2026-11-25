import { BUMP_MAX_LIFT, BUMP_MAX_PUSH } from '../../shared/bump.js'
import { SPAWN, START_RESPAWN } from '../../shared/lobby.js'

/**
 * Which position reports the room believes. Cars are fast and the track is vertical,
 * so the check is a 3D speed limit with room to spare (nitro, boost pads, falling) -
 * plus the legitimate teleports: respawning in the lobby or at a checkpoint. The
 * limits that depend on the map (highest point, respawn points) come from the room's
 * stage (`limitsFor`).
 */

/** Faster than any car with nitro, a boost pad and a long fall (m/s). */
export const MAX_CAR_SPEED = 95
/** Extra metres allowed on top, for jitter between reports. */
export const MOVE_SLACK = 6
export const MIN_Y = -60
/** Headroom over a stage's highest road (big jumps). */
export const ABOVE_TOP = 150

/**
 * A car another player's bump just threw (GameRoom.handleBump) may move up to this much
 * faster (m/s) for BUMP_GRACE_MS: the most a bump can add. Bounded and short-lived, so
 * it can't be farmed into a speed hack.
 */
export const BUMP_EXTRA_SPEED = BUMP_MAX_PUSH + BUMP_MAX_LIFT
export const BUMP_GRACE_MS = 2500

const SPAWN_RADIUS = 6
const RESPAWN_RADIUS = 8

/** stage -> { maxY, teleports } (worked out once per stage). */
const cache = new WeakMap()

/**
 * A stage's movement limits: `maxY`, the highest a car can legitimately be (its highest
 * road plus room for big jumps), and `teleports`, where a respawn may put you (the lobby
 * spawn and every checkpoint's respawn point).
 */
export function limitsFor(stage) {
  let l = cache.get(stage)
  if (!l) {
    let top = 0
    for (const p of stage.path) if (p.y > top) top = p.y
    l = {
      maxY: Math.ceil(top) + ABOVE_TOP,
      teleports: [
        { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z, r: SPAWN_RADIUS },
        { x: START_RESPAWN.x, y: START_RESPAWN.y, z: START_RESPAWN.z, r: RESPAWN_RADIUS },
        ...stage.checkpoints.filter((c) => c.respawn).map((c) => ({ ...c.respawn, r: RESPAWN_RADIUS })),
      ],
    }
    cache.set(stage, l)
  }
  return l
}

/** The highest a car may be on `stage` (see limitsFor). */
export const maxY = (stage) => limitsFor(stage).maxY

/** Is `p` a place a respawn on `stage` can put you? */
export function isTeleportPoint(p, stage) {
  return limitsFor(stage).teleports.some((t) => Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z) <= t.r)
}

/**
 * Whether a car could have got from `last` to `next` in `dt` seconds on `stage` (or was
 * put there by a respawn). `extraSpeed` (m/s, at most BUMP_EXTRA_SPEED): a bump threw it lately.
 */
export function acceptMove(last, next, dt, stage, extraSpeed = 0) {
  const dist = Math.hypot(next.x - last.x, next.y - last.y, next.z - last.z)
  const extra = Math.max(0, Math.min(BUMP_EXTRA_SPEED, Number(extraSpeed) || 0))
  return dist <= (MAX_CAR_SPEED + extra) * dt + MOVE_SLACK || isTeleportPoint(next, stage)
}

export const clampY = (y, stage) => Math.min(maxY(stage), Math.max(MIN_Y, y))
