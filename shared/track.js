/**
 * Track builder: turns a short stage spec into everything the game needs about a
 * stage, deterministically, with no three.js (the server imports it too):
 *
 * - `boxes`      oriented collision/visual boxes (road, curbs, plazas, loop panels)
 * - `path`       centreline samples every ~2 m (CPU racers, progress, altitude rail)
 * - `checkpoints` gates with respawn transforms
 * - `coins`, `items` (item crates, each with its fixed `item`, and the `row` of three it stands in), `obstacles`, `triggers`, `supports`
 * - `sections`   one per checkpoint-to-checkpoint stretch, with bounds for culling
 *
 * It works like a turtle: a cursor (position + heading) is moved by pieces - straight,
 * curve, gap, loop, plaza - and each piece lays road where the cursor goes.
 *
 * Conventions: Y is up, heading `yaw` 0 drives towards -Z, positive yaw turns left.
 * forward = (-sin yaw, 0, -cos yaw), right = (cos yaw, 0, -sin yaw).
 * Boxes store their centre `c`, half extents `h` and local axes `ax` (right), `ay`
 * (up: the road surface normal for road kinds) and `az` (backwards, three.js style).
 */

import { createItemDealer } from './crateItems.js'

export const ROAD_THICKNESS = 1.2
export const CURB_HEIGHT = 0.38
export const CURB_WIDTH = 0.6
/** Crash barriers (pieces with `barrier: true`): tall enough to keep a knocked car on. */
export const BARRIER_HEIGHT = 1.2
/** Collision slabs overlap their neighbours by this much (m) so joints never crack. */
const JOINT_OVERLAP = 0.08
/** Where curbs stop at an open-edged piece, they stop this far (m) short of the joint. */
const CURB_GAP = 0.03
export const DEFAULT_WIDTH = 12
/** A single-lane spot (one car at a time): the narrowest road; `widthScale` never narrows it. */
export const SINGLE_LANE = 4.2

/**
 * A road width as a builder with `widthScale` k lays it (createTrackBuilder): `w * k`, to
 * the millimetre, except that single-lane widths (<= SINGLE_LANE) stay as they are and
 * nothing comes out narrower than one. Stage specs use it to lay obstacles out across the
 * road they will actually get (shared/stages/stage1.js).
 */
export function scaledWidth(w, k = 1) {
  if (k === 1 || !(w > SINGLE_LANE + 1e-6)) return w
  return Math.max(SINGLE_LANE, Math.round(w * k * 1000) / 1000)
}
/** Spike strips (piece option `spikes`): length along the road and the open lane they always leave (m). */
export const SPIKES = { length: 3.6, clear: 4.5 }

/**
 * The pit garage on every checkpoint plaza (metres from the plaza's left edge, inward):
 * back wall at `back`, `depth` deep, `length` along the road, `height` to the roof; the
 * car-spin pad's centre is `pad` in from the edge. Shared with the client's drawing.
 */
export const PIT = { back: 1.2, depth: 6.5, length: 13, height: 5.4, pad: 13 }
/**
 * Checkpoint plaza (the safe zone) size, metres: `length` along the road from the gate,
 * `width` across it; the finish summit is bigger. Each checkpoint stores its own
 * `length` / `width` (safe zones, boards and the drawing read those, never these).
 */
export const PLAZA = { length: 60, width: 46, finishLength: 90, finishWidth: 70 }
/** Spacing of centreline samples, metres. */
const SAMPLE_STEP = 2
const DEG = Math.PI / 180

/**
 * Glass tube (pieces with `tube`): a half-pipe with a `floor` m flat floor whose walls
 * curve up (radius `radius`) to `wall` degrees, so a car can ride up the sides, closed
 * overhead by a faceted glass arch (radius floor / 2 + radius, centred `radius` above
 * the floor). Walls and glass are slabs `thick` deep, one per facet (`facet` degrees of
 * wall, `glassFacet` degrees of arch). Shared with the client's drawing.
 */
export const TUBE = { floor: 7, radius: 4.2, wall: 75, thick: 1.2, facet: 15, glassFacet: 30 }

/**
 * A point of the tube's inner profile on `side` (+1 right, -1 left), in the road's
 * cross-section: `x` metres right of the centre line, `y` up from the floor, and the
 * inward surface normal (nx, ny). `deg` is the wall angle (0 = the floor's edge, 90 =
 * upright), or with `glass` the arch angle (0 = upright at the side, 90 = the apex).
 */
export function tubePoint(side, deg, glass = false) {
  const F = TUBE.floor / 2
  const R = TUBE.radius
  const t = deg * DEG
  if (!glass) return { x: side * (F + R * Math.sin(t)), y: R * (1 - Math.cos(t)), nx: -side * Math.sin(t), ny: Math.cos(t) }
  const A = F + R
  return { x: side * A * Math.cos(t), y: R + A * Math.sin(t), nx: -side * Math.cos(t), ny: -Math.sin(t) }
}

/**
 * The flat facets of one side of a tube's profile, bottom to top: `[from, to, kind]`
 * (tubePoint results; kind 'tube' for the walls up to `wallDeg`, 'glass' for the arch,
 * present only when `glass`). The collision slabs and the drawn surfaces are both these.
 */
export function tubeFacets(side, wallDeg, glass = false) {
  const out = []
  for (let a = 0; a < wallDeg - 1e-6; a += TUBE.facet) out.push([tubePoint(side, a), tubePoint(side, Math.min(wallDeg, a + TUBE.facet)), 'tube'])
  if (glass) {
    out.push([tubePoint(side, wallDeg), tubePoint(side, 90), 'glass'])
    for (let a = 0; a < 90 - 1e-6; a += TUBE.glassFacet) out.push([tubePoint(side, a, true), tubePoint(side, a + TUBE.glassFacet, true), 'glass'])
  }
  return out
}

/**
 * Round platforms the road runs straight across (shared with the client's drawing and
 * the checks). Both are an `n`-gon floor of apothem `R`, flush with the road; the
 * sectors the road passes through (front and back) are `open`.
 *
 * - `ARENA`, the Stunt Bowl (~60 m across): round its edge a quarter-pipe rim (profile
 *   radius `Rq`, facets of `facet` degrees up to `deg`), a flat `deck` ring on top and a
 *   low wall round that; the open sectors' floor runs out flat to the deck's edge (the
 *   aprons the road comes in and goes out over), walled beside the road. The rim's top
 *   facet (80-100 deg) stands exactly upright, so a car going up it flies straight up
 *   and comes back down into the bowl or onto the deck (a top facet leaning out even a
 *   little - 72 or 90 deg profiles - throws fast cars over the wall into the sea). Two
 *   kicker ramps (`kicker`: foot `along` metres from the centre, `lat` right of it), run
 *   up to from the entry apron, launch you forward either side of the road, so playing
 *   in it is optional.
 * - `SPINNER`, the sweeper deck: a low wall round the floor, and the `spinbar`
 *   obstacle (client obstacleSim) turning about a hub in the middle: one long arm out to
 *   `reach` (just inside the wall) and a short counterweight tail (`tail`, clear of the
 *   lanes beside the hub), so either side of the hub can be passed by timing it. (A full
 *   bar across the deck can't be: on one side its far arm sweeps the whole lane at you.)
 */
export const ARENA = {
  n: 24,
  R: 22,
  rim: { Rq: 4.5, deg: 100, facet: 20 },
  deck: 3.5,
  wall: { h: 1.4, t: 0.6 },
  kicker: { length: 8.5, height: 2.6, width: 5, back: 7.5 },
  kickers: [
    { lat: -9, along: -19 },
    { lat: 9, along: -19 },
  ],
}
export const SPINNER = { n: 20, R: 15, wall: { h: 0.9, t: 0.6 }, reach: 14.1, tail: 2.2, speed: 0.75, knock: 0.4 }

/** Stunt-bowl kicker ramps (two collider slabs each, kind 'kicker'): the ramp, then a landing slope down behind the lip. */
function kickerBoxes(base, f, r, K) {
  const u = [0, 1, 0]
  const theta = Math.atan2(K.height, K.length)
  const az = norm(mul(add(mul(f, Math.cos(theta)), mul(u, Math.sin(theta))), -1))
  const ay = norm(sub(mul(u, Math.cos(theta)), mul(f, Math.sin(theta))))
  const slope = Math.hypot(K.length, K.height)
  const topMid = add(base, add(mul(f, K.length / 2), mul(u, K.height / 2)))
  const ramp = { c: sub(topMid, mul(ay, 0.5)), h: [K.width / 2, 0.5, slope / 2], ax: r, ay, az }
  const lip = add(base, add(mul(f, K.length), mul(u, K.height)))
  const foot = add(base, mul(f, K.length + K.back))
  const down = norm(sub(foot, lip))
  const ay2 = norm(cross(mul(down, -1), r))
  const back = { c: sub(mul(add(lip, foot), 0.5), mul(ay2, 0.5)), h: [K.width / 2, 0.5, Math.hypot(K.back, K.height) / 2], ax: r, ay: ay2, az: mul(down, -1) }
  return [ramp, back]
}

/**
 * Flat footprints of a stage's wide pieces - checkpoint plazas (`hl` x `hw` half sizes
 * round centre x/z, forward fx/fz) and round platforms (`radius`) - with the path
 * distances they cover (`sFrom`..`sTo`): to keep other roads and scenery off them.
 */
export function stageFootprints(stage) {
  const out = []
  for (const cp of stage.checkpoints) {
    if (!(cp.length > 0)) continue
    const f = forwardOf(cp.yaw)
    out.push({ kind: 'plaza', index: cp.index, x: cp.x + (f[0] * cp.length) / 2, y: cp.y, z: cp.z + (f[2] * cp.length) / 2, fx: f[0], fz: f[2], hl: cp.length / 2, hw: cp.width / 2, sFrom: cp.s, sTo: cp.s + cp.length })
  }
  for (const r of stage.rounds || []) out.push({ kind: r.kind, x: r.c[0], y: r.c[1], z: r.c[2], radius: r.Ro / Math.cos(Math.PI / r.n), sFrom: r.sStart, sTo: r.sEnd })
  return out
}

/** Horizontal distance from (x, z) to footprint `fp` (0 inside it). */
export function footprintDistance(fp, x, z) {
  const dx = x - fp.x
  const dz = z - fp.z
  if (fp.radius !== undefined) return Math.max(0, Math.hypot(dx, dz) - fp.radius)
  const a = Math.abs(dx * fp.fx + dz * fp.fz) - fp.hl
  const b = Math.abs(dx * fp.fz - dz * fp.fx) - fp.hw
  return Math.hypot(Math.max(0, a), Math.max(0, b))
}

// --- tiny vector helpers (plain arrays) -------------------------------------------

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a) => Math.hypot(a[0], a[1], a[2])
const norm = (a) => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const round = (v) => Math.round(v * 1000) / 1000

export const forwardOf = (yaw) => [-Math.sin(yaw), 0, -Math.cos(yaw)]
export const rightOf = (yaw) => [Math.cos(yaw), 0, -Math.sin(yaw)]

/**
 * A box whose top face runs from `a` to `b` (road-surface points on the centreline),
 * `width` wide and `thickness` deep, with `right` as its lateral axis.
 */
function slabBetween(a, b, right, width, thickness, extra = 0) {
  const dir = norm(sub(b, a))
  const up = norm(cross(mul(dir, -1), right))
  // Re-orthogonalise right against the slope.
  const ax = norm(cross(up, mul(dir, -1)))
  const length = len(sub(b, a)) + extra
  const mid = lerp3(a, b, 0.5)
  const c = sub(mid, mul(up, thickness / 2))
  return { c, h: [width / 2, thickness / 2, length / 2], ax, ay: up, az: mul(dir, -1) }
}

/** Lifts a box by `dy` along its own up axis and offsets it by `dx` along its right axis. */
function offsetBox(box, dx, dy) {
  return { ...box, c: add(add(box.c, mul(box.ax, dx)), mul(box.ay, dy)) }
}

function roundBox(b) {
  return { ...b, c: b.c.map(round), h: b.h.map(round), ax: b.ax.map(round), ay: b.ay.map(round), az: b.az.map(round) }
}

/**
 * `widthScale` (default 1: as specified) narrows (or widens) the road: the default width
 * and every explicit piece width - straights, bends, tapers, hills, stunt runs, squeeze
 * ends, pontoon bridges, gaps - come out `scaledWidth(w, widthScale)`, coin lines across
 * the road (`coins.lane` / `weave` / `arc`) move in to match, but single-lane widths
 * (<= SINGLE_LANE), checkpoint plazas, round platforms (Stunt Bowl, sweeper deck), loops
 * and glass tubes keep their size. A piece with `rawWidth: true` keeps its widths (and
 * coin lanes) as given; `rawWidth: 'start'` / `'end'` keeps just that end of a taper - a
 * road meeting a loop or a tube at its own width. `setWidthScale(k)` changes it from the
 * next piece on (a zone of a multi-zone map).
 *
 * @param {{ id: string, name: string, start: { x: number, y: number, z: number, yaw: number }, width?: number, stretch?: number, widthScale?: number }} options
 */
export function createTrackBuilder({ id, name, start, width = DEFAULT_WIDTH, stretch = 1, widthScale = 1 }) {
  let wScale = widthScale
  /** Width `w` as laid (kept as given when `raw`). */
  const sw = (w, raw = false) => (raw ? w : scaledWidth(w, wScale))
  /** A piece's width spec (number or taper) as laid, honouring `opts.rawWidth`. */
  const pieceWidth = (opts, fallback = width) => {
    const w = opts.width || fallback
    const raw = opts.rawWidth
    if (Array.isArray(w)) return [sw(w[0], raw === true || raw === 'start'), sw(w[1], raw === true || raw === 'end')]
    return sw(w, raw === true)
  }
  let pos = [start.x, start.y, start.z]
  let yaw = start.yaw
  let s = 0
  let section = 0
  /** Slope (rise per metre) the road ended on, so the next straight can ease out of it (null = don't). */
  let lastSlope = 0
  let ids = 0
  /**
   * Where a curbed piece meets an open-edged one, the curb colliders must not poke past
   * the joint into the open piece's lane (they overlap their slab's ends by a few cm for
   * the joints between curbed pieces). `tail`: the last road piece's final curb boxes and
   * how far they overlap past its end (null if it ended without curbs); `tailOpen`: it
   * was an open-edged road. `lastCurbs`: indices of the curb boxes pushed last.
   */
  let tail = null
  let tailOpen = false
  let lastCurbs = []

  const stage = {
    id,
    name,
    boxes: [],
    path: [],
    checkpoints: [{ index: 0, name: 'Start', x: start.x, y: start.y, z: start.z, yaw: start.yaw, s: 0, width }],
    coins: [],
    items: [],
    obstacles: [],
    triggers: [],
    supports: [],
    sections: [{ index: 0, name: 'Warm-up', sStart: 0, sEnd: 0 }],
    signs: [],
    /** Stunt runs (path index ranges) where shared/adventure.js puts a ramp and rings. */
    stunts: [],
    /** Round platforms (ARENA / SPINNER) the road crosses; see roundPiece. */
    rounds: [],
    /** Lighthouse towers standing in the middle of a spiral (curve `beacon: true`): drawn only. */
    beacons: [],
    /**
     * What the road LOOKS like: continuous strips of cross-sections, one per piece
     * (`{ style, curbs, curbHeight, section, cs: [{ p, r, u, w, s }] }`; p = surface
     * centre, r/u = right/up unit vectors, w = width, s = path distance). Drawn as one
     * mitred ribbon so nothing overlaps (no z-fighting), while `boxes` stay the
     * collision shapes (which may overlap, harmlessly).
     */
    ribbons: [],
  }

  const nextId = (prefix) => `${prefix}${(ids += 1)}`
  /** Deals each crate its fixed item, row by row (shared/crateItems.js). */
  const dealItems = createItemDealer(id)
  let crateRows = 0

  function pushBox(box, kind, extra = {}) {
    stage.boxes.push(roundBox({ ...box, kind, section, ...extra }))
  }

  function pushSample(p, fwd, up, w, air = false) {
    const last = stage.path[stage.path.length - 1]
    if (last) s += Math.hypot(p[0] - last.x, p[1] - last.y, p[2] - last.z)
    stage.path.push({
      i: stage.path.length,
      x: round(p[0]),
      y: round(p[1]),
      z: round(p[2]),
      fx: round(fwd[0]),
      fy: round(fwd[1]),
      fz: round(fwd[2]),
      ux: round(up[0]),
      uy: round(up[1]),
      uz: round(up[2]),
      s: round(s),
      w,
      section,
      air,
    })
  }

  /**
   * A glass tube's walls (and, with `glass`, its arch) over a floor slab: one slab per
   * profile facet, its top face on the facet. On a curve (`da` = the slab's turn) each is
   * lengthened by what its distance from the centre line needs to close the wedge
   * between neighbouring slabs on the outside of the bend.
   */
  function tubeWalls(slab, wallDeg, glass, da = 0) {
    const top = add(slab.c, mul(slab.ay, slab.h[1]))
    const P = (q) => add(add(top, mul(slab.ax, q.x)), mul(slab.ay, q.y))
    for (const side of [-1, 1]) {
      for (const [q0, q1, kind] of tubeFacets(side, wallDeg, glass)) {
        const p0 = P(q0)
        const p1 = P(q1)
        const chord = len(sub(p1, p0))
        if (chord < 0.05) continue
        const n = norm(add(mul(slab.ax, q0.nx + q1.nx), mul(slab.ay, q0.ny + q1.ny)))
        const lat = Math.max(Math.abs(q0.x), Math.abs(q1.x))
        const extra = 2 * lat * Math.abs(Math.tan(da / 2)) + 0.1
        const c = sub(lerp3(p0, p1, 0.5), mul(n, TUBE.thick / 2))
        pushBox({ c, h: [chord / 2 + JOINT_OVERLAP / 2, TUBE.thick / 2, slab.h[2] + extra / 2], ax: norm(sub(p1, p0)), ay: n, az: slab.az }, kind)
      }
    }
  }

  /**
   * Coins up a tube's walls: `n` of them `angle` degrees up the wall (on `side` +1 / -1,
   * or 'alt' to swap sides each coin), between fractions `from` and `to` of the piece.
   */
  function tubeCoins(samples, spec) {
    const { n = 5, angle = 40, side = 'alt', from = 0.15, to = 0.85 } = spec
    for (let i = 0; i < n; i += 1) {
      const t = n === 1 ? (from + to) / 2 : from + ((to - from) * i) / (n - 1)
      const p = samples[Math.min(samples.length - 1, Math.max(0, Math.round(t * (samples.length - 1))))]
      const up = [p.ux, p.uy, p.uz]
      const right = norm(cross([p.fx, p.fy, p.fz], up))
      const sd = side === 'alt' ? (i % 2 ? 1 : -1) : side
      const q = tubePoint(sd, angle)
      const nrm = add(mul(right, q.nx), mul(up, q.ny))
      const w = add(add(add([p.x, p.y, p.z], mul(right, q.x)), mul(up, q.y)), mul(nrm, 1.3))
      stage.coins.push({ id: nextId('c'), x: round(w[0]), y: round(w[1]), z: round(w[2]), section })
    }
  }

  /** Curbs along both edges of a road slab. */
  function curbs(slab, w, height = CURB_HEIGHT, kind = 'curb') {
    for (const side of [-1, 1]) {
      const curb = {
        ...slab,
        h: [CURB_WIDTH / 2, height / 2, slab.h[2]],
      }
      pushBox(offsetBox(curb, side * (w / 2 - CURB_WIDTH / 2), slab.h[1] + height / 2), kind)
    }
    lastCurbs = [stage.boxes.length - 2, stage.boxes.length - 1]
  }

  /** Shortens box `i` by `amount` at its forward ('end', along -az) or rear ('start') end. */
  function trimBox(i, end, amount) {
    const b = stage.boxes[i]
    const k = end === 'end' ? amount / 2 : -amount / 2
    stage.boxes[i] = roundBox({ ...b, c: add(b.c, mul(b.az, k)), h: [b.h[0], b.h[1], b.h[2] - amount / 2] })
  }

  /** A road piece starts: `curbed` or open-edged (`open`; tubes are neither). */
  function joinCurbs(curbed, open) {
    if (open && tail) for (const i of tail.idx) trimBox(i, 'end', tail.over + CURB_GAP)
    return curbed && tailOpen
  }

  /**
   * Curbs along a taper segment from surface points a to b (widths w0 to w1): each
   * follows the drawn edge line itself (turned with the taper), so consecutive ones line
   * up end to end - no stair of curb ends sticking into the lane to snag a wheel on.
   */
  function taperCurbs(a, b, right, w0, w1, height) {
    for (const side of [-1, 1]) {
      const ea = add(a, mul(right, side * (w0 / 2 - CURB_WIDTH / 2)))
      const eb = add(b, mul(right, side * (w1 / 2 - CURB_WIDTH / 2)))
      pushBox(offsetBox(slabBetween(ea, eb, right, CURB_WIDTH, height, JOINT_OVERLAP), 0, height), 'curb')
    }
    lastCurbs = [stage.boxes.length - 2, stage.boxes.length - 1]
  }

  /**
   * Places what a piece carries - coins, item boxes, obstacles, triggers - at fractions
   * of the piece, using its own samples.
   */
  function decorate(samples, w, opts) {
    if (!samples.length) return
    const at = (t) => {
      const i = Math.min(samples.length - 1, Math.max(0, Math.round(t * (samples.length - 1))))
      return samples[i]
    }
    const place = (t, lane = 0, lift = 0) => {
      const p = at(t)
      const right = norm(cross([p.fx, p.fy, p.fz], [p.ux, p.uy, p.uz]))
      return {
        x: round(p.x + right[0] * lane + p.ux * lift),
        y: round(p.y + right[1] * lane + p.uy * lift),
        z: round(p.z + right[2] * lane + p.uz * lift),
        yaw: round(Math.atan2(-p.fx, -p.fz)),
        pitch: round(Math.asin(Math.max(-1, Math.min(1, p.fy)))),
        sample: p,
      }
    }

    if (opts.coins) {
      // `arc`: metres the line swings sideways at the middle of the run (a racing line through
      // a hairpin: `lane` on the outside at both ends, `lane + arc` at the apex).
      const { n = 5, from = 0.15, to = 0.85 } = opts.coins
      // (Across a narrowed road - `widthScale` - the line moves in with the edges.)
      const k = opts.rawWidth === true ? 1 : wScale
      const lane = (opts.coins.lane || 0) * k
      const weave = (opts.coins.weave || 0) * k
      const arc = (opts.coins.arc || 0) * k
      for (let i = 0; i < n; i += 1) {
        const t = n === 1 ? (from + to) / 2 : from + ((to - from) * i) / (n - 1)
        const l = lane + (weave ? Math.sin(i * 0.9) * weave : 0) + (arc ? arc * Math.sin(Math.PI * (n === 1 ? 0.5 : i / (n - 1))) : 0)
        const { x, y, z } = place(t, l, 1.3)
        stage.coins.push({ id: nextId('c'), x, y, z, section })
      }
    }
    if (opts.items) {
      const t = typeof opts.items === 'number' ? opts.items : 0.5
      // A row of three across the road, each crate holding a different item.
      const lanes = [-w / 4, 0, w / 4]
      const held = dealItems(lanes.length)
      const row = (crateRows += 1)
      lanes.forEach((lane, k) => {
        const { x, y, z } = place(t, lane, 1.4)
        stage.items.push({ id: nextId('i'), x, y, z, section, row, item: held[k] })
      })
    }
    for (const o of opts.obstacles || []) {
      const { x, y, z, yaw: oy, pitch, sample } = place(o.at ?? 0.5, o.lane || 0)
      const { at: _at, ...params } = o
      stage.obstacles.push({
        id: nextId('o'),
        ...params,
        lane: o.lane || 0,
        x,
        y,
        z,
        yaw: oy,
        pitch,
        width: w,
        section,
        // Where it sits on the path, and the span of the piece that carries it.
        pi: sample.i,
        piStart: samples[0].i,
        piEnd: samples[samples.length - 1].i,
      })
    }
    // Spike strips: a low slab of teeth across `cover` of the drivable width, against the
    // `side` kerb (+1 right, -1 left), always leaving >= SPIKES.clear m open. A trigger
    // (client physics: speed cut and a wobble) that the client also draws.
    for (const sp of opts.spikes || []) {
      const sw = place(sp.at ?? 0.5, 0).sample.w
      const drive = sw - 2 * CURB_WIDTH
      const span = Math.min((sp.cover ?? 0.5) * drive, drive - SPIKES.clear)
      if (span < 1.5) continue
      const lane = (sp.side || 1) * (drive / 2 - span / 2)
      const p = place(sp.at ?? 0.5, lane)
      const smp = p.sample
      const fwd = [smp.fx, smp.fy, smp.fz]
      const up = [smp.ux, smp.uy, smp.uz]
      const ax = norm(cross(up, mul(fwd, -1)))
      stage.triggers.push({
        id: nextId('t'),
        type: 'spikes',
        power: 1,
        dir: 1,
        c: [p.x + up[0] * 0.8, p.y + up[1] * 0.8, p.z + up[2] * 0.8].map(round),
        h: [span / 2, 1, SPIKES.length / 2],
        ax: ax.map(round),
        ay: up.map(round),
        az: mul(fwd, -1).map(round),
        lane: round(lane),
        span: round(span),
        // (`look`: drawn differently, same effect - the Tropical Island's coral strips.)
        ...(sp.look ? { look: sp.look } : {}),
        section,
      })
    }
    for (const tr of opts.triggers || []) {
      const p = place(tr.at ?? 0.5, tr.lane || 0)
      const smp = p.sample
      const fwd = [smp.fx, smp.fy, smp.fz]
      const up = [smp.ux, smp.uy, smp.uz]
      const ax = norm(cross(up, mul(fwd, -1)))
      const size = tr.size || [Math.min(w - 2, 6), 3.2]
      stage.triggers.push({
        id: nextId('t'),
        type: tr.type,
        power: tr.power || 1,
        // Wind blows towards +right (1) or -right (-1); conveyors run with (1) or against (-1) you.
        dir: tr.dir || 1,
        c: [p.x + up[0] * 0.8, p.y + up[1] * 0.8, p.z + up[2] * 0.8].map(round),
        h: [size[0] / 2, 1, size[1] / 2],
        ax: ax.map(round),
        ay: up.map(round),
        az: mul(fwd, -1).map(round),
        // (`look`: drawn differently, same effect - the Tropical Island's palm springs.)
        ...(tr.look ? { look: tr.look } : {}),
        section,
      })
    }
  }

  /** Supports (visual pillars) under a road point, every ~24 m of path. */
  let lastSupportS = -Infinity
  function maybeSupport(p, w, force = false) {
    if (!force && s - lastSupportS < 24) return
    if (p[1] < 4) return
    // No tower may stand on (pass through) a road below it, e.g. the spiral's lower turns.
    for (const q of stage.path) {
      if (q.y < p[1] - 3 && !q.air && Math.hypot(q.x - p[0], q.z - p[2]) < q.w / 2 + 3) return
    }
    lastSupportS = s
    stage.supports.push({ x: round(p[0]), z: round(p[2]), top: round(p[1] - ROAD_THICKNESS), width: round(Math.min(w * 0.35, 4)), section })
  }

  /** Width at fraction tt of a piece: `w` is a number or a taper `[from, to]`. */
  const widthAt = (w, tt) => (Array.isArray(w) ? w[0] + (w[1] - w[0]) * tt : w)
  const widest = (w) => (Array.isArray(w) ? Math.max(w[0], w[1]) : w)

  /** Starts a ribbon for a piece and returns a function that adds a cross-section. */
  function ribbon(opts, defaults = {}) {
    const r = {
      style: opts.style || defaults.style || 'asphalt',
      curbs: opts.curbs !== false,
      // `barrier: true` pieces get tall crash barriers instead of curbs.
      curbHeight: defaults.curbHeight || (opts.barrier ? BARRIER_HEIGHT : CURB_HEIGHT),
      section,
      cs: [],
    }
    // Drawing hints: a glass tube piece (`{ glass }`, each cross-section carrying its
    // wall angle `wa`), one plank of a pontoon bridge, a loop dressed in light strips.
    if (defaults.tube) r.tube = defaults.tube
    if (defaults.pontoon) r.pontoon = true
    if (defaults.glow) r.glow = true
    // A single-lane girder bridge (squeeze `open`): steel girders drawn under its edges.
    if (opts.girder) r.girder = true
    stage.ribbons.push(r)
    return (p, right, up, w, at, wa) => {
      const c = { p: p.map(round), r: right.map(round), u: up.map(round), w: round(w), s: round(at) }
      if (wa !== undefined) c.wa = round(wa)
      r.cs.push(c)
    }
  }

  /** A piece's tube spec (opts.tube) with its defaults filled in, or null. */
  const tubeSpec = (opts) => {
    if (!opts.tube) return null
    const from = opts.tube.from ?? TUBE.wall
    const to = opts.tube.to ?? TUBE.wall
    // Glass only over full-height walls (the flared ends are open).
    return { from, to, glass: !!opts.tube.glass && from === TUBE.wall && to === TUBE.wall, coins: opts.tube.coins }
  }

  /** Right vector tilted about `fwd` by `bank` radians (positive raises the right edge). */
  const banked = (right, fwd, bank) => {
    if (!bank) return right
    const up = norm(cross(mul(fwd, -1), right))
    return norm(add(mul(right, Math.cos(bank)), mul(up, Math.sin(bank))))
  }

  /**
   * A round platform (`ARENA` or `SPINNER` spec) the road runs straight across: the road
   * itself (open-edged, so you can leave it), the floor sectors, the arena's quarter-pipe
   * rim and deck ring, the low walls, the arena's kickers - all colliders - and a
   * `stage.rounds` record the client draws it from. Needs a flat run-in (it is flat).
   */
  function roundPiece(kind, spec, opts = {}) {
    const { n, R } = spec
    const rim = spec.rim || null
    const half = Math.PI / n
    const tanH = Math.tan(half)
    const roadW = opts.width || width
    const yaw0 = yaw
    const fwd = forwardOf(yaw)
    const right = rightOf(yaw)
    const up = [0, 1, 0]
    const T = ROAD_THICKNESS
    const rimTop = rim ? rim.deg * DEG : 0
    const Dq = rim ? R + rim.Rq * Math.sin(rimTop) : R
    const H = rim ? rim.Rq * (1 - Math.cos(rimTop)) : 0
    const Ro = Dq + (rim ? spec.deck || 0 : 0)
    const centre = add(pos, mul(fwd, Ro))
    const sec = section
    const sStart = s
    const first = stage.path.length
    api.straight(2 * Ro, 0, { ...opts, width: roadW, rawWidth: true, curbs: false, noBlend: true, fixed: true })
    const angleOf = (i) => (i * 2 * Math.PI) / n
    const dirOf = (i) => add(mul(fwd, Math.cos(angleOf(i))), mul(right, Math.sin(angleOf(i))))
    const tanOf = (i) => add(mul(fwd, -Math.sin(angleOf(i))), mul(right, Math.cos(angleOf(i))))
    // Open sectors: those whose span reaches within the road's width of the centre line.
    const reach = Math.asin(Math.min(1, (roadW / 2 + 0.5) / R))
    const open = []
    for (let i = 0; i < n; i += 1) {
      let dist = Infinity
      for (const target of [0, Math.PI, 2 * Math.PI]) dist = Math.min(dist, Math.max(0, Math.abs(angleOf(i) - target) - half))
      open.push(dist <= reach)
    }
    const wall = spec.wall
    const walls = []
    for (let i = 0; i < n; i += 1) {
      const d = dirOf(i)
      const t = tanOf(i)
      const box = (c, h, ay, kind, extra = {}) => pushBox({ c, h, ax: t, ay, az: cross(t, ay) }, kind, { section: sec, ...extra })
      // Floor: a rectangle from the centre to the sector's edge, as wide as the edge; the
      // n of them make up exactly the n-gon. Open arena sectors run out to the deck's edge.
      const A = open[i] && rim ? Ro : R
      box(add(add(centre, mul(d, A / 2)), [0, -T / 2, 0]), [A * tanH + 0.05, T / 2, A / 2], up, 'disc')
      if (rim && !open[i]) {
        // Quarter-pipe facets: each a slab under one flat band of the n-gon ring.
        for (let a = 0; a < rimTop - 1e-6; a += rim.facet * DEG) {
          const a1 = Math.min(rimTop, a + rim.facet * DEG)
          const p0 = [R + rim.Rq * Math.sin(a), rim.Rq * (1 - Math.cos(a))]
          const p1 = [R + rim.Rq * Math.sin(a1), rim.Rq * (1 - Math.cos(a1))]
          const chord = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
          const ud = (p1[0] - p0[0]) / chord
          const uy = (p1[1] - p0[1]) / chord
          const nrm = norm(add(mul(d, -uy), mul(up, ud)))
          const mid = add(add(centre, mul(d, (p0[0] + p1[0]) / 2)), [0, (p0[1] + p1[1]) / 2, 0])
          box(sub(mid, mul(nrm, T / 2)), [p1[0] * tanH + 0.05, T / 2, chord / 2 + JOINT_OVERLAP / 2], nrm, 'bowl')
        }
        // The deck ring on top.
        box(add(add(centre, mul(d, (Dq + Ro) / 2)), [0, H - T / 2, 0]), [Ro * tanH + 0.05, T / 2, (Ro - Dq) / 2 + 0.1], up, 'bowl')
      }
      // Low walls round the edge: whole edges where there is no road, and on the open
      // sectors the parts of the edge clear of the road (more than a metre of them).
      const base = open[i] ? 0 : H
      const lim = Ro * tanH
      const spans = []
      if (!open[i]) spans.push([-lim, lim])
      else {
        // Lateral offset of the edge point at tangential offset q: Ro sin a + q cos a.
        const ca = Math.cos(angleOf(i))
        const sa = Math.sin(angleOf(i))
        const c0 = roadW / 2 + 0.3
        for (const sign of [1, -1]) {
          // sign * (Ro sa + q ca) >= c0
          let lo = -lim
          let hi = lim
          const k = sign * ca
          const rhs = c0 - sign * Ro * sa
          if (Math.abs(k) < 1e-9) {
            if (rhs > 0) continue
          } else if (k > 0) lo = Math.max(lo, rhs / k)
          else hi = Math.min(hi, rhs / k)
          if (hi - lo > 1) spans.push([lo, hi])
        }
      }
      for (const [q0, q1] of spans) {
        const c = add(add(add(centre, mul(d, Ro - wall.t / 2)), mul(t, (q0 + q1) / 2)), [0, base + wall.h / 2, 0])
        box(c, [(q1 - q0) / 2 + 0.02, wall.h / 2, wall.t / 2], up, 'arenawall', { grip: 0.6 })
        walls.push({ i, q0: round(q0), q1: round(q1), base: round(base) })
      }
    }
    // The arena's kickers, either side of the road, launching you forward.
    const kickers = []
    for (const k of spec.kickers || []) {
      const foot = add(add(centre, mul(right, k.lat)), mul(fwd, k.along))
      for (const b of kickerBoxes(foot, fwd, right, spec.kicker)) pushBox(b, 'kicker', { section: sec })
      kickers.push({ lat: k.lat, along: k.along, ...spec.kicker, x: round(foot[0]), y: round(foot[1]), z: round(foot[2]) })
    }
    // Coins round the arena's side rims, part way up the quarter-pipe: ride the bowl.
    if (rim) {
      const ca = 40 * DEG
      for (let i = 0; i < n; i += 1) {
        if (open[i] || Math.abs(Math.sin(angleOf(i))) < 0.8) continue
        const d = dirOf(i)
        const nrm = add(mul(d, -Math.sin(ca)), mul(up, Math.cos(ca)))
        const q = add(add(add(centre, mul(d, R + rim.Rq * Math.sin(ca))), [0, rim.Rq * (1 - Math.cos(ca)), 0]), mul(nrm, 1.3))
        stage.coins.push({ id: nextId('c'), x: round(q[0]), y: round(q[1]), z: round(q[2]), section: sec })
      }
    }
    // The path sample nearest the centre (the spinner's hub), and the span across.
    const distC = (k) => Math.hypot(stage.path[k].x - centre[0], stage.path[k].z - centre[2])
    let mid = first
    for (let k = first; k < stage.path.length; k += 1) if (distC(k) < distC(mid)) mid = k
    const record = {
      kind,
      section: sec,
      c: centre.map(round),
      yaw: round(yaw0),
      n,
      R,
      Ro: round(Ro),
      Dq: round(Dq),
      H: round(H),
      rim,
      wall,
      roadW,
      open,
      walls,
      kickers,
      sStart: round(sStart),
      sEnd: round(s),
      pi: mid,
      piStart: first,
      piEnd: stage.path.length - 1,
    }
    stage.rounds.push(record)
    return record
  }

  const api = {
    stage,
    get position() {
      return { x: pos[0], y: pos[1], z: pos[2], yaw }
    },
    /** The current `widthScale` (see createTrackBuilder). */
    get widthScale() {
      return wScale
    },
    /** Lays the pieces from here on at `widthScale` k (a zone of a multi-zone map; 1 = as specified). */
    setWidthScale(k = 1) {
      wScale = k
      return api
    },

    /**
     * Straight road `length` metres ahead (horizontal), climbing `rise`.
     * opts: width (number or taper [from, to]), style ('asphalt' | 'grate' | 'planks'),
     * curbs (false = open edges), plus what the piece carries (see decorate).
     */
    straight(length, rise = 0, opts = {}) {
      // `stretch`: every straight (bar `fixed` ones: pads, deck run-ins) comes out that much
      // longer, climbing as much more, with that many more coins (a bigger world, same slopes).
      if (stretch !== 1 && !opts.fixed) {
        length *= stretch
        rise *= stretch
        if (opts.coins) opts = { ...opts, coins: { ...opts.coins, n: Math.max(1, Math.round((opts.coins.n ?? 5) * stretch)) } }
      }
      // A glass tube piece: the floor is the tube's, the walls go where the curbs would.
      // `tube: { from, to }` flares the walls between two angles (the open ends).
      const tube = tubeSpec(opts)
      const W = tube ? TUBE.floor : pieceWidth(opts)
      const wallAt = (tt) => (tube ? tube.from + (tube.to - tube.from) * tt : undefined)
      const fwd = forwardOf(yaw)
      const right = rightOf(yaw)
      const startPos = pos
      const end = add(add(pos, mul(fwd, length)), [0, rise, 0])
      // The vertical profile: if the slope changes from the previous piece, the first
      // stretch eases from the old slope to the new one (no kink to launch off), and the
      // rest is a touch steeper so the piece still ends exactly at `end`.
      const target = rise / length
      const blend = lastSlope !== null && !opts.noBlend && Math.abs(target - lastSlope) > 0.03 ? Math.min(14, length / 3) : 0
      const slope = blend ? (rise - (lastSlope * blend) / 2) / (length - blend / 2) : target
      const nodes = [0]
      if (blend) for (let k = 1; k <= 4; k += 1) nodes.push((blend * k) / 4)
      // Tapers are built from short segments so the collision follows the edge (each
      // as wide as its wider end, so no curb collider ever sits inside the drawn lane).
      // (Flared tube walls likewise, so each slab's walls stand at their own angle.)
      // (A steep taper - into a single-lane girder, say - in 1 m steps, so the slab under
      // the narrowing road never sticks out far past its drawn edge.)
      const steep = Array.isArray(W) && Math.abs(W[1] - W[0]) / length > 0.25
      const step = Array.isArray(W) || (tube && tube.from !== tube.to) ? (steep ? 1 : 2) : length
      for (let d = (nodes[nodes.length - 1] || 0) + step; d < length - 0.5; d += step) nodes.push(d)
      if (nodes[nodes.length - 1] < length) nodes.push(length)
      const heightAt = (d) => {
        if (blend && d <= blend) return lastSlope * d + ((slope - lastSlope) * d * d) / (2 * blend)
        return (blend ? (lastSlope * blend + slope * blend) / 2 : 0) + slope * (d - blend)
      }
      const at = (d) => add(add(startPos, mul(fwd, d)), [0, heightAt(d), 0])
      const addCs = tube ? ribbon({ ...opts, curbs: false }, { tube: { glass: tube.glass } }) : ribbon(opts)
      const curbed = !tube && opts.curbs !== false
      const trimFirst = joinCurbs(curbed, !tube && !curbed)
      const startS = s
      const samples = []
      let travelled = 0
      let lastCsAt = -Infinity
      for (let k = 0; k < nodes.length - 1; k += 1) {
        const d0 = nodes[k]
        const d1 = nodes[k + 1]
        const a = at(d0)
        const b = at(d1)
        const w = Math.max(widthAt(W, d0 / length), widthAt(W, d1 / length))
        // A few cm of overlap at both ends: no zero-width crack at the joints.
        const slab = slabBetween(a, b, right, w, ROAD_THICKNESS, JOINT_OVERLAP)
        pushBox(slab, opts.kind || 'road', opts.grip ? { grip: opts.grip } : {})
        if (tube) tubeWalls(slab, wallAt((d0 + d1) / 2 / length), tube.glass)
        else if (opts.curbs !== false && Array.isArray(W)) taperCurbs(a, b, right, widthAt(W, d0 / length), widthAt(W, d1 / length), opts.barrier ? BARRIER_HEIGHT : CURB_HEIGHT)
        else if (opts.curbs !== false) curbs(slab, w, opts.barrier ? BARRIER_HEIGHT : CURB_HEIGHT)
        if (curbed && k === 0 && trimFirst) for (const i of lastCurbs) trimBox(i, 'start', JOINT_OVERLAP / 2 + CURB_GAP)
        const segLen = len(sub(b, a))
        // Visual cross-sections at every node (and every ~6 m on long segments); the
        // cross-section's up is the slab's, so the drawn road lies on the collider.
        const vn = Math.max(1, Math.ceil(segLen / 6))
        for (let j = k === 0 ? 0 : 1; j <= vn; j += 1) {
          const at2 = travelled + (segLen * j) / vn
          if (at2 - lastCsAt < 1e-3) continue
          const dj = d0 + ((d1 - d0) * j) / vn
          // A flared tube's walls are drawn as a smooth flare (the 2 m colliders step it).
          const wa = tube ? wallAt(dj / length) : undefined
          addCs(lerp3(a, b, j / vn), right, slab.ay, widthAt(W, dj / length), startS + at2, wa)
          lastCsAt = at2
        }
        // Path samples every ~2 m along this segment.
        const dir = norm(sub(b, a))
        const n = Math.max(1, Math.round(segLen / SAMPLE_STEP))
        for (let i = stage.path.length ? 1 : 0; i <= n; i += 1) {
          const p = lerp3(a, b, i / n)
          pushSample(p, dir, slab.ay, widthAt(W, (d0 + ((d1 - d0) * i) / n) / length))
          samples.push(stage.path[stage.path.length - 1])
          maybeSupport(p, widest(W))
        }
        travelled += segLen
      }
      pos = end
      lastSlope = slope
      tail = curbed ? { idx: lastCurbs, over: JOINT_OVERLAP / 2 } : null
      tailOpen = !tube && !curbed
      decorate(samples, widest(W), opts)
      if (tube?.coins) tubeCoins(samples, tube.coins)
      return api
    },

    /**
     * Curve of `degrees` (positive = left) at `radius`, climbing `rise` overall.
     * opts.bank: degrees of banking at the apex (eases in and out, tilting into the
     * turn); width / style / curbs as for straight.
     */
    curve(degrees, radius, rise = 0, opts = {}) {
      // (`stretch`, as for straight: wider bends, climbing as much more.)
      if (stretch !== 1 && !opts.fixed) {
        radius *= stretch
        rise *= stretch
        if (opts.coins) opts = { ...opts, coins: { ...opts.coins, n: Math.max(1, Math.round((opts.coins.n ?? 5) * stretch)) } }
      }
      // In a glass tube (`tube`), the whole profile banks with the floor. Tube coins can
      // go up the `side: 'outer'` wall, where the bend carries you.
      const tube = tubeSpec(opts)
      if (tube?.coins?.side === 'outer') tube.coins = { ...tube.coins, side: degrees > 0 ? 1 : -1 }
      const W = tube ? TUBE.floor : pieceWidth(opts)
      const total = degrees * DEG
      // A beacon tower in the middle of a spiral: `{ x, z }` of the turn's centre (left of
      // the heading for a left turn) and the heights it spans; the client draws it.
      if (opts.beacon) {
        const rt = rightOf(yaw)
        const sd = Math.sign(total)
        stage.beacons.push({ x: round(pos[0] - rt[0] * radius * sd), z: round(pos[2] - rt[2] * radius * sd), y0: round(pos[1]), y1: round(pos[1] + rise), section })
      }
      // Short slabs (2.5 m) so the flat collision slabs follow the drawn (twisting,
      // banked) road closely.
      // (`chord`: shorter slabs for a tight, banked, climbing hairpin, whose flat slabs
      // would otherwise drift from the twisting road at its edges.)
      const steps = Math.max(2, Math.ceil((Math.abs(total) * radius) / (opts.chord || 2.5)))
      const da = total / steps
      const chord = 2 * radius * Math.sin(Math.abs(da) / 2)
      const bankMax = (opts.bank || 0) * DEG * Math.sign(total)
      const bankAt = (tt) => bankMax * Math.sin(Math.PI * tt)
      const climb = rise / steps / chord
      // Collision slabs overlap a little on the outside of the bend (harmless for
      // physics); the visible road is the ribbon, mitred at every joint.
      const samples = []
      const addCs = tube ? ribbon({ ...opts, curbs: false }, { tube: { glass: tube.glass } }) : ribbon(opts)
      const wallAt = (tt) => (tube ? tube.from + (tube.to - tube.from) * tt : undefined)
      const curbed = !tube && opts.curbs !== false
      const trimFirst = joinCurbs(curbed, !tube && !curbed)
      let over = 0
      addCs(pos, rightOf(yaw), [0, 1, 0], widthAt(W, 0), s, wallAt(0))
      for (let i = 0; i < steps; i += 1) {
        const w = Math.max(widthAt(W, i / steps), widthAt(W, (i + 1) / steps))
        const extra = w * Math.abs(Math.tan(da / 2)) + 0.05
        yaw += da / 2
        const fwd = forwardOf(yaw)
        const right = banked(rightOf(yaw), fwd, bankAt((i + 0.5) / steps))
        const end = add(add(pos, mul(fwd, chord)), [0, rise / steps, 0])
        const slab = slabBetween(pos, end, right, w, ROAD_THICKNESS, extra)
        pushBox(slab, opts.kind || 'road', opts.grip ? { grip: opts.grip } : {})
        if (tube) tubeWalls(slab, wallAt((i + 0.5) / steps), tube.glass, da)
        else if (opts.curbs !== false) curbs(slab, w, opts.barrier ? BARRIER_HEIGHT : CURB_HEIGHT)
        // (On the inside of the bend a slab's end pokes past the mitre a little more.)
        over = extra / 2 + (w / 2) * Math.abs(Math.tan(da / 2))
        if (curbed && i === 0 && trimFirst) for (const k of lastCurbs) trimBox(k, 'start', over + CURB_GAP)
        const dir = norm(sub(end, pos))
        const n = Math.max(1, Math.round(chord / SAMPLE_STEP))
        for (let k = 1; k <= n; k += 1) {
          const p = lerp3(pos, end, k / n)
          pushSample(p, dir, slab.ay, w)
          samples.push(stage.path[stage.path.length - 1])
          maybeSupport(p, w)
        }
        pos = end
        yaw += da / 2
        // Joint cross-section: the mitre between this slab and the next.
        const jf = norm(add(forwardOf(yaw), [0, climb, 0]))
        const jr = banked(rightOf(yaw), jf, bankAt((i + 1) / steps))
        const ju = norm(cross(mul(jf, -1), jr))
        addCs(pos, jr, ju, widthAt(W, (i + 1) / steps), s, wallAt((i + 1) / steps))
      }
      lastSlope = climb
      tail = curbed ? { idx: lastCurbs, over } : null
      tailOpen = !tube && !curbed
      decorate(samples, widest(W), opts)
      if (tube?.coins) tubeCoins(samples, tube.coins)
      return api
    },

    /**
     * A pontoon bridge: `length` metres of separate floating planks (about `plank` m
     * long, `gap` m apart, `width` wide, no curbs) climbing `rise`. `moving(k, n)` may
     * return a spec for plank k of n to make it a moving one instead - an obstacle of
     * type 'pontoon' (`{ mode: 'tilt' | 'sink', side, ... }`, see obstacleSim) that gives
     * under you. The fixed planks are road slabs with a ribbon each, so the gaps between
     * them are real (and drawn).
     */
    pontoons(length, rise = 0, opts = {}) {
      const W = sw(opts.width || 8, opts.rawWidth === true)
      const gap = opts.gap ?? 0.8
      const n = Math.max(1, Math.round((length + gap) / ((opts.plank || 6) + gap)))
      const L = (length - gap * (n - 1)) / n
      const fwd = forwardOf(yaw)
      const right = rightOf(yaw)
      const startPos = pos
      const endPos = add(add(pos, mul(fwd, length)), [0, rise, 0])
      const at = (d) => lerp3(startPos, endPos, d / length)
      const dir = norm(sub(endPos, startPos))
      const up = norm(cross(mul(dir, -1), right))
      const startS = s
      // Path samples every ~2 m right across: the gaps are a stride, not a jump.
      const samples = []
      const ns = Math.max(1, Math.round(length / SAMPLE_STEP))
      const first = stage.path.length ? 1 : 0
      for (let i = first; i <= ns; i += 1) {
        pushSample(lerp3(startPos, endPos, i / ns), dir, up, W)
        samples.push(stage.path[stage.path.length - 1])
      }
      // The sample nearest distance d along the piece.
      const sampleAt = (d) => samples[Math.min(samples.length - 1, Math.max(0, Math.round((d / length) * ns) - first))]
      const moving = opts.moving || (() => null)
      for (let k = 0; k < n; k += 1) {
        const d0 = k * (L + gap)
        const d1 = d0 + L
        const a = at(d0)
        const b = at(d1)
        const spec = moving(k, n)
        if (spec) {
          const m = lerp3(a, b, 0.5)
          stage.obstacles.push({
            id: nextId('o'),
            type: 'pontoon',
            ...spec,
            lane: 0,
            x: round(m[0]),
            y: round(m[1]),
            z: round(m[2]),
            yaw: round(yaw),
            pitch: round(Math.asin(dir[1])),
            width: W,
            length: round(L),
            section,
            pi: sampleAt((d0 + d1) / 2).i,
            piStart: sampleAt(d0).i,
            piEnd: sampleAt(d1).i,
          })
        } else {
          // A few cm longer than drawn at each end, so no wheel ray slips off the edge.
          const slab = slabBetween(a, b, right, W, ROAD_THICKNESS, JOINT_OVERLAP)
          pushBox(slab, 'road')
          const addCs = ribbon({ style: 'planks', curbs: false }, { pontoon: true })
          addCs(a, right, slab.ay, W, startS + d0 * (len(sub(endPos, startPos)) / length))
          addCs(b, right, slab.ay, W, startS + d1 * (len(sub(endPos, startPos)) / length))
        }
      }
      pos = endPos
      lastSlope = rise / length
      tail = null
      tailOpen = false
      decorate(samples, W, { coins: opts.coins, items: opts.items })
      return api
    },

    /** No road for `length` metres: a jump. The far side is `rise` higher. */
    gap(length, rise = 0, opts = {}) {
      const fwd = forwardOf(yaw)
      const end = add(add(pos, mul(fwd, length)), [0, rise, 0])
      const dir = norm(sub(end, pos))
      const n = Math.max(1, Math.round(length / SAMPLE_STEP))
      const samples = []
      const gw = pieceWidth(opts)
      for (let i = 1; i <= n; i += 1) {
        pushSample(lerp3(pos, end, i / n), dir, [0, 1, 0], gw, !opts.bridged)
        samples.push(stage.path[stage.path.length - 1])
      }
      pos = end
      // You land off a jump: the next piece keeps its own slope from the lip.
      lastSlope = null
      tail = null
      tailOpen = false
      decorate(samples, gw, opts)
      return api
    },

    /**
     * A vertical loop of `radius`, drifting sideways by `shift` (to the right) over the
     * turn so the exit runs beside the entry instead of into it.
     */
    loop(radius = 11, opts = {}) {
      const w = opts.width || 9
      const shift = opts.shift ?? w + 5
      const fwd = forwardOf(yaw)
      const right = rightOf(yaw)
      const up0 = [0, 1, 0]
      const steps = 28
      const pointAt = (t) => {
        const a = t * Math.PI * 2
        return add(add(add(pos, mul(fwd, radius * Math.sin(a))), mul(up0, radius * (1 - Math.cos(a)))), mul(right, shift * t))
      }
      const samples = []
      // Dressed in light strips (drawn by the client): `glow`.
      const addCs = ribbon({ style: opts.style || 'asphalt' }, { curbHeight: 1.4, glow: true })
      // The surface normal round the loop points at its centre.
      const upAt = (tt) => {
        const ang = tt * Math.PI * 2
        return norm(add(mul(fwd, -Math.sin(ang)), mul(up0, Math.cos(ang))))
      }
      addCs(pointAt(0), right, upAt(0), w, s)
      for (let i = 0; i < steps; i += 1) {
        const a = pointAt(i / steps)
        const b = pointAt((i + 1) / steps)
        // Generous overlap: the loop drifts sideways, so each slab sits a little skewed
        // against the drawn road and short overlaps leave cracks at the outer edge.
        const slab = slabBetween(a, b, right, w, ROAD_THICKNESS, 2.2)
        pushBox(slab, 'loop')
        // The walls keep the short overlap (long ones would poke out past the loop's ends).
        curbs(slabBetween(a, b, right, w, ROAD_THICKNESS, 0.9), w, 1.4, 'loopwall')
        const n = 2
        for (let k = 1; k <= n; k += 1) {
          pushSample(lerp3(a, b, k / n), norm(sub(b, a)), slab.ay, w)
          samples.push(stage.path[stage.path.length - 1])
        }
        addCs(b, right, upAt((i + 1) / steps), w, s)
      }
      pos = pointAt(1)
      lastSlope = null
      tail = null
      tailOpen = false
      maybeSupport(pos, w, true)
      decorate(samples, w, opts)
      return api
    },

    /**
     * Humps: `humps` times a rounded climb of `up` metres then a rounded drop of `down`,
     * each `length` long. The height follows a cosine ease built from short segments,
     * so the slope changes smoothly (no sharp crest to launch off or land hard after);
     * at speed you still float over the top. Extra options go to the first piece.
     */
    hills(humps, { length = 36, up = 3.5, down = 2.5, width: w = 14, ...opts } = {}) {
      const N = 8
      // A straight run-in, so you meet the humps lined up (not sliding out of a bend).
      api.straight(30, 0.5, { width: [width, w] })
      const ease = (k) => (1 - Math.cos((Math.PI * k) / N)) / 2
      for (let h = 0; h < humps; h += 1) {
        for (const [rise, first] of [
          [up, h === 0],
          [-down, false],
        ]) {
          for (let k = 0; k < N; k += 1) {
            const dy = rise * (ease(k + 1) - ease(k))
            api.straight(length / N, dy, { width: w, ...(first && k === 0 ? opts : opts.style ? { style: opts.style } : {}) })
          }
        }
      }
      // ...and a straight run-out to land on.
      api.straight(30, 0.5, { width: [w, width] })
      return api
    },

    /**
     * A stunt run: the road widens to 16 m for `length` metres of clear straight - the
     * place for a ramp and a set of star rings (shared/adventure.js) - then narrows back.
     */
    stunt(length = 70, rise = 3, { exitWidth = width, ...opts } = {}) {
      api.straight(12, 0.5, { width: [width, 16] })
      const from = stage.path.length
      api.straight(length, rise, { width: 16, ...opts })
      stage.stunts.push({ from, to: stage.path.length - 1, section })
      // (`exitWidth`: narrow back to that instead of the default width - the next road's own.)
      api.straight(14, 0.5, { width: [16, exitWidth] })
      return api
    },

    /**
     * A squeeze: the road tapers down to `narrow` metres of grating, then back out.
     * `open: true` makes it a single-lane girder bridge (narrow ~4 m: one car at a time):
     * no curbs anywhere on it - tapers included, so no curb end ever faces you - just the
     * hazard lip along the edges and steel girders drawn underneath.
     */
    squeeze(length, rise = 0, { narrow = 7, style = 'grate', open = false, ...opts } = {}) {
      const third = length / 3
      const edge = open ? { curbs: false, girder: true, style } : {}
      api.straight(third, rise / 3, { width: [width, narrow], ...edge })
      api.straight(third, rise / 3, { width: narrow, style, ...edge, ...opts })
      api.straight(third, rise / 3, { width: [narrow, width], ...edge })
      return api
    },

    /**
     * The Stunt Bowl (`ARENA`): a round arena the road runs straight across - a wide
     * flat floor with two kicker ramps either side of the road, a quarter-pipe rim to
     * ride and launch off and a low wall round the top. Optional to play in; the road
     * through it is clear. `opts` as for straight (coins, ...).
     */
    arena(opts = {}) {
      roundPiece('arena', ARENA, opts)
      return api
    },

    /**
     * The sweeper deck (`SPINNER`): a round platform with a low wall, the road straight
     * across it either side of a hub, and a long sweeper arm (`spinbar`) turning about
     * the hub at bumper height - time it to slip past. `speed` (rad/s, + turns left), `phase`.
     */
    spinner({ speed = SPINNER.speed, phase = 0, knock = SPINNER.knock, ...opts } = {}) {
      const r = roundPiece('spinner', SPINNER, opts)
      const p = stage.path[r.pi]
      stage.obstacles.push({
        id: nextId('o'),
        type: 'spinbar',
        reach: SPINNER.reach,
        tail: SPINNER.tail,
        speed,
        phase,
        knock,
        lane: 0,
        x: r.c[0],
        y: r.c[1],
        z: r.c[2],
        yaw: r.yaw,
        pitch: 0,
        width: r.roadW,
        section: r.section,
        pi: p.i,
        piStart: r.piStart,
        piEnd: r.piEnd,
      })
      return api
    },

    /**
     * A checkpoint: a gate across the road, then a big flat plaza - the safe zone - with
     * the pit garage (car spin) on its left, which the next section starts from.
     */
    checkpoint(cpName, nextSection, opts = {}) {
      const length = opts.length || PLAZA.length
      const w = opts.width || PLAZA.width
      const fwd = forwardOf(yaw)
      const right = rightOf(yaw)
      const gate = [...pos]
      const index = stage.checkpoints.length
      // Close the section that ends here.
      stage.sections[section].sEnd = round(s)
      section += 1
      stage.sections.push({ index: section, name: nextSection || `Section ${section}`, sStart: round(s), sEnd: 0 })

      const end = add(pos, mul(fwd, length))
      const slab = slabBetween(pos, end, right, w, ROAD_THICKNESS)
      pushBox(slab, 'plaza')
      curbs(slab, w, 0.9, 'rail')
      const respawn = add(gate, mul(fwd, 9))
      stage.checkpoints.push({
        index,
        name: cpName,
        x: round(gate[0]),
        y: round(gate[1]),
        z: round(gate[2]),
        yaw: round(yaw),
        s: round(s),
        width: w,
        respawn: { x: round(respawn[0]), y: round(respawn[1]), z: round(respawn[2]), yaw: round(yaw) },
        length,
        // The car-spin pad, in front of the pit garage on the plaza's left side.
        kiosk: (() => {
          const k = add(add(gate, mul(fwd, length * 0.5)), mul(right, -(w / 2 - PIT.pad)))
          return { x: round(k[0]), y: round(k[1]), z: round(k[2]), yaw: round(yaw) }
        })(),
      })
      if (!opts.finish) {
        // The pit garage's solid parts: back wall, end walls, canopy pillars.
        const top = add(pos, [0, 0, 0])
        const piece = (along, out, ha, hout, h) => {
          const c = add(add(add(top, mul(fwd, along)), mul(right, -(w / 2) + out)), [0, h / 2, 0])
          return { c, h: [hout, h / 2, ha], ax: right, ay: [0, 1, 0], az: mul(fwd, -1) }
        }
        const mid = length * 0.5
        const o0 = PIT.back
        const depth = PIT.depth
        pushBox(piece(mid, o0 + 0.25, PIT.length / 2, 0.25, PIT.height), 'garage')
        for (const e of [-1, 1]) {
          pushBox(piece(mid + e * (PIT.length / 2 - 0.25), o0 + depth / 2, 0.25, depth / 2, PIT.height), 'garage')
          pushBox(piece(mid + e * (PIT.length / 2 - 0.3), o0 + depth + 1.6, 0.3, 0.3, PIT.height), 'garage')
        }
      }
      const n = Math.round(length / SAMPLE_STEP)
      const samples = []
      for (let i = 1; i <= n; i += 1) {
        const p = lerp3(pos, end, i / n)
        pushSample(p, fwd, [0, 1, 0], Math.min(w, sw(width)))
        samples.push(stage.path[stage.path.length - 1])
      }
      maybeSupport(lerp3(pos, end, 0.25), w, true)
      maybeSupport(lerp3(pos, end, 0.75), w, true)
      pos = end
      lastSlope = 0
      tail = null
      tailOpen = false
      if (nextSection) stage.signs.push({ text: nextSection, ...(() => {
        const p = add(add(end, mul(right, w / 2 - 1)), [0, 0, 0])
        return { x: round(p[0]), y: round(p[1]), z: round(p[2]), yaw: round(yaw) }
      })(), section })
      decorate(samples, Math.min(w, sw(width)), opts)
      return api
    },

    /** The finish line: the last checkpoint, with a big flat summit to celebrate on. */
    finish(finishName = 'Summit') {
      api.checkpoint(finishName, null, { length: PLAZA.finishLength, width: PLAZA.finishWidth, finish: true })
      stage.checkpoints[stage.checkpoints.length - 1].finish = true
      // The empty trailing section created by checkpoint() is the summit itself.
      stage.sections[section].sEnd = round(s)
      stage.sections[section].name = finishName
      return api
    },

    /** Finalises bounds per section (for culling and fall detection). */
    build() {
      stage.length = round(s)
      for (const sec of stage.sections) {
        sec.min = [Infinity, Infinity, Infinity]
        sec.max = [-Infinity, -Infinity, -Infinity]
      }
      const grow = (sec, x, y, z, r = 0) => {
        sec.min[0] = Math.min(sec.min[0], x - r)
        sec.min[1] = Math.min(sec.min[1], y - r)
        sec.min[2] = Math.min(sec.min[2], z - r)
        sec.max[0] = Math.max(sec.max[0], x + r)
        sec.max[1] = Math.max(sec.max[1], y + r)
        sec.max[2] = Math.max(sec.max[2], z + r)
      }
      for (const b of stage.boxes) {
        const r = Math.hypot(b.h[0], b.h[1], b.h[2])
        grow(stage.sections[b.section], b.c[0], b.c[1], b.c[2], r)
      }
      for (const sec of stage.sections) {
        sec.min = sec.min.map(round)
        sec.max = sec.max.map(round)
      }
      stage.maxAltitude = Math.max(...stage.path.map((p) => p.y))
      return stage
    },
  }
  return api
}

/** Index of the path sample nearest to (x, y, z), searching around `hint` first. */
export function nearestSample(path, x, y, z, hint = -1, window = 40) {
  let best = -1
  let bestD = Infinity
  const scan = (from, to) => {
    for (let i = Math.max(0, from); i < Math.min(path.length, to); i += 1) {
      const p = path[i]
      const d = (p.x - x) ** 2 + (p.y - y) ** 2 * 1.5 + (p.z - z) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
  }
  if (hint >= 0) scan(hint - window, hint + window)
  if (best < 0 || bestD > 400) scan(0, path.length)
  return { index: best, distSq: bestD }
}

export { add, sub, mul, dot, cross, norm, len }
