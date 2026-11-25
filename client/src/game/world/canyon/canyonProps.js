import { Color } from 'three'

import { MeshBuilder } from '../../render/meshBuilder'
import { PATTERN as P } from '../../render/worldMaterial'

/**
 * The Desert Canyon's instanced props, as plain geometry on the shared world material
 * (vertex colour + pattern, no textures), each built once and cached until
 * `disposeCanyonProps()` (the zone's scenery calls it on unmount):
 *
 * - The zone's obstacle looks (client/src/game/track/obstacleSim.js SEPARATE_LOOKS), drawn
 *   by world/scenery/grandTour/canyonZone.jsx from a draw-only copy of the sim, so each one
 *   is modelled to the convention of the part it replaces: `tumbleweed` and `sandstone`
 *   (unit radius, scaled to the ball), `mineBucket` (origin at the hammer's pivot, hanging
 *   down -y, inside the head's box) on a `mineCrane` (the gantry, modelled for a 14 m road and
 *   scaled across), `mineCart` (a forklift's place: facing +X, origin on the ground, inside
 *   its 3.2 x 2.2 x 1.7 m collider) out of a `mineAdit` (a shed's place: doorway to +X, origin
 *   on its floor, 5 x 4.5 m).
 * - Saguaro cacti and desert rocks scattered round the roads (instanced, near the car only).
 */

const c = (hex) => new Color(hex)
const C = {
  weed: c('#b98a52'),
  weedDark: c('#8a6238'),
  weedLight: c('#d9b47a'),
  stoneA: c('#c0603a'),
  stoneB: c('#d98250'),
  stoneC: c('#a2472a'),
  stoneD: c('#e6a46a'),
  rust: c('#8a4a2a'),
  rustDark: c('#5e3020'),
  iron: c('#4a4644'),
  ironDark: c('#2e2b2a'),
  ore: c('#6e6a66'),
  oreDark: c('#4e4a47'),
  gold: c('#ffcf4a'),
  timber: c('#9a6a3e'),
  timberDark: c('#6e4a2a'),
  timberLight: c('#b98a58'),
  rope: c('#c8a46a'),
  rock: c('#b4583a'),
  rockDark: c('#8a3e28'),
  rockLight: c('#cf7a4c'),
  void: c('#140c0a'),
  lamp: c('#ffd27a'),
  cactus: c('#4f8a3a'),
  cactusDark: c('#3a6e2c'),
  cactusLight: c('#6aa04a'),
  flower: c('#ff6a8a'),
  wheel: c('#2a2624'),
  hub: c('#9a948e'),
}

const cache = new Map()
const memo = (key, make) => {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key)
}

/** Disposes every cached prop geometry (on the zone's unmount). */
export function disposeCanyonProps() {
  for (const g of cache.values()) g.dispose()
  cache.clear()
}

// ---- Helpers -------------------------------------------------------------------------

const ALL = (v) => ({ top: v, side: v, end: v, bottom: v })

/** A convex polygon wound so its normal faces `out`. */
function face(mb, pts, out, color, pattern = 0) {
  const u = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]]
  const v = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]]
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const p = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? [...pts].reverse() : pts
  for (let i = 1; i < p.length - 1; i += 1) mb.tri(p[0], p[i], p[i + 1], color, pattern)
}

/** An oriented square beam between two points, `t` thick. */
export function beam(mb, p0, p1, t, color, pattern = 0) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
  const len = Math.hypot(d[0], d[1], d[2]) || 1
  const ay = [d[0] / len, d[1] / len, d[2] / len]
  const rr = Math.abs(ay[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  let ax = [ay[1] * rr[2] - ay[2] * rr[1], ay[2] * rr[0] - ay[0] * rr[2], ay[0] * rr[1] - ay[1] * rr[0]]
  const al = Math.hypot(ax[0], ax[1], ax[2]) || 1
  ax = [ax[0] / al, ax[1] / al, ax[2] / al]
  const az = [ax[1] * ay[2] - ax[2] * ay[1], ax[2] * ay[0] - ax[0] * ay[2], ax[0] * ay[1] - ax[1] * ay[0]]
  mb.box([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], [t / 2, len / 2, t / 2], ax, ay, az, ALL(color), ALL(pattern))
}

/**
 * A prism along axis `ax` (0 x, 1 y, 2 z) centred on `c0`, from s0 to s1 along it, radius
 * r0 -> r1, n sides; `cap` -1 / 1 / 2 closes the start / end / both.
 */
function cyl(mb, c0, ax, s0, s1, r0, r1, n, color, { cap = 2, capColor = color, alt = null, phase = 0, pattern = 0 } = {}) {
  const pt = (s, r, a) => {
    const p = [...c0]
    const u = (ax + 1) % 3
    const v = (ax + 2) % 3
    p[ax] += s
    p[u] += Math.cos(a) * r
    p[v] += Math.sin(a) * r
    return p
  }
  const dir = [0, 0, 0]
  dir[ax] = Math.sign(s1 - s0) || 1
  for (let i = 0; i < n; i += 1) {
    const a0 = phase + (i / n) * Math.PI * 2
    const a1 = phase + ((i + 1) / n) * Math.PI * 2
    const am = (a0 + a1) / 2
    const out = [0, 0, 0]
    out[(ax + 1) % 3] = Math.cos(am)
    out[(ax + 2) % 3] = Math.sin(am)
    face(mb, [pt(s0, r0, a0), pt(s0, r0, a1), pt(s1, r1, a1), pt(s1, r1, a0)], out, alt && i % 2 ? alt : color, pattern)
    if (cap === -1 || cap === 2) face(mb, [pt(s0, r0, a0), pt(s0, r0, a1), [...c0].map((v, k) => (k === ax ? v + s0 : v))], dir.map((v) => -v), capColor)
    if (cap === 1 || cap === 2) face(mb, [pt(s1, r1, a0), pt(s1, r1, a1), [...c0].map((v, k) => (k === ax ? v + s1 : v))], dir, capColor)
  }
}

/** A unit ball of LON x LAT cells (poles on x), coloured per cell by `paint(i, j)`, its vertices scaled by `bump(j, i)`. */
function ball(mb, LON, LAT, paint, bump = () => 1) {
  const S = (j, i) => {
    const t = (j / LAT) * Math.PI
    const a = (i / LON) * Math.PI * 2
    const k = j <= 0 || j >= LAT ? 0.95 : bump(j, ((i % LON) + LON) % LON)
    return [Math.cos(t) * k, Math.sin(t) * Math.cos(a) * k, Math.sin(t) * Math.sin(a) * k]
  }
  for (let j = 0; j < LAT; j += 1) {
    for (let i = 0; i < LON; i += 1) {
      const t = ((j + 0.5) / LAT) * Math.PI
      const a = ((i + 0.5) / LON) * Math.PI * 2
      const mid = [Math.cos(t), Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a)]
      const color = paint(i, j)
      if (j === 0) face(mb, [S(0, 0), S(1, i), S(1, i + 1)], mid, color)
      else if (j === LAT - 1) face(mb, [S(j, i), S(j, i + 1), S(LAT, 0)], mid, color)
      else {
        face(mb, [S(j, i), S(j, i + 1), S(j + 1, i + 1)], mid, color)
        face(mb, [S(j, i), S(j + 1, i + 1), S(j + 1, i)], mid, color)
      }
    }
  }
}

// ---- Obstacle looks ------------------------------------------------------------------

/**
 * A tumbleweed (`buoys` with `look: 'tumbleweed'`; unit radius): a tangled ball of dry
 * twigs - jagged cells in three straw browns - with twig ends sticking out round it.
 */
export const tumbleweedGeometry = () =>
  memo('tumbleweed', () => {
    const mb = new MeshBuilder()
    const bump = (j, i) => 0.78 + 0.22 * (((i * 5 + j * 7) % 4) / 3)
    ball(mb, 10, 6, (i, j) => ((i + j) % 3 === 0 ? C.weedDark : (i * 3 + j) % 3 === 1 ? C.weedLight : C.weed), bump)
    for (let k = 0; k < 14; k += 1) {
      const a = k * 2.399
      const y = 1 - (2 * (k + 0.5)) / 14
      const r = Math.sqrt(1 - y * y)
      const d = [y, Math.cos(a) * r, Math.sin(a) * r]
      beam(mb, d.map((v) => v * 0.6), d.map((v, i) => v * 1.0 + (i === 1 ? 0.08 : 0)), 0.07, k % 2 ? C.weedDark : C.weedLight)
    }
    return mb.build()
  })

/**
 * A sandstone boulder (`buoys` with `heavy` and `look: 'sandstone'`; unit radius, scaled to
 * the iron ball's): a lumpy red rock, banded round the axis it rolls about like strata.
 */
export const sandstoneGeometry = () =>
  memo('sandstone', () => {
    const mb = new MeshBuilder()
    const bands = [C.stoneA, C.stoneB, C.stoneC, C.stoneD, C.stoneA, C.stoneC, C.stoneB, C.stoneA]
    const bump = (j, i) => 0.82 + 0.18 * (((i * 7 + j * 13) % 5) / 4)
    ball(mb, 12, 8, (i, j) => ((i * 5 + j * 3) % 11 === 0 ? C.stoneD : bands[j]), bump)
    return mb.build()
  })

/**
 * An ore bucket (`hammer` with `look: 'bucket'`), origin at the pivot like the mallet, inside
 * HAMMER.head's box (3.6 x 2.5 x 2.5 m round (0, -7.6, 0)): a riveted rusty steel tub,
 * wider at the top, heaped with ore (a glint of gold), on a bail and two chains.
 */
export const mineBucketGeometry = () =>
  memo('mineBucket', () => {
    const mb = new MeshBuilder()
    const cy = -7.6
    const top = cy + 0.95
    const bot = cy - 1.2
    const T = [1.75, 1.2]
    const B = [1.25, 0.85]
    const corner = (sx, sz, y, s) => [sx * s[0], y, sz * s[1]]
    const sides = [
      [[1, 1], [1, -1], [1, 0, 0]],
      [[1, -1], [-1, -1], [0, 0, -1]],
      [[-1, -1], [-1, 1], [-1, 0, 0]],
      [[-1, 1], [1, 1], [0, 0, 1]],
    ]
    for (const [a, b, out] of sides) {
      face(mb, [corner(a[0], a[1], bot, B), corner(b[0], b[1], bot, B), corner(b[0], b[1], top, T), corner(a[0], a[1], top, T)], out, out[0] ? C.rust : C.rustDark)
      // A riveted band round the rim, proud of the tub.
      const k = 0.06
      const o = (p) => [p[0] + out[0] * k, p[1], p[2] + out[2] * k]
      face(mb, [o(corner(a[0], a[1], top - 0.35, T)), o(corner(b[0], b[1], top - 0.35, T)), o(corner(b[0], b[1], top - 0.05, T)), o(corner(a[0], a[1], top - 0.05, T))], out, C.ironDark)
    }
    face(mb, [corner(1, 1, bot, B), corner(-1, 1, bot, B), corner(-1, -1, bot, B), corner(1, -1, bot, B)], [0, -1, 0], C.rustDark)
    // The heap of ore: a low lumpy pyramid, a gold nugget or two.
    const heap = [
      [1.6, top, 1.05],
      [-1.6, top, 1.05],
      [-1.6, top, -1.05],
      [1.6, top, -1.05],
    ]
    const peak = [0.2, top + 0.28, 0.1]
    for (let i = 0; i < 4; i += 1) face(mb, [heap[i], heap[(i + 1) % 4], peak], [heap[i][0] + heap[(i + 1) % 4][0], 1, heap[i][2] + heap[(i + 1) % 4][2]], i % 2 ? C.ore : C.oreDark)
    mb.aabb([0.5, top + 0.02, -0.2], [0.8, top + 0.2, 0.1], C.gold, ALL(P.GLOW))
    // Bail: two arms up from the tub's ends to a hook, chains up to the axle.
    for (const s of [-1, 1]) beam(mb, [s * 1.8, cy + 0.2, 0], [0, cy + 2.6, 0], 0.14, C.ironDark)
    cyl(mb, [0, cy + 2.7, 0], 1, -0.15, 0.25, 0.22, 0.22, 6, C.iron)
    for (const s of [-1, 1]) beam(mb, [0, cy + 2.9, s * 0.08], [0, -0.35, s * 0.08], 0.09, C.iron)
    mb.aabb([-0.32, -0.5, -0.3], [0.32, 0.3, 0.3], { top: C.timberDark, side: C.timberDark, end: C.iron, bottom: C.timberDark })
    return mb.build()
  })

/**
 * The ore buckets' mine crane (instead of the steel gantry), modelled for a 14 m road like
 * the hammer's (the sim scales x to the road): two timber portal frames 7.2 m apart with
 * X-braces, a heavy top beam, the axle with a sheave wheel and a lantern on each post.
 * Clear of the road and the swing (no colliders).
 */
export const mineCraneGeometry = () =>
  memo('mineCrane', () => {
    const mb = new MeshBuilder()
    const X = 7 - 0.3
    const Z = 3.6
    const pivot = 9.4
    const top = pivot + 0.32
    for (const z of [-Z, Z]) {
      for (const s of [-1, 1]) {
        const x = s * X
        mb.aabb([x - 0.3, 0.38, z - 0.3], [x + 0.3, top, z + 0.3], { top: C.timberDark, side: C.timber, end: C.timberLight, bottom: C.timberDark }, { side: P.PLANKS, end: P.PLANKS })
        mb.aabb([x - 0.45, 0.38, z - 0.45], [x + 0.45, 0.62, z + 0.45], C.rockDark)
        beam(mb, [x, top - 2.6, z], [x - s * 2.4, top, z], 0.2, C.timberDark)
        // Lantern on the post's outer face.
        mb.aabb([x + s * 0.32, top - 2.0, z - 0.18], [x + s * 0.68, top - 1.5, z + 0.18], C.lamp, ALL(P.GLOW))
      }
      mb.aabb([-X - 0.5, top, z - 0.36], [X + 0.5, top + 0.7, z + 0.36], { top: C.timberDark, side: C.timber, end: C.timberDark, bottom: C.timberDark }, { side: P.PLANKS })
      mb.aabb([-0.34, pivot - 0.45, z - 0.18], [0.34, top, z + 0.18], C.ironDark)
    }
    // Long side rails with X-braces between the portals, the axle and its sheave.
    for (const s of [-1, 1]) {
      mb.aabb([s * X - 0.2, top + 0.15, -Z + 0.3], [s * X + 0.2, top + 0.55, Z - 0.3], C.timberDark)
      beam(mb, [s * X, 1.2, -Z + 0.3], [s * X, top - 0.3, Z - 0.3], 0.16, C.timberDark)
      beam(mb, [s * X, 1.2, Z - 0.3], [s * X, top - 0.3, -Z + 0.3], 0.16, C.timberDark)
    }
    cyl(mb, [0, pivot, 0], 2, -Z + 0.18, Z - 0.18, 0.2, 0.2, 8, C.iron, { cap: 0 })
    cyl(mb, [0, pivot, 0], 2, -0.25, 0.25, 0.9, 0.9, 10, C.rust, { capColor: C.rustDark })
    // A sign board on the approach face: hazard orange.
    mb.aabb([-1.9, top + 0.7, Z - 0.14], [1.9, top + 1.6, Z + 0.14], { top: C.timberDark, side: c('#ff7a2c'), end: C.timberDark, bottom: C.timberDark }, { side: P.HAZARD })
    return mb.build()
  })

/**
 * A mine cart (`traffic` with `look: 'minecart'`), facing +X (its travel), origin on the
 * ground: an iron-banded rusty tub heaped with ore on four flanged wheels, a lamp at the
 * front. Inside the forklift's collider (+-1.6 x 0-2.2 x +-0.85 m).
 */
export const mineCartGeometry = () =>
  memo('mineCart', () => {
    const mb = new MeshBuilder()
    // Chassis on the axles.
    mb.aabb([-1.45, 0.42, -0.62], [1.45, 0.62, 0.62], C.ironDark)
    // Tub: wider at the top.
    const top = 1.75
    const bot = 0.62
    const T = [1.55, 0.82]
    const B = [1.3, 0.62]
    const corner = (sx, sz, y, s) => [sx * s[0], y, sz * s[1]]
    for (const [a, b, out] of [
      [[1, 1], [1, -1], [1, 0, 0]],
      [[1, -1], [-1, -1], [0, 0, -1]],
      [[-1, -1], [-1, 1], [-1, 0, 0]],
      [[-1, 1], [1, 1], [0, 0, 1]],
    ]) {
      face(mb, [corner(a[0], a[1], bot, B), corner(b[0], b[1], bot, B), corner(b[0], b[1], top, T), corner(a[0], a[1], top, T)], out, out[0] ? C.rustDark : C.rust)
      const o = (p) => [p[0] + out[0] * 0.05, p[1], p[2] + out[2] * 0.05]
      face(mb, [o(corner(a[0], a[1], top - 0.25, T)), o(corner(b[0], b[1], top - 0.25, T)), o(corner(b[0], b[1], top - 0.05, T)), o(corner(a[0], a[1], top - 0.05, T))], out, C.ironDark)
      face(mb, [o(corner(a[0], a[1], bot + 0.3, B)), o(corner(b[0], b[1], bot + 0.3, B)), o(corner(b[0], b[1], bot + 0.48, B)), o(corner(a[0], a[1], bot + 0.48, B))], out, C.ironDark)
    }
    const heap = [
      [1.45, top, 0.75],
      [-1.45, top, 0.75],
      [-1.45, top, -0.75],
      [1.45, top, -0.75],
    ]
    const peak = [0, top + 0.35, 0]
    for (let i = 0; i < 4; i += 1) face(mb, [heap[i], heap[(i + 1) % 4], peak], [heap[i][0] + heap[(i + 1) % 4][0], 1, heap[i][2] + heap[(i + 1) % 4][2]], i % 2 ? C.ore : C.oreDark)
    mb.aabb([-0.5, top + 0.05, -0.25], [-0.2, top + 0.22, 0.05], C.gold, ALL(P.GLOW))
    // Wheels: flanged discs along z.
    for (const x of [-0.95, 0.95]) {
      for (const s of [-1, 1]) {
        cyl(mb, [x, 0.42, 0], 2, s * 0.55, s * 0.78, 0.42, 0.42, 8, C.wheel, { capColor: C.hub })
        cyl(mb, [x, 0.42, 0], 2, s * 0.5, s * 0.55, 0.5, 0.5, 8, C.ironDark, { cap: 0 })
      }
    }
    // Couplings and a lamp at the front.
    for (const s of [-1, 1]) mb.aabb([s * 1.45 - 0.12, 0.46, -0.1], [s * 1.45 + 0.12, 0.6, 0.1], C.iron)
    mb.aabb([1.55, 1.1, -0.15], [1.6, 1.35, 0.15], C.lamp, ALL(P.GLOW))
    return mb.build()
  })

/**
 * A mine adit (the mine carts' "shed"), its doorway facing +X (the road), origin on the
 * floor's centre, 5 x 4.5 m: a block of red rock round a timbered entrance - posts, cap
 * beam, a dark gallery going back - a lantern, and the floor level with the road.
 */
export const mineAditGeometry = () =>
  memo('mineAdit', () => {
    const mb = new MeshBuilder()
    // Floor (top 1 cm below the road's level: the rails lie on it) and the dark gallery.
    mb.aabb([-2.5, -1.2, -2.25], [2.5, -0.01, 2.25], { top: c('#a8724a'), side: C.rockDark, end: C.rockDark, bottom: C.rockDark })
    mb.aabb([-2.5, -0.01, -1.6], [-2.2, 3.6, 1.6], C.void)
    // Rock round the opening: cheeks, a lintel block, a rough top.
    for (const s of [-1, 1]) mb.aabb([-2.5, -0.01, s > 0 ? 1.6 : -2.6], [2.3, 4.4, s > 0 ? 2.6 : -1.6], { top: C.rockLight, side: C.rock, end: C.rockDark, bottom: C.rockDark })
    mb.aabb([-2.5, 3.6, -1.6], [2.3, 4.4, 1.6], { top: C.rockLight, side: C.rock, end: C.rockDark, bottom: C.void })
    face(mb, [[-2.5, 4.4, -2.6], [2.3, 4.4, -2.6], [1.2, 5.6, -1.4], [-2.5, 5.9, -1.2]], [0, 1, -1], C.rockDark)
    face(mb, [[-2.5, 4.4, 2.6], [2.3, 4.4, 2.6], [1.2, 5.6, 1.4], [-2.5, 5.9, 1.2]], [0, 1, 1], C.rock)
    face(mb, [[-2.5, 5.9, -1.2], [1.2, 5.6, -1.4], [1.2, 5.6, 1.4], [-2.5, 5.9, 1.2]], [0, 1, 0], C.rockLight)
    face(mb, [[2.3, 4.4, -2.6], [2.3, 4.4, 2.6], [1.2, 5.6, 1.4], [1.2, 5.6, -1.4]], [1, 1, 0], C.rock)
    // Inner faces of the opening (dark, so the carts come out of the gloom).
    for (const s of [-1, 1]) face(mb, [[-2.2, 0, s * 1.6], [2.3, 0, s * 1.6], [2.3, 3.6, s * 1.6], [-2.2, 3.6, s * 1.6]], [0, 0, -s], c('#3a2018'))
    // Timber set: two posts and a cap beam proud of the rock.
    for (const s of [-1, 1]) mb.aabb([2.3, -0.01, s * 1.5 - 0.2], [2.6, 3.7, s * 1.5 + 0.2], { top: C.timberDark, side: C.timber, end: C.timberLight, bottom: C.timberDark }, { side: P.PLANKS })
    mb.aabb([2.25, 3.55, -1.95], [2.65, 4.0, 1.95], { top: C.timberDark, side: C.timber, end: C.timberLight, bottom: C.timberDark }, { side: P.PLANKS })
    mb.aabb([2.6, 2.6, 1.75], [2.85, 3.0, 2.05], C.lamp, ALL(P.GLOW))
    return mb.build()
  })

/** The zone's obstacle look geometries by part kind (obstacleSim SEPARATE_LOOKS). */
export const CANYON_LOOKS = {
  tumbleweed: tumbleweedGeometry,
  sandstone: sandstoneGeometry,
  mineBucket: mineBucketGeometry,
  mineCrane: mineCraneGeometry,
  mineCart: mineCartGeometry,
  mineAdit: mineAditGeometry,
}

// ---- Scatter -------------------------------------------------------------------------

/**
 * A saguaro, ~7 m tall at scale 1 (origin at its foot, sunk a little): a ribbed trunk
 * (alternating greens) with a rounded top and two arms that elbow out then turn up, a
 * flower or two on top (~110 triangles).
 */
export const cactusGeometry = () =>
  memo('cactus', () => {
    const mb = new MeshBuilder()
    const n = 6
    const o = { cap: 0, alt: C.cactusDark, phase: 0.3 }
    cyl(mb, [0, 0, 0], 1, -0.5, 6.2, 0.46, 0.42, n, C.cactus, o)
    cyl(mb, [0, 0, 0], 1, 6.2, 6.9, 0.42, 0.12, n, C.cactusLight, { ...o, cap: 1 })
    // Arms: right (low, long), left (higher, shorter).
    for (const [s, y0, out, up] of [
      [1, 2.4, 1.3, 3.0],
      [-1, 3.4, 1.0, 2.1],
    ]) {
      cyl(mb, [0, y0, 0], 0, 0.2 * s, out * s, 0.3, 0.3, n, C.cactus, { ...o, cap: 0 })
      cyl(mb, [out * s, 0, 0], 1, y0 - 0.25, y0 + up, 0.3, 0.27, n, C.cactus, o)
      cyl(mb, [out * s, 0, 0], 1, y0 + up, y0 + up + 0.45, 0.27, 0.08, n, C.cactusLight, { ...o, cap: 1 })
    }
    mb.aabb([-0.12, 6.85, -0.12], [0.12, 7.05, 0.12], C.flower)
    return mb.build()
  })

/** A desert rock, ~2 m across at scale 1 (origin at its foot): two lumpy blobs, sandstone reds (~32 triangles). */
export const rockGeometry = () =>
  memo('rock', () => {
    const mb = new MeshBuilder()
    const lump = (x, y, z, rx, ry, rz, a, b) => {
      const pts = [
        [x + rx, y, z + rz * 0.2],
        [x + rx * 0.2, y, z + rz],
        [x - rx, y, z - rz * 0.1],
        [x - rx * 0.1, y, z - rz],
      ]
      const top = [x + rx * 0.15, y + ry, z - rz * 0.1]
      const bot = [x, y - ry * 0.5, z]
      for (let i = 0; i < 4; i += 1) {
        const p = pts[i]
        const q = pts[(i + 1) % 4]
        const mid = [(p[0] + q[0]) / 2 - x, 0, (p[2] + q[2]) / 2 - z]
        face(mb, [p, q, top], [mid[0], ry, mid[2]], i % 2 ? a : b)
        face(mb, [p, q, bot], [mid[0], -ry, mid[2]], C.rockDark)
      }
    }
    lump(0, 0.35, 0, 1.1, 1.3, 0.9, C.rock, C.rockLight)
    lump(0.9, 0.2, 0.5, 0.7, 0.8, 0.6, C.stoneB, C.rock)
    return mb.build()
  })
