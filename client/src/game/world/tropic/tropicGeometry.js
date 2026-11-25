import { BufferAttribute, BufferGeometry, Color, Matrix4, Quaternion, Vector3 } from 'three'

import { footprintDistance, stageFootprints } from '@shared/track'

import { MeshBuilder } from '../../render/meshBuilder'
import { PATTERN as P } from '../../render/worldMaterial'
import { takePrebuilt } from '../../prep/prebuilt'
import { rng } from '../harbourGeometry'

/**
 * The Grand Tour's Tropical Island as plain geometry (no React, no GPU), laid out from the
 * stage's tropic zone (a zoneView: the whole stage plus `zone` and `decor`), deterministic:
 *
 * - The islands: a low-poly heightfield (GRID m cells) round the zone's roads - green hills
 *   following the roads, falling to the sea at the edges and away from the other zones'
 *   roads - with each road's LAGOON carved in (`decor.lagoons`: a basin round the road, its
 *   water `depth` m under the road's lowest point, so the lagoons step up road by road like
 *   terraces, with reef bars between them), sandy islands rising out of them, sand
 *   embankments under the causeways, white beaches round every shore, and the VOLCANO (a
 *   cone with a glowing crater beside the last road, whose hairpins climb its flank).
 *   Capped under every road of the map (CLEAR m under the surface out to EDGE m past its
 *   edge, rising at most SLOPE beyond), under plazas and platforms, and checked triangle by
 *   triangle along every road, like the snow zone's mountain.
 * - Palms (on the beaches and low slopes) and jungle trees (higher up), clear of every road,
 *   as instance matrices in 120 m tiles: the scenery draws only the ones near the car.
 * - Set pieces: beach huts and tiki bars (round the plazas and along the beaches, their
 *   signs in a sign atlas), boardwalk rails and stilts, rope bridges, the seaplane dock, the
 *   reef lighthouse, the waterfall cliff, the jungle tunnel of vines, the giant shell round
 *   the loop, coral heads, the volcano's crater glow and smoke.
 * - The water (`water`, a geometry of its own for the lagoon shader, tropicWater.js): every
 *   lagoon (vertex colour by depth: pale turquoise over the sand, deep blue in the middle),
 *   the waterfall's curtain and the lava streams down the volcano far below the road.
 *
 * All on the shared world material, one geometry per TILE x TILE cells of terrain (with the
 * set pieces in it), culled by distance. `heightAt(x, z)` gives the drawn ground height
 * (the water's surface over the lagoons: a car in the water counts as fallen).
 */

const GRID = 18
const TILE = 12
const MARGIN = 420
const CLEAR = 2.6
const EDGE = 2.5
const SLOPE = 1.0
const SEA = -18
/** Lagoon basin radius round its roads (m) and the shore band beyond it. */
const LAGOON_R = 150
const SHORE = 70
/** The volcano: base radius (m) and its peak above the zone's last plaza. */
const VOLCANO_R = 620
const VOLCANO_PEAK = 175

const col = (hex) => new Color(hex)
const C = {
  sand: col('#f2e4bf'),
  sandShade: col('#e6d3a6'),
  sandWet: col('#d9c79a'),
  grass: col('#5fb84a'),
  grassLight: col('#76c856'),
  jungle: col('#3f9a45'),
  jungleDark: col('#2f7f3a'),
  rock: col('#8c7f70'),
  rockLight: col('#a09382'),
  rockDark: col('#5f554b'),
  basalt: col('#3d3836'),
  basaltLight: col('#4d4744'),
  ash: col('#6a625d'),
  lava: col('#ff6a1a'),
  lavaHot: col('#ffc23a'),
  trunk: col('#8a6a48'),
  trunkDark: col('#6c5035'),
  frond: col('#3fae4a'),
  frondLight: col('#5cc65a'),
  frondDark: col('#2c8a3c'),
  coconut: col('#5a3a1c'),
  leaf: col('#2f9442'),
  leafLight: col('#46b04e'),
  wood: col('#a8794a'),
  woodDark: col('#7a5532'),
  plank: col('#b88a58'),
  thatch: col('#d8b86a'),
  thatchDark: col('#b39150'),
  rope: col('#c8a46a'),
  white: col('#f6f4ee'),
  red: col('#e2453b'),
  lamp: col('#fff2a0'),
  glass: col('#2a3a48'),
  plane: col('#f4f7fb'),
  planeStripe: col('#18c3d6'),
  float: col('#ffcf3a'),
  steel: col('#9aa4ad'),
  steelDark: col('#59626b'),
  shellA: col('#ffd9c2'),
  shellB: col('#ff9e80'),
  shellC: col('#ffefe0'),
  coralA: col('#ff6f8f'),
  coralB: col('#ff9a4a'),
  coralC: col('#c77dff'),
  vine: col('#2f7a33'),
  vineLight: col('#4a9c3f'),
  flower: col('#ff4fa0'),
  smoke: col('#d9d5d1'),
  smokeLight: col('#ebe8e5'),
  smokeDark: col('#b3ada8'),
  foam: col('#ffffff'),
  // Water (the lagoon shader's vertex colours).
  shallow: col('#8ff3e2'),
  lagoon: col('#2fd6c8'),
  deep: col('#1590c4'),
  fall: col('#bff6ff'),
}

// ---- Small helpers -------------------------------------------------------------------

const hash = (x, z) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function valueNoise(x, z) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  const a = hash(ix, iz)
  const b = hash(ix + 1, iz)
  const c = hash(ix, iz + 1)
  const d = hash(ix + 1, iz + 1)
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
}
const fbm = (x, z) => valueNoise(x, z) * 0.55 + valueNoise(x * 2.1 + 17, z * 2.1 + 5) * 0.3 + valueNoise(x * 4.3 + 3, z * 4.3 + 11) * 0.15
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** A spatial hash of points (`{x, z}`) in `cell` m cells. */
function grid(points, cell) {
  const g = new Map()
  // (Numeric cell keys: the layout asks this tens of thousands of times.)
  const key = (cx, cz) => cx * 65536 + cz
  for (const p of points) {
    const k = key(Math.floor(p.x / cell), Math.floor(p.z / cell))
    let l = g.get(k)
    if (!l) g.set(k, (l = []))
    l.push(p)
  }
  return {
    near(x, z, rad, fn) {
      const cx = Math.floor(x / cell)
      const cz = Math.floor(z / cell)
      const n = Math.ceil(rad / cell)
      for (let i = -n; i <= n; i += 1) {
        for (let j = -n; j <= n; j += 1) {
          const l = g.get(key(cx + i, cz + j))
          if (l) for (let k = 0; k < l.length; k += 1) fn(l[k])
        }
      }
    },
  }
}

/** Level right vector of a path sample. */
const rightOfSample = (p) => {
  const l = Math.hypot(p.fx, p.fz) || 1
  return [-p.fz / l, 0, p.fx / l]
}

/** A convex polygon wound so its normal faces `out`. */
function face(mb, pts, out, color, pattern = 0) {
  const u = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]]
  const v = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]]
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const p = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? [...pts].reverse() : pts
  for (let i = 1; i < p.length - 1; i += 1) mb.tri(p[0], p[i], p[i + 1], color, pattern)
}

/** An oriented box between two points, `t` thick (beams, ropes, posts). */
function beam(mb, p0, p1, t, color, pattern = 0) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
  const len = Math.hypot(d[0], d[1], d[2]) || 1
  const ay = [d[0] / len, d[1] / len, d[2] / len]
  const rr = Math.abs(ay[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  let ax = [ay[1] * rr[2] - ay[2] * rr[1], ay[2] * rr[0] - ay[0] * rr[2], ay[0] * rr[1] - ay[1] * rr[0]]
  const al = Math.hypot(ax[0], ax[1], ax[2]) || 1
  ax = [ax[0] / al, ax[1] / al, ax[2] / al]
  const az = [ax[1] * ay[2] - ax[2] * ay[1], ax[2] * ay[0] - ax[0] * ay[2], ax[0] * ay[1] - ax[1] * ay[0]]
  const all = { top: color, side: color, end: color, bottom: color }
  mb.box([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], [t / 2, len / 2, t / 2], ax, ay, az, all, { top: pattern, side: pattern, end: pattern, bottom: pattern })
}

/** An upright box on a level frame (`r` right, `f` forward): half sizes hw (along r) x hd (along f), y0..y1. */
function obox(mb, x, z, r, f, hw, hd, y0, y1, colors, patterns = {}, skip = []) {
  mb.box([x, (y0 + y1) / 2, z], [hw, (y1 - y0) / 2, hd], r, [0, 1, 0], [-f[0], 0, -f[2]], colors.isColor ? { top: colors, side: colors, end: colors, bottom: colors } : colors, patterns, { skip })
}

/** A tapered upright prism (cone when r1 = 0), n sides, from y0 (radius r0) to y1 (r1). */
function cone(mb, x, z, y0, y1, r0, r1, n, color, pattern = 0, phase = 0, alt = null) {
  for (let i = 0; i < n; i += 1) {
    const a0 = phase + (i / n) * Math.PI * 2
    const a1 = phase + ((i + 1) / n) * Math.PI * 2
    const am = (a0 + a1) / 2
    const out = [Math.cos(am), 0.3 * Math.sign(y1 - y0 || 1), Math.sin(am)]
    const p0 = [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0]
    const p1 = [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0]
    const c = alt && i % 2 ? alt : color
    if (r1 <= 0.001) face(mb, [p0, p1, [x, y1, z]], out, c, pattern)
    else face(mb, [p0, p1, [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1], [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1]], out, c, pattern)
  }
}

/** A flat disc (n-gon) at height y facing up (or down with `down`). */
function disc(mb, x, y, z, r, n, color, pattern = 0, down = false) {
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    face(mb, [[x, y, z], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r]], [0, down ? -1 : 1, 0], color, pattern)
  }
}

/** A low-poly blob (an octahedron squashed to rx/ry/rz): leaves, smoke puffs, coral heads. */
function blob(mb, x, y, z, rx, ry, rz, color, alt = color, pattern = 0) {
  const pts = [
    [x + rx, y, z],
    [x, y, z + rz],
    [x - rx, y, z],
    [x, y, z - rz],
  ]
  const top = [x, y + ry, z]
  const bot = [x, y - ry * 0.6, z]
  for (let i = 0; i < 4; i += 1) {
    const a = pts[i]
    const b = pts[(i + 1) % 4]
    const mid = [(a[0] + b[0]) / 2 - x, 0, (a[2] + b[2]) / 2 - z]
    face(mb, [a, b, top], [mid[0], ry, mid[2]], i % 2 ? alt : color, pattern)
    face(mb, [a, b, bot], [mid[0], -ry, mid[2]], alt, pattern)
  }
}

/** A rounded low-poly puff (smoke, spray): two rings of `n` round a squashed ball. */
function puff(mb, x, y, z, rad, color, alt) {
  const n = 7
  const ring = (k, ry) => Array.from({ length: n }, (_, i) => {
    const a = ((i + k * 0.5) / n) * Math.PI * 2
    return [x + Math.cos(a) * rad * (1 - Math.abs(ry) * 0.35), y + ry * rad * 0.75, z + Math.sin(a) * rad * (1 - Math.abs(ry) * 0.35)]
  })
  const lo = ring(0, -0.45)
  const hi = ring(1, 0.45)
  const top = [x, y + rad * 0.8, z]
  const bot = [x, y - rad * 0.6, z]
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n
    const out = (p) => [p[0] - x, p[1] - y, p[2] - z]
    face(mb, [lo[i], lo[j], hi[i]], out(lo[i]), i % 2 ? color : alt)
    face(mb, [lo[j], hi[j], hi[i]], out(hi[i]), color)
    face(mb, [hi[i], hi[j], top], out(hi[i]), alt)
    face(mb, [lo[j], lo[i], bot], [0, -1, 0], alt)
  }
}

/** The volcano's smoke plume: puffs rising and spreading downwind, in metres from (x, y, z). */
function plume(mb, x, y, z) {
  const rand = rng(4321)
  for (let k = 0; k < 9; k += 1) {
    const t = k / 8
    const drift = t * t * 70
    puff(mb, x + drift + (rand() - 0.5) * 10, y + 8 + k * 13, z - drift * 0.35 + (rand() - 0.5) * 10, 11 + k * 3.2, k % 2 ? C.smoke : C.smokeLight, C.smokeDark)
  }
}

// ---- The islands ---------------------------------------------------------------------

const layouts = new WeakMap()

/** The circle through three xz points: `{ x, z, r }` (null if they're in a line). */
function circleOf(a, b, c) {
  const d = 2 * (a.x * (b.z - c.z) + b.x * (c.z - a.z) + c.x * (a.z - b.z))
  if (Math.abs(d) < 1e-6) return null
  const a2 = a.x * a.x + a.z * a.z
  const b2 = b.x * b.x + b.z * b.z
  const c2 = c.x * c.x + c.z * c.z
  const x = (a2 * (b.z - c.z) + b2 * (c.z - a.z) + c2 * (a.z - b.z)) / d
  const z = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
  return { x, z, r: Math.hypot(a.x - x, a.z - z) }
}

/**
 * Where everything goes (cached per zone view): the lagoons and their levels, the volcano,
 * the terrain heights (capped and checked), `heightAt`, the trees.
 */
export function tropicLayout(view) {
  if (layouts.has(view)) return layouts.get(view)
  const { zone } = view
  const path = view.path
  const decor = view.decor || {}
  const inZone = (p) => p.section >= zone.from && p.section <= zone.to
  const zs = path.filter(inZone)
  const zFirst = zs[0].i
  const zLast = zs[zs.length - 1].i

  // The lagoons: each road's basin, its level `depth` under the lowest road sample in it.
  const lagoons = (decor.lagoons || []).map((rg, k) => {
    const pts = path.slice(rg.from, rg.to + 1).filter((p) => !p.air)
    const level = Math.min(...pts.map((p) => p.y)) - (rg.depth ?? 4.5)
    return { k, level, pts: pts.filter((p, i) => i % 3 === 0), from: rg.from, to: rg.to }
  })
  // On stilts, not on a sand embankment: boardwalks, rope bridges, palm-spring pads.
  const stilts = new Set()
  for (const list of [decor.boardwalks, decor.bridges, decor.springs, decor.docks]) for (const rg of list || []) for (let i = rg.from - 2; i <= rg.to + 2; i += 1) stilts.add(i)
  // Steep, high walls round the waterfall gap (the cliff) and the jungle tunnel.
  const steep = new Map()
  for (const rg of decor.falls || []) for (let i = rg.from - 25; i <= rg.to + 30; i += 1) steep.set(i, 2.4)
  for (const rg of decor.tunnels || []) for (let i = rg.from - 4; i <= rg.to + 4; i += 1) if (!steep.has(i)) steep.set(i, 1.6)

  // The volcano: beside the zone's last plaza, on the side away from the last road's hairpins.
  const lastCp = view.checkpoints[zone.to + 1]
  const vr = lastCp ? rightOfSample({ fx: -Math.sin(lastCp.yaw), fz: -Math.cos(lastCp.yaw) }) : [1, 0, 0]
  const vrng = (decor.volcano || [])[0]
  let side = 1
  if (vrng && lastCp) {
    // The hairpins' middle: put the cone on the other side of the plaza from it, a little back.
    const mid = path[Math.round((vrng.from + vrng.to) / 2)]
    side = (mid.x - lastCp.x) * vr[0] + (mid.z - lastCp.z) * vr[2] > 0 ? -1 : 1
  }
  const volcano = lastCp
    ? {
        x: lastCp.x + vr[0] * 400 * side + Math.sin(lastCp.yaw) * 120,
        z: lastCp.z + vr[2] * 400 * side + Math.cos(lastCp.yaw) * 120,
        base: lastCp.y - 230,
        peak: lastCp.y + VOLCANO_PEAK,
        R: VOLCANO_R,
      }
    : null

  // Bounds round the zone's roads and the volcano, snapped to the grid.
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const p of zs) {
    x0 = Math.min(x0, p.x)
    x1 = Math.max(x1, p.x)
    z0 = Math.min(z0, p.z)
    z1 = Math.max(z1, p.z)
  }
  x0 -= MARGIN
  x1 += MARGIN
  z0 -= MARGIN
  z1 += MARGIN
  if (volcano) {
    x0 = Math.min(x0, volcano.x - volcano.R)
    x1 = Math.max(x1, volcano.x + volcano.R)
    z0 = Math.min(z0, volcano.z - volcano.R)
    z1 = Math.max(z1, volcano.z + volcano.R)
  }
  x0 = Math.floor(x0 / GRID) * GRID
  z0 = Math.floor(z0 / GRID) * GRID
  const nx = Math.ceil((x1 - x0) / GRID) + 1
  const nz = Math.ceil((z1 - z0) / GRID) + 1
  x1 = x0 + (nx - 1) * GRID
  z1 = z0 + (nz - 1) * GRID

  const zsub = zs.filter((p, i) => i % 3 === 0)
  // Other zones' roads (bar the stretch where they join ours) pull the islands down.
  const osub = path.filter((p, i) => !inZone(p) && (i < zFirst - 15 || i > zLast + 15) && i % 3 === 0 && p.x > x0 - 600 && p.x < x1 + 600 && p.z > z0 - 600 && p.z < z1 + 600)
  const zGrid = grid(zsub, 100)
  const oGrid = grid(osub, 120)
  const lGrid = grid(lagoons.flatMap((l) => l.pts.map((p) => ({ x: p.x, z: p.z, k: l.k }))), 60)
  const all = grid(path.filter((p) => p.x > x0 - 200 && p.x < x1 + 200 && p.z > z0 - 200 && p.z < z1 + 200), 40)
  const fps = stageFootprints(view)

  // The waterfall gap: a chasm under the palm-spring jump and the plunge pool the falls
  // drop into (beside the jump, on its left), `pool` m deep below the jump.
  const chasms = []
  for (const rg of decor.falls || []) {
    const air = path.slice(rg.from, rg.to + 1).filter((p) => p.air)
    if (!air.length) continue
    const mid = air[Math.floor(air.length / 2)]
    const r = rightOfSample(mid)
    const off = mid.w / 2 + 11
    chasms.push({ air, mid, r, cx: mid.x - r[0] * off, cz: mid.z - r[2] * off, pool: mid.y - 32 })
  }
  // The reef lighthouse's islet: the middle of its bend.
  const islets = []
  for (const rg of decor.lighthouses || []) {
    const c = circleOf(path[rg.from], path[Math.round((rg.from + rg.to) / 2)], path[rg.to])
    if (c) islets.push({ x: c.x, z: c.z, r: 20, y: path[rg.from].y })
  }

  /** Which lagoon each path sample is in (-1: none). */
  const lagoonOf = new Int8Array(path.length).fill(-1)
  for (const l of lagoons) for (let i = l.from; i <= l.to; i += 1) lagoonOf[i] = l.k
  // The two nearest lagoons to a point (`la`, `lb`: { k, d }, k -1 if none), reused.
  const best = new Float64Array(Math.max(1, lagoons.length))
  const la = { k: -1, d: Infinity }
  const lb = { k: -1, d: Infinity }
  const nearLagoons = (x, z) => {
    best.fill(Infinity)
    lGrid.near(x, z, LAGOON_R + SHORE, (p) => {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2
      if (d < best[p.k]) best[p.k] = d
    })
    la.k = -1
    la.d = Infinity
    lb.k = -1
    lb.d = Infinity
    for (let k = 0; k < lagoons.length; k += 1) {
      const d = Math.sqrt(best[k])
      if (d < la.d) {
        lb.k = la.k
        lb.d = la.d
        la.k = k
        la.d = d
      } else if (d < lb.d) {
        lb.k = k
        lb.d = d
      }
    }
  }

  const H = new Float32Array(nx * nz)
  /** Per grid point: the lagoon whose water is drawn there (-1: none). */
  const owner = new Int8Array(nx * nz).fill(-1)
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const x = x0 + i * GRID
      const z = z0 + j * GRID
      // Distance to the zone's roads, their heights spread out, distance to other zones' roads.
      let dS = Infinity
      let wy = 0
      let ws = 0
      zGrid.near(x, z, 380, (p) => {
        const d2 = (p.x - x) ** 2 + (p.z - z) ** 2
        dS = Math.min(dS, d2)
        const w = 1 / (d2 + 900) ** 1.5
        wy += w * p.y
        ws += w
      })
      dS = Math.sqrt(dS)
      let dO = Infinity
      oGrid.near(x, z, 500, (p) => {
        dO = Math.min(dO, (p.x - x) ** 2 + (p.z - z) ** 2)
      })
      dO = Math.sqrt(dO)
      let h = SEA
      // (Near another zone's road the islands give way to it: lagoons and shores included.)
      const away = smooth(30, 220, dO - dS)
      if (ws > 0) {
        const ridge = 1 - Math.abs(2 * fbm(x / 380, z / 380) - 1)
        const hills = ridge * ridge * 130 * smooth(50, 300, dS)
        const bumps = (fbm(x / 60, z / 60) - 0.5) * 8 * smooth(10, 50, dS)
        const nat = wy / ws - 5 + hills + bumps
        const f = (1 - smooth(200, MARGIN - 20, dS)) * away
        h = SEA + (nat - SEA) * f
      }
      // The lagoons: the basin, islands in it, a shore rising to the land round it; a reef
      // bar where two basins meet.
      if (dS < LAGOON_R + SHORE && away > 0.02) nearLagoons(x, z)
      else la.k = -1
      if (la.k >= 0 && la.d < LAGOON_R + SHORE) {
        const L = lagoons[la.k]
        // No water over a road lower than the lagoon (another zone's, or the cliff road
        // below the upper lagoon): land round it instead, the road cut through.
        let dLow = Infinity
        all.near(x, z, 90, (p) => {
          if (p.y < L.level + 2.5) dLow = Math.min(dLow, Math.hypot(p.x - x, p.z - z) - p.w / 2)
        })
        const t = Math.max(smooth(LAGOON_R - 40, LAGOON_R + SHORE, la.d), 1 - smooth(20, 60, dLow))
        const isl = fbm(x / 95 + 31, z / 95 - 7)
        const bump = Math.max(0, isl - 0.56) * 70
        const inner = L.level - 1.0 - 5 * smooth(0, 70, LAGOON_R - la.d) * (1 - Math.min(1, bump / 6)) + bump
        const land = Math.max(h, L.level + 1.6)
        const before = h
        h = before + (inner * (1 - t) + land * t - before) * away
        if (dLow > 32 && away > 0.98) owner[j * nx + i] = la.k
        if (lb.k >= 0 && lb.d < LAGOON_R + SHORE) {
          const reef = 1 - smooth(8, 45, lb.d - la.d)
          const top = Math.max(L.level, lagoons[lb.k].level) + 1.3
          if (reef > 0) h = h + (Math.max(h, top) - h) * reef
        }
      }
      if (volcano) {
        const r = Math.hypot(x - volcano.x, z - volcano.z)
        if (r < volcano.R) {
          const u = r / volcano.R
          let hv = volcano.peak - (volcano.peak - volcano.base) * u ** 0.75 + (fbm(x / 45, z / 45) - 0.5) * 10 * u
          // The crater.
          if (r < 70) hv = Math.min(hv, volcano.peak - 8 - 30 * (1 - r / 70))
          h = Math.max(h, hv)
        }
      }
      for (const is of islets) {
        const d = Math.hypot(x - is.x, z - is.z)
        if (d < is.r + 25) h = Math.max(h, is.y - 3 - Math.max(0, d - is.r) * 0.25)
      }
      // Sand embankments under the causeways (not under stilts and plank bridges).
      if (owner[j * nx + i] >= 0) {
        all.near(x, z, 40, (p) => {
          if (p.air || lagoonOf[p.i] < 0 || stilts.has(p.i)) return
          const d = Math.hypot(p.x - x, p.z - z) - p.w / 2 - EDGE
          h = Math.max(h, p.y - CLEAR - Math.max(0, d) * 0.7)
        })
      }
      // Caps: under every road of the map (cuts and embankments), plazas, platforms.
      let cap = Infinity
      all.near(x, z, 150, (p) => {
        const d = Math.hypot(p.x - x, p.z - z) - p.w / 2 - EDGE
        const k = steep.get(p.i) || SLOPE
        cap = Math.min(cap, p.y - (p.air ? 6 : CLEAR) + Math.max(0, d) * k)
      })
      for (const fp of fps) {
        if (Math.abs(fp.x - x) > 400 || Math.abs(fp.z - z) > 400) continue
        cap = Math.min(cap, fp.y - CLEAR + Math.max(0, footprintDistance(fp, x, z) - 1) * SLOPE)
      }
      h = Math.min(h, cap)
      for (const ch of chasms) {
        if (Math.abs(ch.mid.x - x) > 90 || Math.abs(ch.mid.z - z) > 90) continue
        let d = Math.hypot(ch.cx - x, ch.cz - z) - 15
        for (const p of ch.air) d = Math.min(d, Math.hypot(p.x - x, p.z - z) - p.w / 2 - 8)
        h = Math.min(h, ch.pool - 1 + Math.max(0, d) * 2.2)
        // (The chasm is the falls' plunge pool's, not the upper lagoon's.)
        if (d < 12) owner[j * nx + i] = -1
      }
      // Never exactly at a lagoon's level (the water would fight the ground).
      const L = owner[j * nx + i] >= 0 ? lagoons[owner[j * nx + i]] : null
      if (L && Math.abs(h - L.level) < 0.06) h = L.level - 0.08
      H[j * nx + i] = h
    }
  }

  // Interpolation on the drawn triangles (each cell split along its (i,j)-(i+1,j+1) diagonal).
  const cellOf = (x, z) => {
    const fx = (x - x0) / GRID
    const fz = (z - z0) / GRID
    const i = Math.min(nx - 2, Math.max(0, Math.floor(fx)))
    const j = Math.min(nz - 2, Math.max(0, Math.floor(fz)))
    return { i, j, u: Math.min(1, Math.max(0, fx - i)), v: Math.min(1, Math.max(0, fz - j)) }
  }
  const tri = (c) => {
    const a = c.j * nx + c.i
    const b = a + 1
    const cc = a + nx
    const d = cc + 1
    return c.u >= c.v ? [a, b, d, 1 - c.u, c.u - c.v, c.v] : [a, d, cc, 1 - c.v, c.u, c.v - c.u]
  }
  const groundAt = (x, z) => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return SEA
    const [a, b, d, wa, wb, wd] = tri(cellOf(x, z))
    return H[a] * wa + H[b] * wb + H[d] * wd
  }
  const press = (x, z, top) => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return false
    const [a, b, d, wa, wb, wd] = tri(cellOf(x, z))
    const h = H[a] * wa + H[b] * wb + H[d] * wd
    if (h <= top) return false
    const e = h - top + 0.05
    H[a] -= e
    H[b] -= e
    H[d] -= e
    return true
  }
  // The triangle-by-triangle check: across every road (and a little past its edges), every plaza and platform.
  const probes = []
  for (const p of path) {
    if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue
    const r = rightOfSample(p)
    const half = p.w / 2 + 1.2
    const top = p.y - (p.air ? 5 : 1.0)
    for (const o of [-half, -half / 2, 0, half / 2, half]) probes.push([p.x + r[0] * o, p.z + r[2] * o, top])
  }
  for (const fp of fps) {
    if (fp.x < x0 - 60 || fp.x > x1 + 60 || fp.z < z0 - 60 || fp.z > z1 + 60) continue
    const R = (fp.radius ?? Math.hypot(fp.hl, fp.hw)) + 3
    for (let dx = -R; dx <= R; dx += 5) for (let dz = -R; dz <= R; dz += 5) if (footprintDistance(fp, fp.x + dx, fp.z + dz) < 2) probes.push([fp.x + dx, fp.z + dz, fp.y - 1.0])
  }
  for (let pass = 0; pass < 6; pass += 1) {
    let n = 0
    for (const [x, z, top] of probes) if (press(x, z, top)) n += 1
    if (!n) break
  }

  /** The water's surface under (x, z) if it's in a lagoon (else null). */
  const waterAt = (x, z) => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return null
    const c = cellOf(x, z)
    const k = owner[c.j * nx + c.i]
    return k >= 0 ? lagoons[k].level : null
  }
  /** What a falling car meets: the ground, or the lagoon's surface over it. */
  const heightAt = (x, z) => {
    const g = groundAt(x, z)
    const w = waterAt(x, z)
    return w !== null && w > g ? w : g
  }

  const out = { zone, x0, z0, x1, z1, nx, nz, H, owner, lagoons, volcano, islets, chasms, groundAt, waterAt, heightAt, zs, all, fps, stilts }
  out.trees = placeTrees(out)
  layouts.set(view, out)
  return out
}

/**
 * Palms (on the beaches and low slopes near the water, and scattered along the roads) and
 * jungle trees (on the green hills), clear of every road, plaza and the volcano's ash:
 * `{ x, y, z, s, rot, keep, kind: 'palm' | 'tree' }`.
 */
function placeTrees(L) {
  const rand = rng(5151)
  const trees = []
  const { x0, z0, x1, z1, groundAt, all, fps, lagoons, owner, nx, volcano } = L
  const STEP = 12
  for (let z = z0 + STEP; z < z1 - STEP; z += STEP) {
    for (let x = x0 + STEP; x < x1 - STEP; x += STEP) {
      const tx = x + (rand() - 0.5) * STEP * 0.9
      const tz = z + (rand() - 0.5) * STEP * 0.9
      const keep = rand()
      const s = 0.8 + rand() * 0.5
      const rot = rand() * Math.PI * 2
      const h = groundAt(tx, tz)
      if (h < 20) continue
      if (volcano && Math.hypot(tx - volcano.x, tz - volcano.z) < volcano.R * 0.62) continue
      const gx = groundAt(tx + 4, tz) - groundAt(tx - 4, tz)
      const gz = groundAt(tx, tz + 4) - groundAt(tx, tz - 4)
      const slope = Math.hypot(gx, gz) / 8
      if (slope > 0.55) continue
      // Above which lagoon's water (if any), and how high.
      const i = Math.round((tx - x0) / 18)
      const j = Math.round((tz - z0) / 18)
      const k = owner[j * nx + i]
      const above = k >= 0 ? h - lagoons[k].level : 99
      if (above < 0.6) continue
      const beach = above < 9
      // Palms thick on the beaches, a clump here and there inland; jungle trees in patches on the hills.
      const clump = fbm(tx / 140 + 40, tz / 140 - 13)
      let kind = null
      if (beach && keep < 0.85) kind = 'palm'
      else if (!beach && clump > 0.5 && keep < 0.7) kind = slope < 0.3 && clump < 0.6 ? 'palm' : 'tree'
      if (!kind) continue
      const top = h + (kind === 'palm' ? 11 : 9) * s
      let ok = true
      // (Clear of every road, and only where our roads are the nearest: no palms by the snow summit.)
      let near = Infinity
      let ours = true
      all.near(tx, tz, 80, (p) => {
        const d = Math.hypot(p.x - tx, p.z - tz) - p.w / 2
        if (d < near) {
          near = d
          ours = p.section >= L.zone.from && p.section <= L.zone.to
        }
        if (d < 5 || (d < 14 && p.y > h - 4 && p.y - 1.5 < top + 1)) ok = false
      })
      if (!ok || !ours) continue
      if (fps.some((fp) => Math.abs(fp.x - tx) < 120 && Math.abs(fp.z - tz) < 120 && footprintDistance(fp, tx, tz) < 8)) continue
      trees.push({ x: tx, y: h - 0.3, z: tz, s, rot, keep, kind })
    }
  }
  return trees
}

// ---- Trees -------------------------------------------------------------------------------

/** A palm, ~11 m tall at scale 1: a leaning, curving ringed trunk, a crown of drooping fronds and coconuts (~72 triangles). */
export function palmGeometry() {
  const mb = new MeshBuilder()
  const n = 4
  const segs = 4
  let prev = null
  const lean = (t) => [t * t * 1.8, t * 10.2, 0]
  for (let k = 0; k <= segs; k += 1) {
    const t = k / segs
    const c = lean(t)
    const r = 0.36 - 0.12 * t
    const ring = []
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + Math.PI / 4
      ring.push([c[0] + Math.cos(a) * r, c[1] - 0.4 * (k === 0 ? 1 : 0), c[2] + Math.sin(a) * r])
    }
    if (prev) {
      for (let i = 0; i < n; i += 1) {
        const a = prev[i]
        const b = prev[(i + 1) % n]
        const am = ((i + 0.5) / n) * Math.PI * 2 + Math.PI / 4
        face(mb, [a, b, ring[(i + 1) % n], ring[i]], [Math.cos(am), 0, Math.sin(am)], k % 2 ? C.trunk : C.trunkDark)
      }
    }
    prev = ring
  }
  const top = lean(1)
  // Fronds: six drooping leaves, each two quads (a bend), green both shades.
  const fronds = 6
  for (let f = 0; f < fronds; f += 1) {
    const a = (f / fronds) * Math.PI * 2 + 0.3
    const d = [Math.cos(a), 0, Math.sin(a)]
    const s = [-d[2], 0, d[0]]
    const w = 0.75
    const p0 = [top[0], top[1] + 0.2, top[2]]
    const p1 = [top[0] + d[0] * 2.6, top[1] + 0.9, top[2] + d[2] * 2.6]
    const p2 = [top[0] + d[0] * 5.0, top[1] - 1.2, top[2] + d[2] * 5.0]
    const side = (p, k) => [p[0] + s[0] * w * k, p[1], p[2] + s[2] * w * k]
    face(mb, [p0, side(p1, 1), p1], [0, 1, 0], f % 2 ? C.frond : C.frondLight)
    face(mb, [p0, p1, side(p1, -1)], [0, 1, 0], f % 2 ? C.frondLight : C.frond)
    face(mb, [side(p1, 1), p2, p1], [0, 1, 0], C.frondDark)
    face(mb, [p1, p2, side(p1, -1)], [0, 1, 0], f % 2 ? C.frond : C.frondDark)
  }
  // Coconuts under the crown.
  blob(mb, top[0] + 0.3, top[1] - 0.3, top[2], 0.35, 0.35, 0.35, C.coconut)
  blob(mb, top[0] - 0.25, top[1] - 0.35, top[2] + 0.25, 0.32, 0.32, 0.32, C.coconut)
  return mb.build()
}

/** A jungle tree, ~9 m tall at scale 1: a trunk and three lumpy leaf masses (~52 triangles). */
export function jungleTreeGeometry() {
  const mb = new MeshBuilder()
  cone(mb, 0, 0, -0.4, 5.5, 0.45, 0.3, 5, C.trunkDark)
  blob(mb, 0, 6.2, 0, 3.4, 2.6, 3.1, C.leaf, C.leafLight)
  blob(mb, 1.6, 7.6, 0.8, 2.4, 2.0, 2.2, C.leafLight, C.leaf)
  blob(mb, -1.3, 7.3, -1.0, 2.2, 1.8, 2.4, C.jungle, C.leaf)
  return mb.build()
}

/** Instance matrices of `trees` of one `kind`, grouped in 120 m tiles: `[{ x, z, matrices: Float32Array, count }]`. */
export function treeTiles(trees, density, kind) {
  const tiles = new Map()
  const m = new Matrix4()
  const q = new Quaternion()
  const p = new Vector3()
  const s = new Vector3()
  const up = new Vector3(0, 1, 0)
  for (const t of trees) {
    if (t.kind !== kind || t.keep > 0.25 + 0.75 * Math.min(1, density)) continue
    const k = `${Math.floor(t.x / 120)},${Math.floor(t.z / 120)}`
    let tile = tiles.get(k)
    if (!tile) tiles.set(k, (tile = { x: (Math.floor(t.x / 120) + 0.5) * 120, z: (Math.floor(t.z / 120) + 0.5) * 120, list: [] }))
    p.set(t.x, t.y, t.z)
    q.setFromAxisAngle(up, t.rot)
    s.setScalar(t.s)
    tile.list.push(...m.compose(p, q, s).elements)
  }
  return [...tiles.values()].map((t) => ({ x: t.x, z: t.z, matrices: new Float32Array(t.list), count: t.list.length / 16 }))
}

// ---- Set pieces --------------------------------------------------------------------------

/** Is a footprint of radius `rad` at (x, z), from y0 to y1, clear of every road (and plazas)? */
function clearOfRoads(L, x, z, rad, y0, y1, margin = 5) {
  let ok = true
  L.all.near(x, z, rad + 30, (p) => {
    if (!ok) return
    const d = Math.hypot(p.x - x, p.z - z) - p.w / 2 - rad
    if (d < margin || (d < margin + 10 && p.y > y0 - 3 && p.y - 2 < y1)) ok = false
  })
  if (!ok) return false
  return !L.fps.some((fp) => Math.abs(fp.x - x) < 150 && Math.abs(fp.z - z) < 150 && footprintDistance(fp, x, z) < rad + 3)
}

/** Names on the huts and bars (our own, fictional), in turn. */
const HUT_NAMES = [
  ['TIKI TAVI', 'COLD COCONUTS'],
  ['MANGO SHACK', 'SMOOTHIES'],
  ['THE SALTY GECKO', 'BEACH BAR'],
  ['DRIFTWOOD GRILL', 'FISH TACOS'],
  ['PINEAPPLE PETE', 'SHAVED ICE'],
  ['LAVA JAVA', 'VOLCANO COFFEE'],
  ['REEF RENTALS', 'SNORKELS · BOARDS'],
  ['SURF & TURTLE', 'SUNSET SNACKS'],
]
const HUT_COLORS = ['#18c3d6', '#ff7a1a', '#3fd97a', '#ff4f9a', '#ffc41f', '#e2453b', '#8a5cf6', '#1fb5c9']

/**
 * A beach hut / tiki bar on stilts: a plank deck, bamboo posts, a thatched hip roof, a bar
 * counter facing `f` and the name board over it (the board's text: a sign record in `signs`).
 */
function hut(mb, x, y, z, f, w, d, k, signs) {
  const r = [-f[2], 0, f[0]]
  const deck = y + 0.8
  // Stilts and deck.
  for (const sr of [-1, 1]) for (const sf of [-1, 1]) beam(mb, [x + r[0] * sr * (w / 2 - 0.3) + f[0] * sf * (d / 2 - 0.3), y - 4, z + r[2] * sr * (w / 2 - 0.3) + f[2] * sf * (d / 2 - 0.3)], [x + r[0] * sr * (w / 2 - 0.3) + f[0] * sf * (d / 2 - 0.3), deck + 3.2, z + r[2] * sr * (w / 2 - 0.3) + f[2] * sf * (d / 2 - 0.3)], 0.3, C.woodDark)
  obox(mb, x, z, r, f, w / 2 + 0.6, d / 2 + 0.6, deck - 0.3, deck, { top: C.plank, side: C.woodDark, end: C.woodDark, bottom: C.woodDark }, { top: P.PLANKS })
  // Back and side walls (woven), open at the front; the bar counter at the front.
  // (Standing on the deck: no bottom faces.)
  obox(mb, x - f[0] * (d / 2 - 0.25), z - f[2] * (d / 2 - 0.25), r, f, w / 2 - 0.3, 0.15, deck, deck + 2.6, C.thatchDark, { side: P.PLANKS, end: P.PLANKS }, ['bottom'])
  for (const s of [-1, 1]) obox(mb, x + r[0] * s * (w / 2 - 0.45), z + r[2] * s * (w / 2 - 0.45), r, f, 0.15, d / 2 - 0.4, deck, deck + 2.6, C.thatchDark, { side: P.PLANKS, end: P.PLANKS }, ['bottom'])
  obox(mb, x + f[0] * (d / 2 - 0.6), z + f[2] * (d / 2 - 0.6), r, f, w / 2 - 0.5, 0.35, deck, deck + 1.1, { top: C.wood, side: C.woodDark, end: C.woodDark, bottom: C.woodDark }, { side: P.PLANKS }, ['bottom'])
  // Hip roof of thatch.
  const ey = deck + 3.2
  const ry = ey + 2.2
  const W = w / 2 + 1.1
  const D = d / 2 + 1.1
  const P4 = (sr, sf, yy) => [x + r[0] * sr + f[0] * sf, yy, z + r[2] * sr + f[2] * sf]
  const apexA = P4(0, -D * 0.25, ry)
  const apexB = P4(0, D * 0.25, ry)
  face(mb, [P4(-W, -D, ey), P4(-W, D, ey), apexB, apexA], [-r[0], 0.8, -r[2]], C.thatch, P.PLANKS)
  face(mb, [P4(W, -D, ey), P4(W, D, ey), apexB, apexA], [r[0], 0.8, r[2]], C.thatchDark, P.PLANKS)
  face(mb, [P4(-W, D, ey), P4(W, D, ey), apexB], [f[0], 0.8, f[2]], C.thatch, P.PLANKS)
  face(mb, [P4(-W, -D, ey), P4(W, -D, ey), apexA], [-f[0], 0.8, -f[2]], C.thatchDark, P.PLANKS)
  face(mb, [P4(-W, -D, ey - 0.02), P4(W, -D, ey - 0.02), P4(W, D, ey - 0.02), P4(-W, D, ey - 0.02)], [0, -1, 0], C.woodDark)
  // Name board over the counter (a sign of the atlas, a few cm in front of its backing).
  const by = ey - 0.65
  const bx = x + f[0] * (D + 0.05)
  const bz = z + f[2] * (D + 0.05)
  obox(mb, bx - f[0] * 0.1, bz - f[2] * 0.1, r, f, Math.min(w / 2 + 0.2, 2.6), 0.08, by - 0.55, by + 0.55, C.woodDark)
  const [text, sub] = HUT_NAMES[k % HUT_NAMES.length]
  signs.push({ text, sub, center: [bx + f[0] * 0.02, by, bz + f[2] * 0.02], right: [-r[0], 0, -r[2]], up: [0, 1, 0], width: Math.min(w + 0.2, 5.0), height: 1.0, bg: HUT_COLORS[k % HUT_COLORS.length] })
  // Tiki torches either side of the front.
  for (const s of [-1, 1]) {
    const tx = x + r[0] * s * (W + 0.4) + f[0] * (D + 0.4)
    const tz = z + r[2] * s * (W + 0.4) + f[2] * (D + 0.4)
    beam(mb, [tx, y - 1, tz], [tx, deck + 2.2, tz], 0.18, C.woodDark)
    cone(mb, tx, tz, deck + 2.2, deck + 2.9, 0.22, 0.02, 5, C.lavaHot, P.GLOW)
  }
}

/** Beach huts and tiki bars: beside each of the zone's plazas, and now and then on a beach by the road. */
function huts(view, L, place, signs) {
  const rand = rng(2468)
  const spots = []
  for (let c = view.zone.from; c <= view.zone.to + 1; c += 1) {
    const cp = view.checkpoints[c]
    if (!cp || !cp.length) continue
    const f = [-Math.sin(cp.yaw), 0, -Math.cos(cp.yaw)]
    const r = [-f[2], 0, f[0]]
    // On the plaza's right (the pit garage is on its left), facing across it.
    const along = cp.length * (0.3 + rand() * 0.4)
    const out = cp.width / 2 + 8 + rand() * 3
    spots.push({ x: cp.x + f[0] * along + r[0] * out, z: cp.z + f[2] * along + r[2] * out, f: [-r[0], 0, -r[2]] })
  }
  let next = 200
  for (const p of L.zs) {
    if (p.s < next || p.air) continue
    next = p.s + 320 + rand() * 200
    const r = rightOfSample(p)
    const side = rand() < 0.5 ? -1 : 1
    const off = p.w / 2 + 14 + rand() * 8
    spots.push({ x: p.x + r[0] * off * side, z: p.z + r[2] * off * side, f: [-r[0] * side, 0, -r[2] * side] })
  }
  let k = 0
  for (const s of spots) {
    const w = 5.5 + rand() * 1.5
    const d = 4.5 + rand() * 1.5
    const g = L.groundAt(s.x, s.z)
    const water = L.waterAt(s.x, s.z)
    const y = Math.max(g, water !== null ? water + 0.6 : g)
    if (y < 20 || !clearOfRoads(L, s.x, s.z, Math.hypot(w, d) / 2 + 1.8, y - 2, y + 7, 4)) continue
    hut(place(s.x, s.z), s.x, y, s.z, s.f, w, d, k, signs)
    k += 1
  }
}

/** Posts and rope rails along the boardwalks and rope bridges, stilts down to the water or ground. */
function boardwalks(view, L, place) {
  const path = view.path
  const ranges = [...(view.decor.boardwalks || []).map((r) => ({ ...r, rope: false })), ...(view.decor.bridges || []).map((r) => ({ ...r, rope: true }))]
  for (const rg of ranges) {
    let last = null
    for (let i = rg.from; i <= rg.to; i += 2) {
      const p = path[i]
      if (p.air) continue
      const r = rightOfSample(p)
      const posts = []
      for (const s of [-1, 1]) {
        const off = p.w / 2 + 0.25
        const x = p.x + r[0] * off * s
        const z = p.z + r[2] * off * s
        posts.push([x, p.y, z])
      }
      const mb = place(p.x, p.z)
      const tall = rg.rope && (i === rg.from || i + 2 > rg.to)
      for (const q of posts) {
        beam(mb, [q[0], q[1] - 0.6, q[2]], [q[0], q[1] + (tall ? 2.4 : 1.2), q[2]], tall ? 0.32 : 0.2, C.woodDark)
        // Stilts down to the water or the ground, every other post.
        if ((i - rg.from) % 4 === 0) {
          const g = Math.max(L.groundAt(q[0], q[2]), L.waterAt(q[0], q[2]) ?? -Infinity)
          if (q[1] - 1.2 - g > 0.4) beam(mb, [q[0], g - 1, q[2]], [q[0], q[1] - 1.2, q[2]], 0.34, C.woodDark)
        }
      }
      if (last) {
        for (let s = 0; s < 2; s += 1) {
          const a = last[s]
          const b = posts[s]
          // Rope bridges: two ropes a side; boardwalks: one rail.
          const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
          beam(place(mid[0], mid[2]), [a[0], a[1] + 1.1, a[2]], [b[0], b[1] + 1.1, b[2]], 0.09, rg.rope ? C.rope : C.wood)
          if (rg.rope) beam(place(mid[0], mid[2]), [a[0], a[1] + 0.55, a[2]], [b[0], b[1] + 0.55, b[2]], 0.07, C.rope)
        }
      }
      last = posts
    }
  }
}

/** The seaplane dock: a pier out into the lagoon beside the dock's rope bridge, a seaplane moored to it, a little office. */
function seaplaneDock(view, L, place, signs) {
  const path = view.path
  for (const rg of view.decor.docks || []) {
    const p = path[Math.round((rg.from + rg.to) / 2)]
    const r = rightOfSample(p)
    const f = [p.fx, 0, p.fz]
    const fl = Math.hypot(f[0], f[2]) || 1
    f[0] /= fl
    f[2] /= fl
    // Whichever side has open water.
    let side = 1
    for (const s of [1, -1]) {
      const x = p.x + r[0] * 40 * s
      const z = p.z + r[2] * 40 * s
      if ((L.waterAt(x, z) ?? -Infinity) > L.groundAt(x, z)) {
        side = s
        break
      }
    }
    const water = L.waterAt(p.x + r[0] * 30 * side, p.z + r[2] * 30 * side)
    if (water === null) continue
    const y = water + 1.0
    const start = p.w / 2 + 6
    const len = 34
    const sx = p.x + r[0] * side * start
    const sz = p.z + r[2] * side * start
    const ex = p.x + r[0] * side * (start + len)
    const ez = p.z + r[2] * side * (start + len)
    const mb = place((sx + ex) / 2, (sz + ez) / 2)
    const rr = [r[0] * side, 0, r[2] * side]
    // The pier: planks on posts.
    obox(mb, (sx + ex) / 2, (sz + ez) / 2, f, rr, 1.8, len / 2, y - 0.3, y, { top: C.plank, side: C.woodDark, end: C.woodDark, bottom: C.woodDark }, { top: P.PLANKS })
    for (let k = 0; k <= 6; k += 1) {
      const t = k / 6
      for (const s of [-1, 1]) {
        const x = sx + (ex - sx) * t + f[0] * 1.6 * s
        const z = sz + (ez - sz) * t + f[2] * 1.6 * s
        beam(mb, [x, water - 2, z], [x, y + 0.9, z], 0.3, C.woodDark)
      }
    }
    // The office at the pier's root: a little hut.
    const ox = sx + rr[0] * 4 - f[0] * 6
    const oz = sz + rr[2] * 4 - f[2] * 6
    if (clearOfRoads(L, ox, oz, 4, y - 2, y + 6, 3)) {
      signs.push({ text: 'SKYLAGOON AIR', sub: 'SEAPLANE TOURS', center: [ox + rr[0] * 2.62, y + 2.6, oz + rr[2] * 2.62], right: [f[0], 0, f[2]], up: [0, 1, 0], width: 4.2, height: 0.9, bg: '#18c3d6' })
      obox(mb, ox, oz, f, rr, 2.4, 2.5, y - 0.3, y + 3.3, { top: C.white, side: C.white, end: C.white, bottom: C.woodDark }, { side: P.FACADE, end: P.FACADE }, ['bottom'])
      obox(mb, ox, oz, f, rr, 2.9, 3.0, y + 3.3, y + 3.6, C.planeStripe)
    }
    // The seaplane, moored along the pier's far half: floats, fuselage, high wing, tail, propeller.
    const px = sx + (ex - sx) * 0.7 + f[0] * 6.5
    const pz = sz + (ez - sz) * 0.7 + f[2] * 6.5
    const pa = rr
    const pb = [-pa[2], 0, pa[0]]
    const at = (u, v) => [px + pa[0] * u + pb[0] * v, pz + pa[2] * u + pb[2] * v]
    for (const v of [-1.6, 1.6]) {
      const [cx, cz] = at(0, v)
      obox(mb, cx, cz, pb, pa, 0.4, 4.2, water - 0.2, water + 0.45, C.float)
      beam(mb, [cx, water + 0.45, cz], [px + pb[0] * v * 0.4, water + 1.6, pz + pb[2] * v * 0.4], 0.12, C.steelDark)
    }
    obox(mb, px, pz, pb, pa, 0.75, 3.6, water + 1.5, water + 2.9, { top: C.plane, side: C.plane, end: C.plane, bottom: C.planeStripe })
    const [cx, cz] = at(2.4, 0)
    obox(mb, cx, cz, pb, pa, 0.7, 0.9, water + 2.2, water + 2.85, C.glass)
    obox(mb, px + pa[0] * 1.6, pz + pa[2] * 1.6, pb, pa, 5.6, 0.75, water + 3.0, water + 3.2, { top: C.plane, side: C.planeStripe, end: C.planeStripe, bottom: C.plane })
    const [tx, tz] = at(-4.4, 0)
    obox(mb, tx, tz, pb, pa, 0.35, 0.9, water + 1.9, water + 2.5, C.plane)
    obox(mb, tx, tz, pb, pa, 1.8, 0.45, water + 2.5, water + 2.62, C.plane)
    obox(mb, tx - pa[0] * 0.3, tz - pa[2] * 0.3, pb, pa, 0.08, 0.5, water + 2.62, water + 3.8, C.planeStripe, {}, ['bottom'])
    const [nx2, nz2] = at(3.75, 0)
    obox(mb, nx2, nz2, pb, pa, 0.12, 0.12, water + 1.6, water + 2.8, C.steelDark)
  }
}

/** The reef lighthouse: a white tower banded red on its islet in the middle of the reef bend. */
function lighthouse(L, place) {
  for (const is of L.islets) {
    const g = L.groundAt(is.x, is.z)
    const mb = place(is.x, is.z)
    cone(mb, is.x, is.z, g - 2, g + 2.2, 7.5, 6.5, 9, C.rockDark, 0, 0, C.rock)
    const base = g + 2.2
    const top = base + 30
    const band = 5
    for (let y = base, k = 0; y < top - 0.01; y += band, k += 1) cone(mb, is.x, is.z, y, Math.min(top, y + band), 3.2 - (y - base) * 0.03, 3.2 - (Math.min(top, y + band) - base) * 0.03, 10, k % 2 ? C.red : C.white)
    disc(mb, is.x, top, is.z, 3.2, 10, C.steelDark)
    cone(mb, is.x, is.z, top, top + 0.5, 3.6, 3.6, 10, C.steelDark)
    cone(mb, is.x, is.z, top + 0.5, top + 3.6, 1.8, 1.8, 10, C.lamp, P.PULSE)
    cone(mb, is.x, is.z, top + 3.6, top + 5.6, 2.3, 0, 10, C.red)
    // A little keeper's hut and coral round the islet.
    obox(mb, is.x + 6, is.z + 2, [1, 0, 0], [0, 0, 1], 1.8, 1.6, g - 1, g + 3.6, { top: C.red, side: C.white, end: C.white, bottom: C.white }, {}, ['bottom'])
  }
}

/** Coral heads breaking the surface along the reef road, and some round the lighthouse islet. */
function coralHeads(view, L, place) {
  const rand = rng(1357)
  const colors = [C.coralA, C.coralB, C.coralC]
  const path = view.path
  const spots = []
  for (const rg of [...(view.decor.reefs || []), ...(view.decor.lighthouses || [])]) {
    for (let i = rg.from; i <= rg.to; i += 6) {
      const p = path[i]
      const r = rightOfSample(p)
      for (const s of [-1, 1]) {
        const off = p.w / 2 + 6 + rand() * 18
        spots.push([p.x + r[0] * off * s, p.z + r[2] * off * s])
      }
    }
  }
  for (const [x, z] of spots) {
    const w = L.waterAt(x, z)
    const g = L.groundAt(x, z)
    if (w === null || g > w - 0.3) continue
    if (!clearOfRoads(L, x, z, 2, g, w + 2, 3)) continue
    const mb = place(x, z)
    const c = colors[Math.floor(rand() * colors.length)]
    for (let k = 0; k < 3; k += 1) cone(mb, x + (rand() - 0.5) * 2.5, z + (rand() - 0.5) * 2.5, g, w + 0.4 + rand() * 0.9, 0.5 + rand() * 0.4, 0.15, 5, c, 0, rand())
  }
}

/**
 * The waterfall gap: tall basalt rock walls either side of where the palm spring lands
 * (the gap in the cliff), and the waterfall's curtain beside the jump - returned for the
 * water geometry: `{ x, z, top, bottom, ax, az, w }` (ax/az: the curtain's across direction).
 */
function waterfallGap(view, L, place) {
  const path = view.path
  const falls = []
  const rand = rng(8642)
  for (const ch of L.chasms) {
    const { mid, r } = ch
    const rg = (view.decor.falls || []).find((f) => mid.i >= f.from && mid.i <= f.to)
    const land = path[Math.min(path.length - 1, rg.to + 4)]
    const f = [mid.fx, 0, mid.fz]
    const fl = Math.hypot(f[0], f[2]) || 1
    f[0] /= fl
    f[2] /= fl
    // Rock walls either side of the landing: the gap in the cliff.
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k += 1) {
        const along = 6 + k * 10
        const off = land.w / 2 + 6 + k * 1.5 + rand() * 1.5
        const x = land.x + f[0] * along + r[0] * off * s
        const z = land.z + f[2] * along + r[2] * off * s
        const g = Math.min(L.groundAt(x, z), land.y - 4)
        const top = land.y + 18 + rand() * 10
        cone(place(x, z), x, z, g - 6, top, 5.5 + rand(), 2.5 + rand(), 6, k % 2 ? C.rock : C.rockLight, 0, rand(), C.rockDark)
        cone(place(x, z), x, z, top, top + 2.5, 2.8, 0.6, 6, C.jungle, 0, 0, C.leaf)
      }
    }
    // The waterfall: from the upper lagoon's level beside the landing, down past the jump.
    const s = -1
    const cx = ch.cx
    const cz = ch.cz
    const upper = L.lagoons.find((l) => l.from > rg.to)
    const top = upper ? upper.level + 0.4 : land.y - 2
    const bottom = ch.pool
    // (`out`: the way the curtain faces and bows, towards the road.)
    falls.push({ x: cx, z: cz, top, bottom, ax: f[0], az: f[2], w: 17, out: [-r[0] * s, 0, -r[2] * s] })
    // Rocks either side of the curtain, and the lip it pours over.
    const mb = place(cx, cz)
    for (const e of [-1, 1]) {
      const x = cx + f[0] * 10.5 * e
      const z = cz + f[2] * 10.5 * e
      cone(mb, x, z, bottom - 2, top + 3, 4.5, 3.2, 6, C.rock, 0, 0.4, C.rockDark)
      cone(mb, x, z, top + 3, top + 5, 3.4, 1, 6, C.jungle, 0, 0.4, C.leaf)
    }
    obox(mb, cx + r[0] * s * 2.6, cz + r[2] * s * 2.6, [f[0], 0, f[2]], [r[0] * s, 0, r[2] * s], 10.2, 2.4, bottom, top - 0.25, { top: C.jungle, side: C.rockDark, end: C.rock, bottom: C.rockDark })
    // Spray at the foot: white puffs.
    for (let k = 0; k < 5; k += 1) puff(mb, cx + f[0] * (k - 2) * 2.6 - r[0] * s * 3.5, bottom + 1.5 + rand(), cz + f[2] * (k - 2) * 2.6 - r[2] * s * 3.5, 2.6, C.foam, C.shellC)
  }
  return falls
}

/** The jungle tunnel: arches of vine-wrapped trunks over the road, hanging vines, a leafy canopy and flowers. */
function jungleTunnel(view, L, place) {
  const path = view.path
  const rand = rng(9753)
  for (const rg of view.decor.tunnels || []) {
    let k = 0
    for (let i = rg.from; i <= rg.to; i += 3) {
      const p = path[i]
      const r = rightOfSample(p)
      const half = p.w / 2 + 1.0
      const mb = place(p.x, p.z)
      const L0 = [p.x - r[0] * half, p.y, p.z - r[2] * half]
      const R0 = [p.x + r[0] * half, p.y, p.z + r[2] * half]
      const crown = 9.2
      if (k % 2 === 0) {
        // Trunks either side and an arch of vine over the top (above the drivable height).
        for (const q of [L0, R0]) beam(mb, [q[0], q[1] - 3, q[2]], [q[0], q[1] + crown - 1.5, q[2]], 0.7, C.trunkDark)
        const arch = (t) => {
          const a = Math.PI * t
          const lat = -Math.cos(a) * half
          return [p.x + r[0] * lat, p.y + crown - 1.5 + Math.sin(a) * 2.2, p.z + r[2] * lat]
        }
        for (let s = 0; s < 4; s += 1) beam(mb, arch(s / 4), arch((s + 1) / 4), s % 2 ? 0.55 : 0.62, s % 2 ? C.vine : C.vineLight)
        // Hanging vines, ending well above a car's roof.
        for (const t of [0.2, 0.42, 0.63, 0.85]) {
          const top = arch(t)
          const len = 1.6 + rand() * 1.8
          beam(mb, top, [top[0], top[1] - len, top[2]], 0.12, C.vineLight)
          if (rand() < 0.5) blob(mb, top[0], top[1] - len, top[2], 0.3, 0.3, 0.3, C.flower)
        }
        // Leaf clumps on the arch.
        // (Each a little different in size and height: no two faces ever coplanar.)
        for (const t of [0.1, 0.5, 0.9]) {
          const q = arch(t)
          blob(mb, q[0], q[1] + 0.8 + rand() * 0.5, q[2], 2.2 + rand() * 0.5, 1.3 + rand() * 0.3, 1.9 + rand() * 0.4, C.leaf, C.leafLight)
        }
      } else {
        // Between arches: canopy leaf masses over each side (a gap of sky in the middle).
        for (const s of [-1, 1]) {
          const q = [p.x + r[0] * (half - 1.2) * s, p.y + crown + 0.2 + rand() * 0.5, p.z + r[2] * (half - 1.2) * s]
          blob(mb, q[0], q[1], q[2], 2.8 + rand() * 0.5, 1.3 + rand() * 0.3, 2.4 + rand() * 0.5, C.jungle, C.leaf)
        }
      }
      k += 1
    }
  }
}

/**
 * The giant shell round the loop: an open clam - two fluted scallop valves standing either
 * side of the loop, each turned to face the oncoming cars (the shell opens towards you),
 * pink and cream ribs, clear of the loop's whole width and drift - with its hinge behind.
 */
function giantShell(view, L, place) {
  const path = view.path
  for (const rg of view.decor.shells || []) {
    const a = path[rg.from]
    const b = path[rg.to]
    const f = [a.fx, 0, a.fz]
    const fl = Math.hypot(f[0], f[2]) || 1
    f[0] /= fl
    f[2] /= fl
    const r = rightOfSample(a)
    // The loop runs from `a`, drifting right to `b`; it reaches `radius` ahead of and behind `a`.
    const shift = (b.x - a.x) * r[0] + (b.z - a.z) * r[2]
    const top = Math.max(...path.slice(rg.from, rg.to + 1).map((p) => p.y))
    const R = (top - a.y) / 2 + 8
    const turn = 0.6
    for (const s of [-1, 1]) {
      // The valve's horizontal axis: along the road, turned so its near end swings outwards.
      const d = [f[0] * Math.cos(turn) - r[0] * s * Math.sin(turn), 0, f[2] * Math.cos(turn) - r[2] * s * Math.sin(turn)]
      const nrm = [-d[2] * s, 0, d[0] * s]
      const clear = (s > 0 ? shift + a.w / 2 : a.w / 2) + 4
      const lat = s * (clear + R * Math.sin(turn)) + (s > 0 ? 0 : 0)
      const ox = a.x + r[0] * lat
      const oz = a.z + r[2] * lat
      const mb = place(ox, oz)
      const n = 14
      const pt = (t, k, push = 0) => {
        const ang = Math.PI * (t / n)
        const u = -Math.cos(ang) * R * k
        return [ox + d[0] * u + nrm[0] * push, a.y - 1 + Math.sin(ang) * R * k * 1.1, oz + d[2] * u + nrm[2] * push]
      }
      // Faces towards the road (the inside of the clam) and away from it.
      const inward = [-r[0] * s, 0, -r[2] * s]
      const toIn = nrm[0] * inward[0] + nrm[2] * inward[2] > 0 ? 1 : -1
      for (let t = 0; t < n; t += 1) {
        const rib = t % 2 ? 0.9 : 0
        const ridge = t % 2 ? C.shellB : C.shellA
        const inner = [pt(t, 0.1, 0.4 * toIn), pt(t, 1, (0.4 + rib) * toIn), pt(t + 1, 1, (0.4 + rib) * toIn), pt(t + 1, 0.1, 0.4 * toIn)]
        const outer = [pt(t, 0.1, -0.4 * toIn), pt(t, 1, (-0.4 - rib) * toIn), pt(t + 1, 1, (-0.4 - rib) * toIn), pt(t + 1, 0.1, -0.4 * toIn)]
        face(mb, [inner[0], inner[1], inner[2]], [nrm[0] * toIn, 0, nrm[2] * toIn], t % 2 ? C.shellC : C.shellA)
        face(mb, [inner[0], inner[2], inner[3]], [nrm[0] * toIn, 0, nrm[2] * toIn], t % 2 ? C.shellC : C.shellA)
        face(mb, [outer[0], outer[1], outer[2]], [-nrm[0] * toIn, 0, -nrm[2] * toIn], ridge)
        face(mb, [outer[0], outer[2], outer[3]], [-nrm[0] * toIn, 0, -nrm[2] * toIn], ridge)
        // The rim between the two faces.
        const ang = Math.PI * ((t + 0.5) / n)
        face(mb, [inner[1], inner[2], outer[2], outer[1]], [-Math.cos(ang) * d[0], Math.sin(ang), -Math.cos(ang) * d[2]], C.shellB)
      }
      // The hinge knuckle at the valve's foot, and a pearl on the far side's.
      cone(mb, ox, oz, a.y - 5, a.y + 2, 3.4, 2.4, 7, C.shellB, 0, 0, C.shellA)
      if (s > 0) puff(mb, ox, a.y + 4.2, oz, 2.2, C.white, C.shellC)
    }
  }
}

/** The volcano's crater: a glowing lava pool at the bottom, a rim of dark rock, smoke rising. */
function crater(L, place) {
  const v = L.volcano
  if (!v) return
  const mb = place(v.x, v.z)
  const floor = L.groundAt(v.x, v.z)
  disc(mb, v.x, floor + 0.6, v.z, 34, 12, C.lava, P.GLOW)
  disc(mb, v.x, floor + 0.7, v.z, 16, 8, C.lavaHot, P.PULSE)
  plume(mb, v.x, v.peak, v.z)
}

/**
 * Lava streams down the volcano's flanks, well below the road: from a few vents part way up
 * the cone, down the steepest way to its foot. Returned as polylines `[{ pts: [[x, y, z, w]] }]`
 * for the water geometry (flowing lava, self-lit).
 */
function lavaStreams(L) {
  const v = L.volcano
  if (!v) return []
  const out = []
  const vents = 10
  for (let k = 0; k < vents; k += 1) {
    // Vents low on the cone (well under the hairpins), all round it.
    const a = (k / vents) * Math.PI * 2 + 0.4
    let x = v.x + Math.cos(a) * v.R * (0.5 + (k % 3) * 0.06)
    let z = v.z + Math.sin(a) * v.R * (0.5 + (k % 3) * 0.06)
    let below = Infinity
    L.all.near(x, z, 260, (p) => {
      below = Math.min(below, p.y - L.groundAt(x, z))
    })
    if (below < 35) continue
    const pts = []
    for (let step = 0; step < 90; step += 1) {
      const g = L.groundAt(x, z)
      // Clear of every road above it by 25 m, and never under one.
      let ok = true
      L.all.near(x, z, 40, (p) => {
        if (Math.hypot(p.x - x, p.z - z) < p.w / 2 + 25 && p.y - g < 40) ok = false
      })
      if (!ok) break
      pts.push([x, g, z, 5 + Math.min(1, step / 30) * 6])
      const gx = L.groundAt(x + 3, z) - L.groundAt(x - 3, z)
      const gz = L.groundAt(x, z + 3) - L.groundAt(x, z - 3)
      const gl = Math.hypot(gx, gz)
      if (gl < 0.05 || Math.hypot(x - v.x, z - v.z) > v.R * 0.95) break
      x -= (gx / gl) * 8
      z -= (gz / gl) * 8
    }
    if (pts.length > 5) out.push({ pts })
  }
  return out
}

// ---- The water (lagoons, waterfall, lava) ---------------------------------------------------

/**
 * The water geometry for the lagoon shader (tropicWater.js): position, colour (depth-shaded
 * water, the falls' foam, the lava's glow) and `aWater` = (kind, u, v): kind 0 lagoon, 1
 * waterfall (u across, v down, metres), 2 lava (v along the stream). Triangles only where
 * water shows; a little above the ground everywhere (never coplanar with it).
 */
function buildWater(L, falls, streams) {
  const pos = []
  const color = []
  const water = []
  const push = (p, c, k, u, v) => {
    pos.push(p[0], p[1], p[2])
    color.push(c.r, c.g, c.b)
    water.push(k, u, v)
  }
  const { x0, z0, nx, nz, H, owner, lagoons } = L
  const _c = new Color()
  const tint = (depth) => {
    if (depth < 1.5) return _c.copy(C.shallow).lerp(C.lagoon, smooth(0, 1.5, depth))
    return _c.copy(C.lagoon).lerp(C.deep, smooth(1.5, 7, depth))
  }
  for (let j = 0; j < nz - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const a = j * nx + i
      const k = owner[a]
      if (k < 0) continue
      const level = lagoons[k].level
      const hs = [H[a], H[a + 1], H[a + nx], H[a + nx + 1]]
      if (Math.min(...hs) >= level) continue
      const x = x0 + i * GRID
      const z = z0 + j * GRID
      const corners = [
        [x, z, hs[0]],
        [x + GRID, z, hs[1]],
        [x, z + GRID, hs[2]],
        [x + GRID, z + GRID, hs[3]],
      ]
      const v = corners.map(([cx, cz, h]) => ({ p: [cx, level, cz], c: tint(level - h).clone() }))
      // (A, D, B) and (A, C, D), facing up, like the terrain's split.
      for (const [p, q, r] of [
        [v[0], v[3], v[1]],
        [v[0], v[2], v[3]],
      ]) {
        push(p.p, p.c, 0, 0, 0)
        push(q.p, q.c, 0, 0, 0)
        push(r.p, r.c, 0, 0, 0)
      }
    }
  }
  // Waterfall curtains: a slightly bowed sheet from the lip to the pool, in strips.
  for (const fa of falls) {
    const n = 8
    const rows = 6
    const ax = [fa.ax, 0, fa.az]
    for (let row = 0; row < rows; row += 1) {
      const t0 = row / rows
      const t1 = (row + 1) / rows
      const y0 = fa.top + (fa.bottom - fa.top) * t0
      const y1 = fa.top + (fa.bottom - fa.top) * t1
      const bow = (t) => Math.sin(Math.PI * t) * 1.6 + t * 2.5
      for (let c = 0; c < n; c += 1) {
        const u0 = (c / n - 0.5) * fa.w
        const u1 = ((c + 1) / n - 0.5) * fa.w
        const P = (u, t, y) => [fa.x + ax[0] * u + fa.out[0] * bow(t), y, fa.z + ax[2] * u + fa.out[2] * bow(t)]
        const A = P(u0, t0, y0)
        const B = P(u1, t0, y0)
        const Cc = P(u1, t1, y1)
        const D = P(u0, t1, y1)
        const d0 = fa.top - y0
        const d1 = fa.top - y1
        // Facing out (towards the road).
        const nrm = [fa.out[0], 0, fa.out[2]]
        const tri3 = (p, q, r, vp, vq, vr, up, uq, ur) => {
          const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
          const e2 = [r[0] - p[0], r[1] - p[1], r[2] - p[2]]
          const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
          if (nn[0] * nrm[0] + nn[2] * nrm[2] < 0) {
            push(p, C.fall, 1, up, vp)
            push(r, C.fall, 1, ur, vr)
            push(q, C.fall, 1, uq, vq)
          } else {
            push(p, C.fall, 1, up, vp)
            push(q, C.fall, 1, uq, vq)
            push(r, C.fall, 1, ur, vr)
          }
        }
        tri3(A, B, Cc, d0, d0, d1, u0, u1, u1)
        tri3(A, Cc, D, d0, d1, d1, u0, u1, u0)
      }
    }
    // A foaming pool at the foot.
    const pool = (fa.bottom + 0.5)
    for (let k = 0; k < 10; k += 1) {
      const a0 = (k / 10) * Math.PI * 2
      const a1 = ((k + 1) / 10) * Math.PI * 2
      const cx = fa.x + fa.out[0] * 4
      const cz = fa.z + fa.out[2] * 4
      push([cx, pool, cz], C.shallow, 0, 0, 0)
      push([cx + Math.cos(a1) * 11, pool, cz + Math.sin(a1) * 11], C.lagoon, 0, 0, 0)
      push([cx + Math.cos(a0) * 11, pool, cz + Math.sin(a0) * 11], C.lagoon, 0, 0, 0)
    }
  }
  // Lava streams: ribbons a little above the ground, following it.
  for (const st of streams) {
    let along = 0
    for (let k = 0; k < st.pts.length - 1; k += 1) {
      const [ax0, ay0, az0, w0] = st.pts[k]
      const [bx, by, bz, w1] = st.pts[k + 1]
      const dx = bx - ax0
      const dz = bz - az0
      const l = Math.hypot(dx, dz) || 1
      const rx = -dz / l
      const rz = dx / l
      const lift = 0.45
      const A = [ax0 - rx * w0 / 2, ay0 + lift, az0 - rz * w0 / 2]
      const B = [ax0 + rx * w0 / 2, ay0 + lift, az0 + rz * w0 / 2]
      const Cc = [bx + rx * w1 / 2, by + lift, bz + rz * w1 / 2]
      const D = [bx - rx * w1 / 2, by + lift, bz - rz * w1 / 2]
      const v0 = along
      const v1 = along + l
      // Up-facing winding (A, D, C), (A, C, B).
      push(A, C.lava, 2, -1, v0)
      push(D, C.lava, 2, -1, v1)
      push(Cc, C.lava, 2, 1, v1)
      push(A, C.lava, 2, -1, v0)
      push(Cc, C.lava, 2, 1, v1)
      push(B, C.lava, 2, 1, v0)
      along = v1
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(color), 3))
  g.setAttribute('aWater', new BufferAttribute(new Float32Array(water), 3))
  g.computeBoundingSphere()
  return g
}

/**
 * The volcano seen from afar (tropicZone.jsx draws it inside the far plane, scaled, when the
 * real cone is out of view): a low-poly cone with its crater glow and smoke, in metres
 * relative to the volcano's centre at its base height; colour only (no pattern).
 */
export function volcanoFarGeometry(v) {
  const mb = new MeshBuilder()
  const h = v.peak - v.base
  const n = 14
  const rings = [
    [1, 0],
    [0.62, 0.42],
    [0.3, 0.8],
    [0.12, 1],
  ]
  for (let k = 0; k < rings.length - 1; k += 1) {
    const [r0, y0] = rings[k]
    const [r1, y1] = rings[k + 1]
    cone(mb, 0, 0, y0 * h, y1 * h, r0 * v.R, r1 * v.R, n, k === 0 ? C.jungle : k === 1 ? C.rockDark : C.basalt, 0, k * 0.2, k === 0 ? C.jungleDark : C.basaltLight)
  }
  disc(mb, 0, h - 6, 0, 0.12 * v.R, n, C.lava, P.GLOW)
  plume(mb, 0, h, 0)
  return mb.build()
}

/**
 * Builds the tropic zone (`view`: zoneView(stage, 'tropic')) as geometry: one MeshBuilder per
 * terrain tile (with the set pieces in it), the palm and jungle tree tiles' instance matrices,
 * the water geometry, the hut signs and the volcano. `density` (the preset's scenery density)
 * thins the trees; `detail` (MEDIUM+) adds the coral heads, the extra huts' torches... (the
 * set pieces are the same on every preset: they are cheap and part of the zone's story).
 */
export function buildTropicWorld(view, { density = 1 } = {}) {
  // Built ahead of time in the prep worker (game/prep), when it was.
  const pre = takePrebuilt('tropic', view, { density })
  if (pre) return pre
  const L = tropicLayout(view)
  const { x0, z0, nx, nz, H, owner, lagoons } = L
  const tiles = new Map()
  const tileKey = (x, z) => {
    const i = Math.max(0, Math.min(Math.floor((nx - 1) / TILE), Math.floor((x - x0) / GRID / TILE)))
    const j = Math.max(0, Math.min(Math.floor((nz - 1) / TILE), Math.floor((z - z0) / GRID / TILE)))
    return `${i},${j}`
  }
  const place = (x, z) => {
    const k = tileKey(x, z)
    let mb = tiles.get(k)
    if (!mb) tiles.set(k, (mb = new MeshBuilder()))
    return mb
  }
  const v = L.volcano
  // Terrain cells (under the sea, or well under a lagoon's water: left out).
  for (let j = 0; j < nz - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const a = j * nx + i
      const ha = H[a]
      const hb = H[a + 1]
      const hc = H[a + nx]
      const hd = H[a + nx + 1]
      if (Math.max(ha, hb, hc, hd) < -1) continue
      const k = owner[a]
      const level = k >= 0 ? lagoons[k].level : -Infinity
      const x = x0 + i * GRID
      const z = z0 + j * GRID
      const A = [x, ha, z]
      const B = [x + GRID, hb, z]
      const Cc = [x, hc, z + GRID]
      const D = [x + GRID, hd, z + GRID]
      const mb = place(x + GRID / 2, z + GRID / 2)
      const vr = v ? Math.hypot(x - v.x, z - v.z) / v.R : 9
      for (const [p, q, r] of [
        [A, D, B],
        [A, Cc, D],
      ]) {
        if (Math.max(p[1], q[1], r[1]) < level - 0.3) continue
        const ux = q[0] - p[0]
        const uy = q[1] - p[1]
        const uz = q[2] - p[2]
        const vx = r[0] - p[0]
        const vy = r[1] - p[1]
        const vz = r[2] - p[2]
        const nxv = uy * vz - uz * vy
        const nyv = uz * vx - ux * vz
        const nzv = ux * vy - uy * vx
        const ny = nyv / (Math.hypot(nxv, nyv, nzv) || 1)
        const y = (p[1] + q[1] + r[1]) / 3
        const hsh = hash(p[0] * 0.13 + q[2], r[0] + p[2] * 0.07)
        const above = y - level
        let color
        let pattern = 0
        if (vr < 0.7 && y > (v.base + 60)) color = ny < 0.7 ? (hsh < 0.5 ? C.basalt : C.basaltLight) : hsh < 0.5 ? C.ash : C.basaltLight
        else if (above < 0.4) {
          color = C.sandWet
          pattern = P.SNOW
        } else if (above < 2.6 && ny > 0.72) {
          color = hsh < 0.5 ? C.sand : C.sandShade
          pattern = P.SNOW
        } else if (ny < 0.62 || (ny < 0.75 && hsh < 0.5)) color = hsh < 0.5 ? C.rock : C.rockLight
        else if (y < 8) color = C.rockDark
        else color = hsh < 0.33 ? C.grass : hsh < 0.66 ? C.grassLight : C.jungle
        mb.tri(p, q, r, color, pattern)
      }
    }
  }
  const signs = []
  huts(view, L, place, signs)
  boardwalks(view, L, place)
  seaplaneDock(view, L, place, signs)
  lighthouse(L, place)
  coralHeads(view, L, place)
  const falls = waterfallGap(view, L, place)
  jungleTunnel(view, L, place)
  giantShell(view, L, place)
  crater(L, place)
  const streams = lavaStreams(L)
  let triangles = 0
  const chunks = []
  for (const [key, mb] of tiles) {
    triangles += mb.triangles
    chunks.push({ key, geometry: mb.build(), triangles: mb.triangles })
  }
  const water = buildWater(L, falls, streams)
  return {
    chunks,
    water,
    palms: treeTiles(L.trees, density, 'palm'),
    jungle: treeTiles(L.trees, density, 'tree'),
    signs,
    volcano: v,
    heightAt: L.heightAt,
    triangles,
    waterTriangles: water.attributes.position.count / 3,
    treeCount: L.trees.length,
  }
}
