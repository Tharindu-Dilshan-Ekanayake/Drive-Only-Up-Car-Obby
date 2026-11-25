/**
 * Obstacle helpers for stage specs (the same shapes Sky Docks uses in ./stage1.js), for
 * the newer maps. Each returns obstacle (and trigger) specs to spread into a piece's
 * `obstacles` / `triggers` (see shared/track.js decorate and client/src/game/track/obstacleSim.js).
 */

/** Rows of bollards across the road, each leaving one wide gap on alternating sides. */
export function bollardField(from, to, rows, width) {
  const out = []
  const lanes = [-width * 0.38, -width * 0.19, 0, width * 0.19, width * 0.38]
  for (let r = 0; r < rows; r += 1) {
    const at = from + ((to - from) * r) / Math.max(1, rows - 1)
    const gap = r % 2 === 0 ? [0, 1] : [3, 4]
    lanes.forEach((lane, i) => {
      if (!gap.includes(i)) out.push({ type: 'bollard', at, lane })
    })
  }
  return out
}

/** A pair of drones strafing across the road in mirror image (always a way through). */
export const droneRow = (at, width, { period = 3.2, phase = 0 } = {}) => [
  { type: 'drone', at, lane: -width / 4, sweep: width / 4 - 1, period, phase },
  { type: 'drone', at, lane: width / 4, sweep: width / 4 - 1, period, phase: phase + Math.PI },
]

/** Fans at the roadside and the gusts they blow across it: `[at, dir]` (dir 1 = to your right). */
export function windZones(width, zones) {
  return {
    obstacles: zones.map(([at, dir]) => ({ type: 'fan', at, lane: -dir * (width / 2 + 2.4), dir })),
    triggers: zones.map(([at, dir]) => ({ type: 'wind', at, dir, size: [width, 14], power: 1 })),
  }
}

/** Sliding containers: `[at, phase, period]` each (`travel`: how far short of the curbs they stop). */
export const sweepers = (list, travel = 4) => list.map(([at, phase, period]) => ({ type: 'sweeper', at, phase, period, travel }))

/**
 * Cross traffic: a two-way crossing (forklifts, or `vehicle: 'truck'` trucks, out of a shed
 * on each side; the `traffic` obstacle). `at` is the first lane; the return lane runs `gap`
 * of the piece further on, half a cycle later.
 */
export const crossing = (at, { interval = 3.4, speed = 5.5, phase = 0, dir = 1, vehicle, gap = 0.07 } = {}) => [
  { type: 'traffic', at, dir, interval, speed, phase, vehicle },
  { type: 'traffic', at: at + gap, dir: -dir, interval, speed, phase: phase + interval / 2, vehicle },
]

/**
 * A laser gate (`laser` obstacles, client obstacleSim): a gantry over the road with a light
 * curtain hanging down over each of `lanes` equal lanes of the drivable width (`width` less
 * the kerbs). Each curtain is solid while it's lit, `duty` of every `period` seconds, and
 * flickers for a moment before it lights; the lanes take turns (evenly staggered phases), so
 * there is always an open lane - two lanes: one at a time, three: one or two, never all three.
 * `phase` (radians) shifts the whole gate. Put it on a piece of constant width.
 */
export function laserGate(at, width, { lanes = 2, period = 3.2, phase = 0, duty } = {}) {
  const drive = width - 1.2
  const span = drive / lanes
  const on = duty ?? (lanes === 2 ? 0.46 : 0.5)
  return Array.from({ length: lanes }, (_, k) => ({
    type: 'laser',
    at,
    lane: Math.round((-drive / 2 + span * (k + 0.5)) * 1000) / 1000,
    span: Math.round(span * 1000) / 1000,
    period,
    duty: on,
    phase: phase + (k * Math.PI * 2) / lanes,
    // The first curtain of a gate carries the gantry over the whole road.
    frame: k === 0,
  }))
}
