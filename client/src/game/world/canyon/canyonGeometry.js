import { Color, Matrix4, Quaternion, Vector3 } from 'three'

import { GRAND_TOUR_ZONES } from '@shared/stages/grandTour.meta'
import { footprintDistance, stageFootprints } from '@shared/track'

import { MeshBuilder } from '../../render/meshBuilder'
import { PATTERN as P } from '../../render/worldMaterial'
import { takePrebuilt } from '../../prep/prebuilt'
import { rng } from '../harbourGeometry'

/**
 * The Grand Tour's Desert Canyon as plain geometry (no React, no GPU), laid out from the
 * stage's canyon zone (a zoneView: the whole stage plus `zone` and `decor`), deterministic:
 *
 * - The canyon: a low-poly heightfield (GRID m cells) round the zone's roads - a dusty floor
 *   beside the road, then terraced red sandstone walls (banded like strata) rising to a
 *   broken plateau of mesas and buttes further out - shaped by the road's set pieces
 *   (`decor.canyon`, path-index ranges): cliff-edge LEDGES (one side drops into a gorge),
 *   the dry RIVER bed (a sandy channel on the left), the ghost TOWN's wide flat, the MINE's
 *   yard, the mine TUNNEL's walls closing in, the STORM ridge (dropping away both sides),
 *   the big GORGE under the jump, and the summit: nothing near the finish is higher than the
 *   finish mesa. Kept under the volcano's cone (the Tropical Island draws that) and capped
 *   under every road of the map (CLEAR m under the surface out to EDGE m past its edge,
 *   rising at most `k` per metre beyond), under plazas, and checked triangle by triangle
 *   along every road. Only cells within REACH of the zone's roads are built.
 * - Set pieces (merged into the terrain tiles): natural rock arches over the road, timber
 *   trestle bents under the single-lane spans, the ghost town (false-front saloons and
 *   stores with our own fictional names, boardwalk porches, the water tower, a wind pump),
 *   the old mine (headframe, ore heaps, shacks, the rails the carts cross on), the mine
 *   tunnel's timber sets and rock roof, wind socks along the storm ridge, the gorge's
 *   warning signs, and the grand finish: a great sandstone arch spanning the summit plaza,
 *   flags in the four zones' colours and fire baskets.
 * - Cacti (saguaros) and rocks as instance matrices in 120 m tiles: the scenery draws only
 *   the ones near the car.
 *
 * All on the shared world material, one geometry per TILE x TILE cells (with the set pieces
 * in it), culled by distance. `heightAt(x, z)` gives the drawn ground's height (falls).
 */

const GRID = 16
const TILE = 16
/** Terrain is built out to this far (m) from the zone's roads (past every preset's fog). */
const REACH = 640
const CLEAR = 2.6
const EDGE = 2.5
/** Default cap slope beside a road (walls may rise this steeply from just past its edge). */
const SLOPE = 1.6
const OUT = -1e9

const col = (hex) => new Color(hex)
const C = {
  strata: ['#b9522e', '#cf6a3c', '#e39a64', '#a3442a', '#d87a46', '#f0b47c', '#c45a34'].map(col),
  talus: col('#b8754a'),
  talusB: col('#a8663e'),
  dust: col('#d6a370'),
  dustB: col('#cc9664'),
  floor: col('#c99868'),
  sand: col('#e8c58e'),
  sandB: col('#dcb47c'),
  deep: col('#7a3a26'),
  deepB: col('#8e4630'),
  rock: col('#b4583a'),
  rockDark: col('#8a3e28'),
  rockLight: col('#cf7a4c'),
  cream: col('#f0c896'),
  timber: col('#9a6a3e'),
  timberDark: col('#6e4a2a'),
  timberLight: col('#b98a58'),
  plank: col('#a87a4c'),
  rust: col('#8a4a2a'),
  iron: col('#4a4644'),
  ironDark: col('#2e2b2a'),
  steel: col('#8a8480'),
  ore: col('#6e6a66'),
  oreB: col('#8a7a6a'),
  void: col('#1a100c'),
  glass: col('#2a2030'),
  lamp: col('#ffd27a'),
  flame: col('#ffb03a'),
  flameHot: col('#ffe27a'),
  white: col('#f4ece0'),
  red: col('#d8432c'),
  orange: col('#ff7a2c'),
  bone: col('#e8dccb'),
  dead: col('#7a6250'),
  paint: ['#a8483a', '#c8964a', '#6f8a9a', '#d8c6a4', '#8a5a7a', '#5f7a5a', '#b87a3a'].map(col),
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
const mix = (a, b, t) => a + (b - a) * t
/** Terraces: flat treads and steep risers every `step` m (sandstone ledges). */
const terrace = (v, step) => {
  const k = Math.floor(v / step)
  const f = v / step - k
  return step * (k + smooth(0.5, 1, f))
}

/** A spatial hash of points (`{x, z}`) in `cell` m cells. */
function grid(points, cell) {
  const g = new Map()
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
/** Level forward vector of a path sample. */
const fwdOfSample = (p) => {
  const l = Math.hypot(p.fx, p.fz) || 1
  return [p.fx / l, 0, p.fz / l]
}

/** A convex polygon wound so its normal faces `out`. */
function face(mb, pts, out, color, pattern = 0) {
  const u = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]]
  const v = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]]
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const p = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? [...pts].reverse() : pts
  for (let i = 1; i < p.length - 1; i += 1) mb.tri(p[0], p[i], p[i + 1], color, pattern)
}

/** An oriented box between two points, `t` thick (beams, posts, braces). */
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

// ---- The canyon --------------------------------------------------------------------------

const layouts = new WeakMap()

/** Per path sample, how much it is in one of `list`'s ranges: 1 inside, easing to 0 over `pad` samples either side. */
function weights(n, list, pad, test = () => true) {
  const w = new Float32Array(n)
  for (const r of list || []) {
    if (!test(r)) continue
    for (let i = Math.max(0, r.from - pad); i <= Math.min(n - 1, r.to + pad); i += 1) {
      const out = Math.max(0, r.from - i, i - r.to)
      w[i] = Math.max(w[i], smooth(0, 1, 1 - out / pad))
    }
  }
  return w
}

/**
 * The volcano the Tropical Island draws on its last plaza's far side (the same placement as
 * world/tropic/tropicGeometry.js): `{ x, z, base, peak, R }`, or null.
 */
function volcanoOf(view) {
  const cp = view.checkpoints[view.zone.from]
  if (!cp || view.zone.from < 1) return null
  const vr = [Math.cos(cp.yaw), 0, -Math.sin(cp.yaw)]
  const prev = view.path.filter((p) => p.section === view.zone.from - 1)
  if (!prev.length) return null
  const mid = prev[Math.round(prev.length * 0.55)]
  const side = (mid.x - cp.x) * vr[0] + (mid.z - cp.z) * vr[2] > 0 ? -1 : 1
  return { x: cp.x + vr[0] * 400 * side + Math.sin(cp.yaw) * 120, z: cp.z + vr[2] * 400 * side + Math.cos(cp.yaw) * 120, base: cp.y - 230, peak: cp.y + 175, R: 620 }
}

/** Where everything goes (cached per zone view): the terrain (capped and checked), `heightAt`, the scatter. */
export function canyonLayout(view) {
  if (layouts.has(view)) return layouts.get(view)
  const { zone } = view
  const path = view.path
  const decor = view.decor || {}
  const N = path.length
  const inZone = (p) => p.section >= zone.from && p.section <= zone.to
  const zs = path.filter(inZone)

  // Set-piece weights along the path.
  const ledgeR = weights(N, decor.ledges, 18, (r) => r.side > 0)
  const ledgeL = weights(N, decor.ledges, 18, (r) => r.side < 0)
  const river = weights(N, decor.rivers, 25)
  const town = weights(N, decor.towns, 20)
  const mine = weights(N, decor.mines, 20)
  const tunnel = weights(N, decor.tunnels, 6)
  const storm = weights(N, decor.storms, 25)
  const volcano = volcanoOf(view)
  const fps = stageFootprints(view)
  const lastCp = view.checkpoints[view.checkpoints.length - 1]
  const summit = fps.find((fp) => fp.kind === 'plaza' && fp.index === lastCp.index) || null
  // The gorge(s) under the jump: the flight's middle, its direction, the take-off height.
  const gorges = []
  for (const rg of decor.gorges || []) {
    const air = path.slice(rg.from, rg.to + 1).filter((p) => p.air)
    if (!air.length) continue
    const mid = air[Math.floor(air.length / 2)]
    const f = fwdOfSample(mid)
    gorges.push({ x: mid.x, z: mid.z, y: Math.min(air[0].y, air[air.length - 1].y), f, r: rightOfSample(mid), half: (air[air.length - 1].s - air[0].s) / 2 })
  }

  // Bounds round the zone's roads, snapped to the grid.
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
  x0 = Math.floor((x0 - REACH) / GRID) * GRID
  z0 = Math.floor((z0 - REACH) / GRID) * GRID
  const nx = Math.ceil((x1 + REACH - x0) / GRID) + 1
  const nz = Math.ceil((z1 + REACH - z0) / GRID) + 1
  x1 = x0 + (nx - 1) * GRID
  z1 = z0 + (nz - 1) * GRID

  const zsub = zs.filter((p, i) => i % 3 === 0)
  const zGrid = grid(zsub, 100)
  const all = grid(path.filter((p) => p.x > x0 - 200 && p.x < x1 + 200 && p.z > z0 - 200 && p.z < z1 + 200), 40)
  // Steeper caps beside the mine tunnel (its walls close in) and the ledges' wall side.
  const steepAt = (p) => (tunnel[p.i] > 0.5 ? 3 : SLOPE)

  const H = new Float32Array(nx * nz)
  /** Per grid point: how sandy (the river bed) it is, 0-1. */
  const sandy = new Float32Array(nx * nz)
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const x = x0 + i * GRID
      const z = z0 + j * GRID
      // The zone's roads round here: nearest (coarse), and their heights spread out.
      let best = null
      let bd = Infinity
      let wy = 0
      let ws = 0
      zGrid.near(x, z, REACH + 20, (p) => {
        const d2 = (p.x - x) ** 2 + (p.z - z) ** 2
        if (d2 < bd) {
          bd = d2
          best = p
        }
        const w = 1 / (d2 + 1600) ** 1.5
        wy += w * p.y
        ws += w
      })
      if (!best || bd > (REACH + 10) ** 2) {
        H[j * nx + i] = OUT
        continue
      }
      // Refine the nearest to the full-resolution path round it.
      for (let k = Math.max(0, best.i - 3); k <= Math.min(N - 1, best.i + 3); k += 1) {
        const p = path[k]
        if (!inZone(p)) continue
        const d2 = (p.x - x) ** 2 + (p.z - z) ** 2
        if (d2 < bd) {
          bd = d2
          best = p
        }
      }
      const ni = best.i
      const R = wy / ws
      const d = Math.sqrt(bd) - best.w / 2
      const rt = rightOfSample(best)
      const side = (x - best.x) * rt[0] + (z - best.z) * rt[2] >= 0 ? 1 : -1
      const n1 = fbm(x / 230, z / 230)
      const n2 = fbm(x / 70 + 7, z / 70 - 3)
      const n3 = fbm(x / 420 + 11, z / 420 + 5)

      // The canyon: a dusty floor beside the road, then terraced walls up to the plateau.
      let d0 = 10 + 34 * n1
      d0 = mix(d0, 64, town[ni])
      d0 = mix(d0, 28, mine[ni])
      d0 = mix(d0, 0.5, tunnel[ni])
      const wallH = 48 + 125 * n3
      const rise = smooth(d0, d0 + 20 + 26 * n2, d)
      let h = R - 4 + terrace((wallH + 4) * rise, 13)
      // Further out: the plateau broken into mesas and buttes, desert bowls between.
      const far = smooth(190, 470, d)
      if (far > 0) {
        const mesaN = fbm(x / 320 + 3, z / 320 + 9)
        const plate = R - 90 + terrace(240 * smooth(0.45, 0.6, mesaN) + (n2 - 0.5) * 16 + 30, 15)
        h = mix(h, plate, far)
      }
      // Cliff-edge ledges: the canyon drops away on one side, a far wall beyond.
      const ledge = side > 0 ? ledgeR[ni] : ledgeL[ni]
      if (ledge > 0) {
        const drop = R - 6 - 150 * smooth(1, 18, d) + 175 * smooth(130, 230, d)
        h = mix(h, Math.min(h, drop), ledge)
      }
      // The storm ridge: falling away both sides.
      if (storm[ni] > 0) {
        const drop = R - 5 - 85 * smooth(2, 45, d) + 150 * smooth(170, 290, d)
        h = mix(h, Math.min(h, drop), storm[ni])
      }
      // The dry river bed: a sandy channel along the road's left.
      if (river[ni] > 0 && side < 0) {
        const bed = smooth(3, 9, d) * (1 - smooth(32, 46, d)) * river[ni]
        h = mix(h, Math.min(h, R - 6.5 + 1.2 * n2), bed)
        sandy[j * nx + i] = bed
      }
      // The gorge under the jump: a deep chasm across the road, meandering away either side.
      for (const g of gorges) {
        const u = (x - g.x) * g.f[0] + (z - g.z) * g.f[2]
        const v = (x - g.x) * g.r[0] + (z - g.z) * g.r[2]
        if (Math.abs(v) > 700 || Math.abs(u) > 300) continue
        const bend = (fbm(v / 140 + 2, 1.3) - 0.5) * 60 * smooth(30, 200, Math.abs(v))
        const half = g.half + 1 + 8 * fbm(v / 50, 3.1)
        h = Math.min(h, g.y - 150 + Math.max(0, Math.abs(u - bend) - half) * 3)
      }
      // The summit: nothing near the finish mesa stands higher than it.
      if (summit) {
        const ds = footprintDistance(summit, x, z)
        const k = 1 - smooth(480, 820, ds)
        if (k > 0) h = mix(h, Math.min(h, summit.y - CLEAR - 0.2 - Math.max(0, ds - 6) * 0.12), k)
      }
      // The volcano's cone is the Tropical Island's: stay under it, with a dip round its foot.
      if (volcano) {
        const r = Math.hypot(x - volcano.x, z - volcano.z)
        if (r < volcano.R * 1.4) {
          const u = Math.min(1, r / volcano.R)
          const cone = r < volcano.R ? volcano.peak - (volcano.peak - volcano.base) * u ** 0.75 - 6 : volcano.base - 6 + (r - volcano.R) * 1.4
          h = Math.min(h, cone)
        }
      }
      // Caps: under every road of the map (cuts and embankments), plazas, platforms.
      let cap = Infinity
      all.near(x, z, 150, (p) => {
        const dd = Math.hypot(p.x - x, p.z - z) - p.w / 2 - EDGE
        cap = Math.min(cap, p.y - (p.air ? 6 : CLEAR) + Math.max(0, dd) * steepAt(p))
      })
      for (const fp of fps) {
        if (Math.abs(fp.x - x) > 400 || Math.abs(fp.z - z) > 400) continue
        cap = Math.min(cap, fp.y - CLEAR + Math.max(0, footprintDistance(fp, x, z) - 1) * SLOPE)
      }
      H[j * nx + i] = Math.min(h, cap)
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
    if (x < x0 || x > x1 || z < z0 || z > z1) return -Infinity
    const [a, b, d, wa, wb, wd] = tri(cellOf(x, z))
    if (H[a] === OUT || H[b] === OUT || H[d] === OUT) return -Infinity
    return H[a] * wa + H[b] * wb + H[d] * wd
  }
  const press = (x, z, top) => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return false
    const [a, b, d] = tri(cellOf(x, z))
    if (H[a] === OUT || H[b] === OUT || H[d] === OUT) return false
    const h = groundAt(x, z)
    if (h <= top) return false
    const e = h - top + 0.05
    H[a] -= e
    H[b] -= e
    H[d] -= e
    return true
  }
  // The triangle-by-triangle check: across every road (and a little past its edges), every plaza.
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
    const Rr = (fp.radius ?? Math.hypot(fp.hl, fp.hw)) + 3
    for (let dx = -Rr; dx <= Rr; dx += 5) for (let dz = -Rr; dz <= Rr; dz += 5) if (footprintDistance(fp, fp.x + dx, fp.z + dz) < 2) probes.push([fp.x + dx, fp.z + dz, fp.y - 1.0])
  }
  for (let pass = 0; pass < 6; pass += 1) {
    let n = 0
    for (const [x, z, top] of probes) if (press(x, z, top)) n += 1
    if (!n) break
  }

  const sandAt = (x, z) => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return 0
    const c = cellOf(x, z)
    return sandy[c.j * nx + c.i]
  }
  const out = { zone, x0, z0, x1, z1, nx, nz, H, sandy, groundAt, heightAt: groundAt, sandAt, zs, all, fps, volcano, summit, gorges, weights: { ledgeR, ledgeL, river, town, mine, tunnel, storm } }
  out.scatter = placeScatter(out)
  layouts.set(view, out)
  return out
}

/** Is a footprint of radius `rad` at (x, z), from y0 to y1, clear of every road (and plazas)? */
function clearOfRoads(L, x, z, rad, y0, y1, margin = 4, band = 10) {
  let ok = true
  L.all.near(x, z, rad + 30, (p) => {
    if (!ok) return
    const d = Math.hypot(p.x - x, p.z - z) - p.w / 2 - rad
    if (d < margin || (d < margin + band && p.y > y0 - 3 && p.y - 2 < y1)) ok = false
  })
  if (!ok) return false
  return !L.fps.some((fp) => Math.abs(fp.x - x) < 150 && Math.abs(fp.z - z) < 150 && footprintDistance(fp, x, z) < rad + 3)
}

/** Slope of the ground at (x, z) (rise per metre). */
const slopeAt = (L, x, z) => Math.hypot(L.groundAt(x + 4, z) - L.groundAt(x - 4, z), L.groundAt(x, z + 4) - L.groundAt(x, z - 4)) / 8

/**
 * Cacti and rocks on the gentle ground round the roads (thick near them, scattered further
 * out), clear of every road and plaza: `{ x, y, z, s, rot, keep, kind: 'cactus' | 'rock' }`.
 */
function placeScatter(L) {
  const rand = rng(8821)
  const out = []
  const STEP = 13
  for (let z = L.z0 + STEP; z < L.z1 - STEP; z += STEP) {
    for (let x = L.x0 + STEP; x < L.x1 - STEP; x += STEP) {
      const tx = x + (rand() - 0.5) * STEP * 0.9
      const tz = z + (rand() - 0.5) * STEP * 0.9
      const keep = rand()
      const s = 0.75 + rand() * 0.55
      const rot = rand() * Math.PI * 2
      const pick = rand()
      const h = L.groundAt(tx, tz)
      if (!Number.isFinite(h)) continue
      if (slopeAt(L, tx, tz) > 0.42) continue
      // How far from the nearest road (of ours), thinning out with distance.
      let near = Infinity
      let ours = true
      let ok = true
      const top = h + 8 * s
      L.all.near(tx, tz, 300, (p) => {
        const d = Math.hypot(p.x - tx, p.z - tz) - p.w / 2
        if (d < near) {
          near = d
          ours = p.section >= L.zone.from && p.section <= L.zone.to
        }
        if (d < 4.5 || (d < 12 && p.y > h - 4 && p.y - 1.5 < top + 1)) ok = false
      })
      if (!ok || !ours) continue
      const clump = fbm(tx / 120 + 40, tz / 120 - 13)
      const want = near < 60 ? 0.42 : near < 180 ? 0.2 : 0.08
      if (keep > want * (0.6 + clump)) continue
      if (L.fps.some((fp) => Math.abs(fp.x - tx) < 120 && Math.abs(fp.z - tz) < 120 && footprintDistance(fp, tx, tz) < 6)) continue
      out.push({ x: tx, y: h - 0.25, z: tz, s, rot, keep: keep / Math.max(0.01, want * (0.6 + clump)), kind: pick < 0.62 ? 'cactus' : 'rock' })
    }
  }
  return out
}

/** Instance matrices of the scatter of one `kind`, in 120 m tiles: `[{ x, z, matrices: Float32Array, count }]`. */
export function scatterTiles(list, density, kind) {
  const tiles = new Map()
  const m = new Matrix4()
  const q = new Quaternion()
  const p = new Vector3()
  const s = new Vector3()
  const up = new Vector3(0, 1, 0)
  for (const t of list) {
    if (t.kind !== kind || t.keep > 0.3 + 0.7 * Math.min(1, density)) continue
    const k = `${Math.floor(t.x / 120)},${Math.floor(t.z / 120)}`
    let tile = tiles.get(k)
    if (!tile) tiles.set(k, (tile = { x: (Math.floor(t.x / 120) + 0.5) * 120, z: (Math.floor(t.z / 120) + 0.5) * 120, list: [] }))
    p.set(t.x, t.y, t.z)
    q.setFromAxisAngle(up, t.rot)
    s.setScalar(kind === 'rock' ? t.s * 1.3 : t.s)
    tile.list.push(...m.compose(p, q, s).elements)
  }
  // Nearest first doesn't matter: the scenery fills from the tiles near the car.
  return [...tiles.values()].map((t) => ({ x: t.x, z: t.z, matrices: new Float32Array(t.list), count: t.list.length / 16 }))
}

// ---- Set pieces --------------------------------------------------------------------------

/** A point `x` right, `y` up and `zl` ahead of base `b` on a level frame (r, f). */
const at3 = (b, r, f, x, y, zl) => [b[0] + r[0] * x + f[0] * zl, b[1] + y, b[2] + r[2] * x + f[2] * zl]

/** Sandstone strata colour for height y (bands of ~6 m, wavy). */
const strataAt = (x, y, z) => C.strata[(((Math.floor((y + 2.5 * Math.sin(x * 0.011 + z * 0.013)) / 6) % 7) + 7) % 7)]

/** A rough stack of sandstone blocks: a pillar from y0 up to y1 round (x, z), `hw` half wide. */
function rockPillar(mb, x, z, r, f, hw, hd, y0, y1, seed) {
  const rand = rng(seed)
  let y = y0
  let k = 0
  while (y < y1 - 0.01) {
    const hgt = Math.min(y1 - y, 5 + rand() * 4)
    const s = 1 - 0.12 * (k % 2) + (rand() - 0.5) * 0.1
    const ox = (rand() - 0.5) * hw * 0.15
    const color = strataAt(x, y + hgt / 2, z)
    obox(mb, x + r[0] * ox, z + r[2] * ox, r, f, hw * s, hd * s, y, y + hgt, { top: C.cream, side: color, end: color, bottom: C.rockDark })
    y += hgt
    k += 1
  }
}

/**
 * A natural rock arch over the road: two pillars of stacked sandstone outside the road's
 * edges (centred `span` + thick / 2 either side of `base`), and a banded arch between them
 * whose underside rises from `clear` m above the road at the pillars by `rise` at the top.
 */
function rockArch(mb, L, base, r, f, span, clear, rise, thick, depth, seed) {
  const top = base[1] + clear
  for (const s of [-1, 1]) {
    const px = base[0] + r[0] * s * (span + thick / 2)
    const pz = base[2] + r[2] * s * (span + thick / 2)
    const g = L.groundAt(px, pz)
    const y0 = Math.max(Number.isFinite(g) ? g - 3 : base[1] - 40, base[1] - 70)
    rockPillar(mb, px, pz, r, f, thick / 2 + 0.6, depth + 0.8, y0, top + 1.2, seed + s)
  }
  const n = 12
  const P2 = (t, outer, zl) => {
    const a = Math.PI * t
    const x = (span + (outer ? thick : 0)) * Math.cos(a)
    const y = clear + (rise + (outer ? thick * 0.75 : 0)) * Math.sin(a)
    return at3(base, r, f, x, y, zl)
  }
  for (let k = 0; k < n; k += 1) {
    const t0 = k / n
    const t1 = (k + 1) / n
    const color = k % 3 === 0 ? C.strata[1] : k % 3 === 1 ? C.strata[0] : C.strata[4]
    for (const zl of [-depth, depth]) face(mb, [P2(t0, false, zl), P2(t1, false, zl), P2(t1, true, zl), P2(t0, true, zl)], [f[0] * zl, 0, f[2] * zl], color)
    face(mb, [P2(t0, true, -depth), P2(t1, true, -depth), P2(t1, true, depth), P2(t0, true, depth)], [0, 1, 0], k % 2 ? C.cream : C.strata[5])
    face(mb, [P2(t0, false, -depth), P2(t1, false, -depth), P2(t1, false, depth), P2(t0, false, depth)], [0, -1, 0], C.rockDark)
  }
}

/** Natural arches over the road at the middle of each `decor.arches` range. */
function arches(view, L, place) {
  view.decor.arches?.forEach((rg, k) => {
    const p = view.path[Math.round((rg.from + rg.to) / 2)]
    const r = rightOfSample(p)
    const f = fwdOfSample(p)
    const span = p.w / 2 + 6 + (k % 2) * 2
    rockArch(place(p.x, p.z), L, [p.x, p.y, p.z], r, f, span, 7, 6 + (k % 3) * 2, 6, 4 + (k % 2) * 2, 300 + k * 17)
  })
}

/** Timber trestle bents under the single-lane spans: posts down to the ground, X-braced, every ~5 m. */
function trestles(view, L, place) {
  for (const rg of [...(view.decor.trestles || []), ...(view.decor.ledges || [])]) {
    for (let i = rg.from; i <= rg.to; i += 3) {
      const p = view.path[i]
      if (p.w > 7.5) continue
      const r = rightOfSample(p)
      const top = p.y - 1.25
      const mb = place(p.x, p.z)
      const legs = [-1, 1].map((s) => {
        const x = p.x + r[0] * s * (p.w / 2 - 0.35)
        const z = p.z + r[2] * s * (p.w / 2 - 0.35)
        const g = L.groundAt(x, z)
        return { x, z, y: Math.max(Number.isFinite(g) ? g - 1 : top - 60, top - 60) }
      })
      for (const l of legs) beam(mb, [l.x, l.y, l.z], [l.x, top - 0.3, l.z], 0.4, C.timberDark)
      const fw = fwdOfSample(p)
      mb.box([p.x, top - 0.25, p.z], [p.w / 2, 0.25, 0.3], r, [0, 1, 0], [-fw[0], 0, -fw[2]], { top: C.timber, side: C.timber, end: C.timberDark, bottom: C.timberDark })
      const low = Math.max(legs[0].y, legs[1].y)
      for (let y = top - 0.6; y > low + 2.5; y -= 6) {
        const y2 = Math.max(low, y - 6)
        beam(mb, [legs[0].x, y, legs[0].z], [legs[1].x, y2, legs[1].z], 0.2, C.timber)
        beam(mb, [legs[1].x, y, legs[1].z], [legs[0].x, y2, legs[0].z], 0.2, C.timber)
      }
    }
  }
}

/** Names on the ghost town's fronts (our own, fictional), in turn. */
const TOWN_NAMES = [
  ['DUSTY SPUR', 'SALOON'],
  ["CACTUS JACK'S", 'GENERAL STORE'],
  ["RATTLER'S REST", 'HOTEL'],
  ['GOLD NUGGET', 'BANK'],
  ['SHERIFF', 'BUZZARD GULCH'],
  ['COPPER KETTLE', 'EATS'],
  ['SUNDOWN', 'LIVERY & FEED'],
  ['LUCKY HORSESHOE', 'GAMBLING HALL'],
  ['ASSAY OFFICE', 'GOLD BOUGHT'],
  ['TUMBLE INN', 'ROOMS 2 BITS'],
]
const SIGN_BG = ['#7a3a22', '#2f5a6a', '#6a2a2a', '#3a5a2a', '#5a3a6a', '#8a5a1a']

/**
 * A false-front building facing `f` (towards the road): a timber body, a tall square front
 * with the name board (a sign of the atlas), a porch roof on posts over a plank boardwalk,
 * a door and two windows.
 */
function frontier(mb, x, y, z, f, w, d, h, k, signs) {
  const r = [-f[2], 0, f[0]]
  const paint = C.paint[k % C.paint.length]
  const wall = { top: C.timberDark, side: paint, end: paint, bottom: C.timberDark }
  obox(mb, x, z, r, f, w / 2, d / 2, y - 2, y + h, wall, { side: P.PLANKS, end: P.PLANKS }, ['bottom'])
  // Pitched roof behind the front.
  const ry = y + h
  face(mb, [at3([x, ry, z], r, f, -w / 2, 0, -d / 2), at3([x, ry, z], r, f, -w / 2, 0, d / 2), at3([x, ry, z], r, f, 0, 1.6, d / 2), at3([x, ry, z], r, f, 0, 1.6, -d / 2)], [-r[0], 1, -r[2]], C.timberDark, P.PLANKS)
  face(mb, [at3([x, ry, z], r, f, w / 2, 0, -d / 2), at3([x, ry, z], r, f, w / 2, 0, d / 2), at3([x, ry, z], r, f, 0, 1.6, d / 2), at3([x, ry, z], r, f, 0, 1.6, -d / 2)], [r[0], 1, r[2]], C.rust, P.PLANKS)
  face(mb, [at3([x, ry, z], r, f, -w / 2, 0, -d / 2), at3([x, ry, z], r, f, w / 2, 0, -d / 2), at3([x, ry, z], r, f, 0, 1.6, -d / 2)], [-f[0], 0, -f[2]], paint, P.PLANKS)
  // The false front: taller than the roof, a stepped top.
  const fx = x + f[0] * (d / 2 + 0.15)
  const fz = z + f[2] * (d / 2 + 0.15)
  obox(mb, fx, fz, r, f, w / 2 + 0.2, 0.15, y, y + h + 2.6, { top: C.timberLight, side: paint, end: paint, bottom: paint }, { side: P.PLANKS })
  obox(mb, fx, fz, r, f, w / 4, 0.17, y + h + 2.6, y + h + 3.3, { top: C.timberLight, side: paint, end: paint, bottom: paint })
  // Door and windows (proud of the front).
  const fr = (u, v0, v1, hw, color, pattern = 0) => obox(mb, fx + f[0] * 0.22 + r[0] * u, fz + f[2] * 0.22 + r[2] * u, r, f, hw, 0.03, y + v0, y + v1, color, { side: pattern, end: pattern, top: pattern })
  fr(0, 0.37, 2.4, 0.65, C.void)
  for (const s of [-1, 1]) fr(s * (w / 4 + 0.3), 1.0, 2.3, 0.7, C.glass)
  // Name board across the front, above the porch.
  const by = y + h + 0.9
  obox(mb, fx + f[0] * 0.2, fz + f[2] * 0.2, r, f, Math.min(w / 2 - 0.2, 3.4), 0.05, by - 0.75, by + 0.75, C.timberDark)
  const [text, sub] = TOWN_NAMES[k % TOWN_NAMES.length]
  signs.push({ text, sub, center: [fx + f[0] * 0.27, by, fz + f[2] * 0.27], right: [f[2], 0, -f[0]], up: [0, 1, 0], width: Math.min(w - 0.6, 6.6), height: 1.35, bg: SIGN_BG[k % SIGN_BG.length], fg: '#ffe9c2' })
  // Porch: plank boardwalk, posts and a sloping roof.
  const pd = 2.4
  const px = fx + f[0] * (pd / 2 + 0.15)
  const pz = fz + f[2] * (pd / 2 + 0.15)
  obox(mb, px, pz, r, f, w / 2 + 0.2, pd / 2, y - 1.2, y + 0.35, { top: C.plank, side: C.timberDark, end: C.timberDark, bottom: C.timberDark }, { top: P.PLANKS })
  for (const s of [-1, 1]) beam(mb, [px + r[0] * s * (w / 2) + f[0] * (pd / 2 - 0.2), y + 0.35, pz + r[2] * s * (w / 2) + f[2] * (pd / 2 - 0.2)], [px + r[0] * s * (w / 2) + f[0] * (pd / 2 - 0.2), y + 3.0, pz + r[2] * s * (w / 2) + f[2] * (pd / 2 - 0.2)], 0.2, C.timberLight)
  const e0 = at3([fx, y + 3.3, fz], r, f, -w / 2 - 0.3, 0, 0.2)
  const e1 = at3([fx, y + 3.3, fz], r, f, w / 2 + 0.3, 0, 0.2)
  const e2 = at3([fx, y + 2.8, fz], r, f, w / 2 + 0.3, 0, pd + 0.4)
  const e3 = at3([fx, y + 2.8, fz], r, f, -w / 2 - 0.3, 0, pd + 0.4)
  face(mb, [e0, e1, e2, e3], [f[0], 3, f[2]], C.timberDark, P.PLANKS)
  face(mb, [e0, e1, e2, e3].map((p) => [p[0], p[1] - 0.06, p[2]]), [0, -1, 0], C.timber)
}

/** The water tower: four splayed timber legs, a banded tank, a conical roof and a spout. */
function waterTower(mb, x, y, z) {
  const legs = 12
  for (let k = 0; k < 4; k += 1) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    beam(mb, [x + Math.cos(a) * 3.6, y - 1, z + Math.sin(a) * 3.6], [x + Math.cos(a) * 2.6, y + legs, z + Math.sin(a) * 2.6], 0.4, C.timberDark)
  }
  for (const hy of [4, 8]) {
    const rr = 3.6 - (hy / legs) * 1
    for (let k = 0; k < 4; k += 1) {
      const a0 = Math.PI / 4 + (k * Math.PI) / 2
      const a1 = a0 + Math.PI / 2
      beam(mb, [x + Math.cos(a0) * rr, y + hy, z + Math.sin(a0) * rr], [x + Math.cos(a1) * rr, y + hy, z + Math.sin(a1) * rr], 0.18, C.timber)
    }
  }
  disc(mb, x, y + legs, z, 3.4, 10, C.timberDark, 0, true)
  cone(mb, x, z, y + legs, y + legs + 6, 3.2, 3.2, 10, C.timber, P.PLANKS, 0, C.timberLight)
  for (const hy of [1.2, 3.2, 5.2]) cone(mb, x, z, y + legs + hy, y + legs + hy + 0.3, 3.28, 3.28, 10, C.ironDark)
  cone(mb, x, z, y + legs + 6, y + legs + 8.2, 3.6, 0, 10, C.rust, 0, 0, C.timberDark)
  beam(mb, [x + 3.2, y + legs + 0.6, z], [x + 4.6, y + legs - 1.8, z], 0.3, C.ironDark)
}

/** A wind pump: a lattice tower, a fan of blades and a tail vane (static, it's a calm-ish evening). */
function windPump(mb, x, y, z, yaw) {
  const H = 11
  const f = [Math.sin(yaw), 0, Math.cos(yaw)]
  for (let k = 0; k < 4; k += 1) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    beam(mb, [x + Math.cos(a) * 1.8, y - 0.5, z + Math.sin(a) * 1.8], [x + Math.cos(a) * 0.35, y + H, z + Math.sin(a) * 0.35], 0.16, C.steel)
  }
  const hub = [x + f[0] * 0.6, y + H + 0.4, z + f[2] * 0.6]
  for (let k = 0; k < 12; k += 1) {
    const a = (k / 12) * Math.PI * 2
    const r = [-f[2], 0, f[0]]
    // (Alternate blades a little apart along the axle: no two share a plane at the hub.)
    const o = k % 2 ? 0.16 : 0
    const h0 = [hub[0] + f[0] * o, hub[1], hub[2] + f[2] * o]
    const tip = [h0[0] + r[0] * Math.cos(a) * 2.4, h0[1] + Math.sin(a) * 2.4, h0[2] + r[2] * Math.cos(a) * 2.4]
    beam(mb, h0, tip, 0.12, k % 2 ? C.white : C.red)
  }
  beam(mb, [x, y + H + 0.4, z], [x - f[0] * 3, y + H + 0.4, z - f[2] * 3], 0.14, C.steel)
  face(mb, [[x - f[0] * 2.4, y + H - 0.4, z - f[2] * 2.4], [x - f[0] * 3.6, y + H - 0.2, z - f[2] * 3.6], [x - f[0] * 3.6, y + H + 1.4, z - f[2] * 3.6], [x - f[0] * 2.4, y + H + 1.0, z - f[2] * 2.4]], [-f[2], 0, f[0]], C.red)
}

/** The ghost town: false-front buildings along main street, the water tower in the bend, a wind pump, the town sign. */
function ghostTown(view, L, place, signs) {
  let k = 0
  for (const rg of view.decor.towns || []) {
    const rand = rng(4040 + rg.from)
    let next = view.path[rg.from].s + 10
    for (let i = rg.from; i <= rg.to; i += 1) {
      const p = view.path[i]
      if (p.s < next) continue
      next = p.s + 13 + rand() * 4
      const r = rightOfSample(p)
      for (const side of [-1, 1]) {
        if (rand() < 0.18) continue
        const w = 7 + rand() * 2.5
        const d = 8 + rand() * 2
        const h = 4.2 + rand() * 2.2
        const off = p.w / 2 + 4.6 + d / 2 + 2.6
        const x = p.x + r[0] * side * off
        const z = p.z + r[2] * side * off
        const g = L.groundAt(x, z)
        if (!Number.isFinite(g) || Math.abs(g - (p.y - CLEAR)) > 4) continue
        if (!clearOfRoads(L, x, z, Math.hypot(w, d) / 2 + 2.6, g - 2, g + h + 4, 1, 0)) continue
        frontier(place(x, z), x, g + 0.4, z, [-r[0] * side, 0, -r[2] * side], w, d, h, k, signs)
        k += 1
      }
    }
    // The water tower in the middle of main street's bend, a wind pump beside it.
    const ids = []
    for (let i = rg.from; i <= rg.to; i += 1) if (Math.abs(view.path[i].fx * view.path[Math.min(rg.to, i + 4)].fz - view.path[i].fz * view.path[Math.min(rg.to, i + 4)].fx) > 0.05) ids.push(i)
    if (ids.length > 6) {
      const c = circleOf(view.path[ids[0]], view.path[ids[Math.floor(ids.length / 2)]], view.path[ids[ids.length - 1]])
      if (c) {
        const g = L.groundAt(c.x, c.z)
        if (Number.isFinite(g) && clearOfRoads(L, c.x, c.z, 5, g, g + 22, 3)) waterTower(place(c.x, c.z), c.x, g, c.z)
        const wx = c.x + 11
        const gw = L.groundAt(wx, c.z + 6)
        if (Number.isFinite(gw) && clearOfRoads(L, wx, c.z + 6, 3, gw, gw + 14, 3)) windPump(place(wx, c.z + 6), wx, gw, c.z + 6, 0.8)
      }
    }
    // "Welcome to Buzzard Gulch" at the edge of town, on the right.
    const p = view.path[rg.from]
    const r = rightOfSample(p)
    const f = fwdOfSample(p)
    const sx = p.x + r[0] * (p.w / 2 + 5)
    const sz = p.z + r[2] * (p.w / 2 + 5)
    const g = L.groundAt(sx, sz)
    if (Number.isFinite(g)) {
      const mb = place(sx, sz)
      for (const s of [-1, 1]) beam(mb, [sx + r[0] * s * 2.6, g - 0.5, sz + r[2] * s * 2.6], [sx + r[0] * s * 2.6, g + 4.6, sz + r[2] * s * 2.6], 0.3, C.timberDark)
      obox(mb, sx, sz, r, f, 3.1, 0.1, g + 2.4, g + 4.4, C.timberDark)
      signs.push({ text: 'BUZZARD GULCH', sub: 'POP. 0 · EST. 1879', center: [sx - f[0] * 0.13, g + 3.4, sz - f[2] * 0.13], right: [r[0], 0, r[2]], up: [0, 1, 0], width: 6, height: 1.8, bg: '#6a3a22', fg: '#ffe9c2' })
    }
  }
}

/** A headframe over a shaft: an A-frame timber tower, a sheave wheel at the top, a shed at its foot. */
function headframe(mb, x, y, z, f) {
  const r = [-f[2], 0, f[0]]
  const H = 17
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) beam(mb, at3([x, y - 1, z], r, f, s * 3, 0, t * 3), at3([x, y + H, z], r, f, s * 1.1, 0, t * 1.1), 0.45, C.timberDark)
    beam(mb, at3([x, y - 1, z], r, f, s * 3, 0, 9), at3([x, y + H - 2, z], r, f, s * 1, 0, 1), 0.45, C.timber)
  }
  for (const hy of [5, 10]) for (const s of [-1, 1]) beam(mb, at3([x, y + hy, z], r, f, -2.4 + hy * 0.07, 0, s * (2.4 - hy * 0.12)), at3([x, y + hy, z], r, f, 2.4 - hy * 0.07, 0, s * (2.4 - hy * 0.12)), 0.25, C.timber)
  obox(mb, x, z, r, f, 1.5, 1.5, y + H, y + H + 0.5, C.timberDark)
  // Sheave wheel (a disc each side) and the cable down the shaft.
  const c = [x, y + H + 2, z]
  for (const s of [-1, 1]) {
    const o = [c[0] + r[0] * s * 0.3, c[1], c[2] + r[2] * s * 0.3]
    for (let k = 0; k < 10; k += 1) {
      const a0 = (k / 10) * Math.PI * 2
      const a1 = ((k + 1) / 10) * Math.PI * 2
      face(mb, [o, [o[0] + f[0] * Math.cos(a0) * 2, o[1] + Math.sin(a0) * 2, o[2] + f[2] * Math.cos(a0) * 2], [o[0] + f[0] * Math.cos(a1) * 2, o[1] + Math.sin(a1) * 2, o[2] + f[2] * Math.cos(a1) * 2]], [r[0] * s, 0, r[2] * s], k % 2 ? C.rust : C.ironDark)
    }
  }
  beam(mb, [x, y + 1, z], [x, y + H + 1, z], 0.08, C.ironDark)
  // The hoist house behind.
  const hx = x + f[0] * 13
  const hz = z + f[2] * 13
  obox(mb, hx, hz, r, f, 3.5, 3, y - 1, y + 4.5, { top: C.rust, side: C.paint[3], end: C.paint[3], bottom: C.timberDark }, { side: P.PLANKS, end: P.PLANKS })
  face(mb, [at3([hx, y + 4.5, hz], r, f, -3.8, 0, -3.3), at3([hx, y + 4.5, hz], r, f, 3.8, 0, -3.3), at3([hx, y + 6.2, hz], r, f, 3.8, 0, 0), at3([hx, y + 6.2, hz], r, f, -3.8, 0, 0)], [-f[0], 1, -f[2]], C.rust, P.PLANKS)
  face(mb, [at3([hx, y + 4.5, hz], r, f, -3.8, 0, 3.3), at3([hx, y + 4.5, hz], r, f, 3.8, 0, 3.3), at3([hx, y + 6.2, hz], r, f, 3.8, 0, 0), at3([hx, y + 6.2, hz], r, f, -3.8, 0, 0)], [f[0], 1, f[2]], C.rust, P.PLANKS)
  beam(mb, [hx + r[0] * 2, y + 4, hz + r[2] * 2], [hx + r[0] * 2, y + 9, hz + r[2] * 2], 0.7, C.ironDark)
}

/**
 * The old mine: the rails each mine-cart crossing runs on (sleepers and two rails across
 * the road, adit to adit), a headframe and hoist house beside the yard, ore heaps, the
 * company sign.
 */
function oldMine(view, L, place, signs) {
  // Rails under every mine-cart crossing.
  for (const o of view.obstacles) {
    if (o.type !== 'traffic' || o.look !== 'minecart' || o.section < view.zone.from || o.section > view.zone.to) continue
    const p = view.path[o.pi]
    const fw = [p.fx, p.fy, p.fz]
    const up = [p.ux, p.uy, p.uz]
    const rt = [fw[1] * up[2] - fw[2] * up[1], fw[2] * up[0] - fw[0] * up[2], fw[0] * up[1] - fw[1] * up[0]]
    const rl = Math.hypot(...rt) || 1
    for (let k = 0; k < 3; k += 1) rt[k] /= rl
    const base = [o.x - rt[0] * o.lane, o.y - rt[1] * o.lane, o.z - rt[2] * o.lane]
    const reach = (o.width || p.w) / 2 + 5.4
    const back = fw.map((v) => -v)
    const mb = place(base[0], base[2])
    const pt = (x, y, zl) => [base[0] + rt[0] * x + up[0] * y + fw[0] * zl, base[1] + rt[1] * x + up[1] * y + fw[1] * zl, base[2] + rt[2] * x + up[2] * y + fw[2] * zl]
    for (let x = -reach + 0.4; x <= reach - 0.3; x += 0.95) mb.box(pt(x, 0.045, 0), [0.14, 0.025, 1.05], rt, up, back, { top: C.timberDark, side: C.timberDark, end: C.timberDark }, {}, { skip: ['bottom'] })
    for (const s of [-1, 1]) mb.box(pt(0, 0.115, s * 0.62), [reach, 0.045, 0.05], rt, up, back, { top: C.steel, side: C.iron, end: C.iron }, {}, { skip: ['bottom'] })
  }
  view.decor.mines?.forEach((rg, n) => {
    const rand = rng(6060 + n)
    // The headframe on the right of the yard, set back.
    const p = view.path[Math.round(rg.from + (rg.to - rg.from) * 0.42)]
    const r = rightOfSample(p)
    const hx = p.x + r[0] * (p.w / 2 + 16)
    const hz = p.z + r[2] * (p.w / 2 + 16)
    const g = L.groundAt(hx, hz)
    if (Number.isFinite(g) && clearOfRoads(L, hx, hz, 6, g, g + 20, 3)) headframe(place(hx, hz), hx, g, hz, r)
    // Ore heaps and tailings along the yard.
    for (let k = 0; k < 7; k += 1) {
      const q = view.path[Math.round(rg.from + ((rg.to - rg.from) * (k + 0.5)) / 7)]
      const qr = rightOfSample(q)
      const side = k % 2 ? 1 : -1
      const off = q.w / 2 + 9 + rand() * 10
      const x = q.x + qr[0] * side * off
      const z = q.z + qr[2] * side * off
      const gy = L.groundAt(x, z)
      const rad = 3 + rand() * 3
      if (!Number.isFinite(gy) || !clearOfRoads(L, x, z, rad, gy, gy + rad, 3)) continue
      cone(place(x, z), x, z, gy - 0.5, gy + rad * 0.8, rad, 0, 7, k % 3 ? C.ore : C.oreB, P.SNOW, rand() * 3, C.ironDark)
    }
    // The company sign at the yard's entrance, on the left.
    const q = view.path[rg.from]
    const qr = rightOfSample(q)
    const qf = fwdOfSample(q)
    const sx = q.x - qr[0] * (q.w / 2 + 4.5)
    const sz = q.z - qr[2] * (q.w / 2 + 4.5)
    const gy = L.groundAt(sx, sz)
    if (Number.isFinite(gy)) {
      const mb = place(sx, sz)
      for (const s of [-1, 1]) beam(mb, [sx + qr[0] * s * 3.2, gy - 0.5, sz + qr[2] * s * 3.2], [sx + qr[0] * s * 3.2, gy + 6.6, sz + qr[2] * s * 3.2], 0.36, C.timberDark)
      beam(mb, [sx - qr[0] * 3.6, gy + 6.4, sz - qr[2] * 3.6], [sx + qr[0] * 3.6, gy + 6.4, sz + qr[2] * 3.6], 0.4, C.timberDark)
      obox(mb, sx, sz, qr, qf, 3.0, 0.1, gy + 3.6, gy + 5.8, C.timberDark)
      signs.push({ text: 'LAST CHANCE MINE', sub: 'KEEP OFF THE RAILS', center: [sx - qf[0] * 0.13, gy + 4.7, sz - qf[2] * 0.13], right: [qr[0], 0, qr[2]], up: [0, 1, 0], width: 5.8, height: 2, bg: '#5a2a1a', fg: '#ffd27a' })
    }
  })
}

/** The mine tunnel: timber sets (posts outside the barriers, cap beams) every ~7 m, a rock roof over them, lanterns. */
function mineTunnel(view, L, place) {
  for (const rg of view.decor.tunnels || []) {
    let prev = null
    let k = 0
    for (let i = rg.from; i <= rg.to; i += 4) {
      const p = view.path[i]
      const r = rightOfSample(p)
      const f = fwdOfSample(p)
      const mb = place(p.x, p.z)
      const half = p.w / 2 + 0.75
      const H = 6.4
      for (const s of [-1, 1]) {
        const x = p.x + r[0] * s * half
        const z = p.z + r[2] * s * half
        obox(mb, x, z, r, f, 0.3, 0.3, p.y - 1.5, p.y + H, { top: C.timberDark, side: C.timber, end: C.timberLight, bottom: C.timberDark }, { side: P.PLANKS })
        if (k % 2 === 0) obox(mb, x - r[0] * s * 0.4, z - r[2] * s * 0.4, r, f, 0.12, 0.15, p.y + H - 1.6, p.y + H - 1.2, C.lamp, { side: P.GLOW, end: P.GLOW, top: P.GLOW })
      }
      obox(mb, p.x, p.z, r, f, half + 0.4, 0.35, p.y + H, p.y + H + 0.6, { top: C.timberDark, side: C.timber, end: C.timberDark, bottom: C.timberDark }, { side: P.PLANKS })
      // The rock roof between this set and the last: a low gable of rock over the timbers.
      const cur = { l: at3([p.x, p.y + H + 0.6, p.z], r, f, -half - 1.2, 0, 0), m: at3([p.x, p.y + H + 4.2 + (k % 3), p.z], r, f, 0, 0, 0), rr: at3([p.x, p.y + H + 0.6, p.z], r, f, half + 1.2, 0, 0) }
      if (prev) {
        face(mb, [prev.l, cur.l, cur.m, prev.m], [-r[0], 1, -r[2]], k % 2 ? C.rock : C.rockDark)
        face(mb, [prev.rr, cur.rr, cur.m, prev.m], [r[0], 1, r[2]], k % 2 ? C.rockLight : C.rock)
        face(mb, [prev.l, cur.l, cur.rr, prev.rr].map((q) => [q[0], q[1] - 0.05, q[2]]), [0, -1, 0], C.void)
      }
      prev = cur
      k += 1
    }
  }
}

/** Wind socks along the storm ridge (bright orange cones streaming across the road), dead snags. */
function stormRidge(view, L, place) {
  for (const rg of view.decor.storms || []) {
    let k = 0
    for (let i = rg.from; i <= rg.to; i += 22) {
      const p = view.path[i]
      const r = rightOfSample(p)
      const side = k % 2 ? 1 : -1
      const x = p.x + r[0] * side * (p.w / 2 + 3.5)
      const z = p.z + r[2] * side * (p.w / 2 + 3.5)
      const g = Math.max(L.groundAt(x, z), p.y - 30)
      const mb = place(x, z)
      beam(mb, [x, g - 1, z], [x, p.y + 5, z], 0.18, C.steel)
      // The sock streams back across the road, the way the storm blows here.
      const dir = side
      for (let s = 0; s < 4; s += 1) {
        const a = [x - r[0] * dir * s * 0.7, p.y + 4.7 - s * 0.12, z - r[2] * dir * s * 0.7]
        const b = [x - r[0] * dir * (s + 1) * 0.7, p.y + 4.7 - (s + 1) * 0.12, z - r[2] * dir * (s + 1) * 0.7]
        const ra = 0.4 - s * 0.06
        const rb = 0.4 - (s + 1) * 0.06
        const color = s % 2 ? C.white : C.orange
        const f = fwdOfSample(p)
        const ring = (q, rad) => [0, 1, 2, 3, 4, 5].map((n) => {
          const an = (n / 6) * Math.PI * 2
          return [q[0] + f[0] * Math.cos(an) * rad, q[1] + Math.sin(an) * rad, q[2] + f[2] * Math.cos(an) * rad]
        })
        const A = ring(a, ra)
        const B = ring(b, rb)
        for (let n = 0; n < 6; n += 1) face(mb, [A[n], A[(n + 1) % 6], B[(n + 1) % 6], B[n]], [A[n][0] - a[0] + B[n][0] - b[0], A[n][1] - a[1], A[n][2] - a[2] + B[n][2] - b[2]], color)
      }
      k += 1
    }
  }
}

/** The gorge: hazard boards either side of the trampoline's run-up, and the gorge's name. */
function gorge(view, L, place, signs) {
  for (const rg of view.decor.gorges || []) {
    const p = view.path[Math.max(0, rg.from - 18)]
    const r = rightOfSample(p)
    const f = fwdOfSample(p)
    const sx = p.x + r[0] * (p.w / 2 + 4)
    const sz = p.z + r[2] * (p.w / 2 + 4)
    const g = Math.max(L.groundAt(sx, sz), p.y - 12)
    const mb = place(sx, sz)
    for (const s of [-1, 1]) beam(mb, [sx + r[0] * s * 2.4, g - 0.5, sz + r[2] * s * 2.4], [sx + r[0] * s * 2.4, p.y + 4.4, sz + r[2] * s * 2.4], 0.3, C.timberDark)
    obox(mb, sx, sz, r, f, 2.8, 0.1, p.y + 2.2, p.y + 4.2, C.timberDark)
    signs.push({ text: "DEVIL'S GORGE", sub: 'HIT THE TRAMPOLINE · DON’T LOOK DOWN', center: [sx - f[0] * 0.13, p.y + 3.2, sz - f[2] * 0.13], right: [r[0], 0, r[2]], up: [0, 1, 0], width: 5.4, height: 1.8, bg: '#8a2a1a', fg: '#ffe9c2' })
  }
}

/**
 * The grand finish on the mesa top: a great sandstone arch spanning the whole summit plaza
 * (pillars outside its rails), the "GRAND TOUR · FINISH" board hanging under it, flags in the
 * four zones' colours along both sides, fire baskets at the pillars.
 */
function grandFinish(view, L, place, signs) {
  const cp = view.checkpoints[view.checkpoints.length - 1]
  if (!cp?.finish) return
  const f = [-Math.sin(cp.yaw), 0, -Math.cos(cp.yaw)]
  const r = [Math.cos(cp.yaw), 0, -Math.sin(cp.yaw)]
  const hw = cp.width / 2
  const mid = [cp.x + f[0] * cp.length * 0.36, cp.y, cp.z + f[2] * cp.length * 0.36]
  const span = hw + 3
  rockArch(place(mid[0], mid[2]), L, mid, r, f, span, 9, 26, 8, 5, 909)
  // The board under the arch's crown, on chains.
  const by = mid[1] + 9 + 26 - 5.5
  const mb = place(mid[0], mid[2])
  for (const s of [-1, 1]) beam(mb, at3(mid, r, f, s * 6.5, 9 + 26 - 0.5, 0), at3(mid, r, f, s * 6.5, by - mid[1] + 1.8, 0), 0.12, C.ironDark)
  obox(mb, mid[0], mid[2], r, f, 7.6, 0.2, by - 1.9, by + 1.9, { top: C.timberDark, side: C.timberDark, end: C.timberDark, bottom: C.timberDark })
  for (const s of [-1, 1]) {
    const c = [mid[0] - f[0] * s * 0.23, by, mid[2] - f[2] * s * 0.23]
    signs.push({ text: 'GRAND TOUR', sub: s > 0 ? 'FINISH · SUNSET MESA' : 'YOU MADE IT!', center: c, right: [r[0] * s, 0, r[2] * s], up: [0, 1, 0], width: 14.4, height: 3.4, bg: '#b8401e', fg: '#fff1c4' })
  }
  // Flags along both sides, outside the rails: the four zones' colours in turn.
  const colors = GRAND_TOUR_ZONES.map((z) => col(z.color))
  for (const s of [-1, 1]) {
    for (let k = 0, along = 6; along < cp.length - 4; along += 10, k += 1) {
      const x = cp.x + f[0] * along + r[0] * s * (hw + 2.2)
      const z = cp.z + f[2] * along + r[2] * s * (hw + 2.2)
      const g = Math.max(L.groundAt(x, z), cp.y - 8)
      const m2 = place(x, z)
      beam(m2, [x, g - 0.5, z], [x, cp.y + 9, z], 0.2, C.bone)
      const color = colors[(k + (s > 0 ? 2 : 0)) % colors.length]
      const a = [x, cp.y + 8.8, z]
      const b = [x, cp.y + 6.6, z]
      // Streaming outwards and back a little, as if in the evening breeze.
      const tip = [x + r[0] * s * 1.2 - f[0] * 3.4, cp.y + 7.5, z + r[2] * s * 1.2 - f[2] * 3.4]
      face(m2, [a, b, tip], [r[0] * s, 0, r[2] * s], color, P.GLOW)
      face(m2, [a, tip, b], [-r[0] * s, 0, -r[2] * s], color, P.GLOW)
    }
  }
  // Fire baskets at the arch's feet and the plaza's far corners.
  for (const [u, s] of [
    [cp.length * 0.36 - 7, -1],
    [cp.length * 0.36 - 7, 1],
    [cp.length - 3, -1],
    [cp.length - 3, 1],
  ]) {
    const x = cp.x + f[0] * u + r[0] * s * (hw + 5.5)
    const z = cp.z + f[2] * u + r[2] * s * (hw + 5.5)
    const g = Math.max(L.groundAt(x, z), cp.y - 8)
    const m2 = place(x, z)
    beam(m2, [x, g - 0.5, z], [x, cp.y + 3, z], 0.3, C.ironDark)
    cone(m2, x, z, cp.y + 3, cp.y + 3.7, 0.5, 0.9, 6, C.ironDark)
    cone(m2, x, z, cp.y + 3.7, cp.y + 5.4, 0.8, 0, 6, C.flame, P.GLOW, 0.3, C.flameHot)
  }
}

// ---- Build -------------------------------------------------------------------------------

/**
 * Builds the canyon zone (`view`: zoneView(stage, 'canyon')) as geometry: one MeshBuilder per
 * terrain tile (with the set pieces in it), the cactus and rock tiles' instance matrices and
 * the sign records. `density` (the preset's scenery density) thins the scatter.
 */
export function buildCanyonWorld(view, { density = 1 } = {}) {
  // Built ahead of time in the prep worker (game/prep), when it was.
  const pre = takePrebuilt('canyon', view, { density })
  if (pre) return pre
  const L = canyonLayout(view)
  const { x0, z0, nx, nz, H, sandy } = L
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
  for (let j = 0; j < nz - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const a = j * nx + i
      const ha = H[a]
      const hb = H[a + 1]
      const hc = H[a + nx]
      const hd = H[a + nx + 1]
      if (ha === OUT || hb === OUT || hc === OUT || hd === OUT) continue
      const x = x0 + i * GRID
      const z = z0 + j * GRID
      const A = [x, ha, z]
      const B = [x + GRID, hb, z]
      const Cc = [x, hc, z + GRID]
      const D = [x + GRID, hd, z + GRID]
      const mb = place(x + GRID / 2, z + GRID / 2)
      const sand = Math.max(sandy[a], sandy[a + 1], sandy[a + nx], sandy[a + nx + 1])
      for (const [p, q, r] of [
        [A, D, B],
        [A, Cc, D],
      ]) {
        const ux = q[0] - p[0]
        const uy = q[1] - p[1]
        const uz = q[2] - p[2]
        const vx = r[0] - p[0]
        const vy = r[1] - p[1]
        const vz = r[2] - p[2]
        const nxv = uy * vz - uz * vy
        const nyv = uz * vx - ux * vz
        const nzv = ux * vy - uy * vx
        const ny = Math.abs(nyv) / (Math.hypot(nxv, nyv, nzv) || 1)
        const cx = (p[0] + q[0] + r[0]) / 3
        const cy = (p[1] + q[1] + r[1]) / 3
        const cz = (p[2] + q[2] + r[2]) / 3
        const hsh = hash(p[0] * 0.13 + q[2], r[0] + p[2] * 0.07)
        let color
        let pattern = 0
        if (sand > 0.5 && ny > 0.8) {
          color = hsh < 0.5 ? C.sand : C.sandB
          pattern = P.SNOW
        } else if (ny < 0.62) color = strataAt(cx, cy, cz)
        else if (ny < 0.86) color = hsh < 0.5 ? C.talus : C.talusB
        else {
          color = hsh < 0.5 ? C.dust : C.dustB
          pattern = P.SNOW
        }
        if (L.gorges.some((g) => cy < g.y - 110 && Math.abs(cx - g.x) < 800 && Math.abs(cz - g.z) < 800)) color = hsh < 0.5 ? C.deep : C.deepB
        mb.tri(p, q, r, color, pattern)
      }
    }
  }
  const signs = []
  arches(view, L, place)
  trestles(view, L, place)
  ghostTown(view, L, place, signs)
  oldMine(view, L, place, signs)
  mineTunnel(view, L, place)
  stormRidge(view, L, place)
  gorge(view, L, place, signs)
  grandFinish(view, L, place, signs)
  let triangles = 0
  const chunks = []
  for (const [key, mb] of tiles) {
    triangles += mb.triangles
    chunks.push({ key, geometry: mb.build(), triangles: mb.triangles })
  }
  return {
    chunks,
    cacti: scatterTiles(L.scatter, density, 'cactus'),
    rocks: scatterTiles(L.scatter, density, 'rock'),
    signs,
    heightAt: L.heightAt,
    storms: (view.decor.storms || []).map((r) => ({ from: r.from, to: r.to })),
    triangles,
    scatterCount: L.scatter.length,
  }
}
