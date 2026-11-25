/**
 * Drift scoring. While the car slides sideways on the ground the drift builds points
 * (faster and wider slides score more) and a multiplier that climbs the longer you hold
 * it. Straighten up for a moment and it banks; crash or fall and it's lost.
 *
 * Plain module state, updated from the player controller's frame; the live HUD reads
 * `runtime.car.drift`.
 */

/** Seconds of straight driving that end (and bank) a drift. */
const GRACE = 0.45
/** Shortest drift worth banking, s, and the smallest score. */
const MIN_TIME = 0.8
const MIN_SCORE = 40
/** The multiplier steps up by 0.1 every STEP seconds, to MAX. */
const STEP = 0.6
const MAX_MULT = 3
/** Points per second per m/s of sideways speed. */
const RATE = 5
/** A hit at least this hard (onHit intensity, 0..1) loses the drift. */
export const DRIFT_LOSE_HIT = 0.35

/**
 * @param {{ active: boolean, score: number, mult: number, time: number, grace: number }} d runtime.car.drift
 * @param {number} dt
 * @param {boolean} sliding the car is drifting with (most) wheels on the ground
 * @param {number} lateral sideways speed, m/s
 * @param {(score: number, mult: number, time: number) => void} bank called when a drift ends well
 */
export function updateDrift(d, dt, sliding, lateral, bank) {
  if (sliding) {
    if (!d.active) {
      d.active = true
      d.score = 0
      d.time = 0
      d.mult = 1
    }
    d.grace = 0
    d.time += dt
    d.mult = Math.min(MAX_MULT, 1 + Math.floor(d.time / STEP) * 0.1)
    d.score += dt * Math.abs(lateral) * RATE * d.mult
    return
  }
  if (!d.active) return
  d.grace += dt
  if (d.grace < GRACE) return
  const score = Math.round(d.score)
  if (d.time >= MIN_TIME && score >= MIN_SCORE) bank(score, d.mult, d.time)
  loseDrift(d)
}

/** Ends the drift without paying it (crash, fall, respawn). Returns whether one was running. */
export function loseDrift(d) {
  const had = d.active && d.time >= MIN_TIME
  d.active = false
  d.score = 0
  d.time = 0
  d.mult = 1
  d.grace = 0
  return had
}
