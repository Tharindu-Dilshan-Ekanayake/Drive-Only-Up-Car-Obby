import { Color } from 'three'

import { PALETTE } from '../palette'
import { MeshBuilder } from '../render/meshBuilder'
import { PATTERN } from '../render/worldMaterial'
import { LASER, PONTOON } from './obstacleSim'

/**
 * Geometry for every instanced prop: obstacles, coins, item crates. Each is built once
 * (module-level cache), sized so the instance matrix only needs position + rotation
 * (+ the scale the obstacle sim gives). All drawn with the shared world material, so
 * every detail here is vertex colour + procedural pattern: no textures.
 *
 * Props the sim scales (containers, booms, rams, decks, shutters, chute walls) are
 * modelled at a nominal real size in metres and shrunk to unit size at the end
 * (`unitScale`), so chamfers, trims and hazard stripes come out the right size once the
 * instance scale stretches them back. Every prop stays inside its collider's outline
 * (give or take a couple of centimetres of trim), and within a few hundred triangles:
 * instancing multiplies them.
 */

const c = (hex) => new Color(hex)
const HAZ = c(PALETTE.hazardYellow)
const HAZ_DARK = c(PALETTE.hazardBlack)
const DARK = c('#2b3038')
const RUBBER = c('#202429')
const GUNMETAL = c('#3d444d')
const STEEL = c(PALETTE.steel)
const STEEL_DARK = c(PALETTE.steelDark)
const STEEL_LIGHT = c('#aab6c1')
const WHITE = c('#f4f7fb')
const RED = c('#e2453b')
const LIGHT_RED = c('#ff3b30')
const AMBER = c('#ffb020')
const ORANGE = c(PALETTE.gateOrange)
const P = PATTERN

const cache = new Map()
const memo = (key, make) => {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key)
}

// ---- Modelling helpers ----------------------------------------------------------

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm3 = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
/** Pattern coordinate: distance along `dir` (not normalised: [1, 1, 0] gives diagonal stripes), times k. */
const along = (dir, k = 1) => (q) => dot3(q, dir) * k

/**
 * A convex polygon wound so its normal faces `out`, fanned into triangles. `coord`: a
 * function of the point, or an array of per-point pattern coordinates.
 */
function poly(mb, pts, out, color, pattern = 0, coord = null) {
  const n = cross3(sub3(pts[1], pts[0]), sub3(pts[2], pts[0]))
  const flip = dot3(n, out) < 0
  const p = flip ? [...pts].reverse() : pts
  let k = pts.map((q, i) => (Array.isArray(coord) ? coord[i] : coord ? coord(q) : 0))
  if (flip) k = k.reverse()
  for (let i = 1; i < p.length - 1; i += 1) mb.tri(p[0], p[i], p[i + 1], color, pattern, [k[0], k[i], k[i + 1]])
}

/**
 * Box from min to max with every edge chamfered by `b` (44 triangles; b = 0 gives a plain
 * 12-triangle box, handy for a pattern coordinate function). Colours and
 * patterns per face: top, bottom, side (+-x), end (+-z) and bevel (the chamfers; by
 * default the neighbouring upright face's). `coord` maps a point to its pattern coordinate.
 */
function bevelBox(mb, min, max, b, colors, patterns = {}, coord = null, skip = []) {
  const single = colors.isColor
  const col = (name, fb) => (single ? colors : colors[name] || colors[fb] || colors.side)
  const pat = (name, fb) => patterns[name] ?? (fb ? patterns[fb] : undefined) ?? (name === 'end' ? patterns.side : undefined) ?? 0
  const cx = (min[0] + max[0]) / 2
  const cy = (min[1] + max[1]) / 2
  const cz = (min[2] + max[2]) / 2
  const W = (max[0] - min[0]) / 2
  const H = (max[1] - min[1]) / 2
  const D = (max[2] - min[2]) / 2
  const bx = Math.min(b, W * 0.45)
  const by = Math.min(b, H * 0.45)
  const bz = Math.min(b, D * 0.45)
  // A corner's point that is flush with face `axis` (0 x, 1 y, 2 z).
  const pt = (sx, sy, sz, axis) => [cx + sx * (axis === 0 ? W : W - bx), cy + sy * (axis === 1 ? H : H - by), cz + sz * (axis === 2 ? D : D - bz)]
  const face = (pts, out, name, upright) => {
    if (skip.includes(name)) return
    const bevel = upright !== undefined
    poly(mb, pts, out, bevel ? col('bevel', upright) : col(name, 'side'), bevel ? pat('bevel', upright) : pat(name), coord)
  }
  for (const s of [-1, 1]) {
    face([pt(s, -1, -1, 0), pt(s, 1, -1, 0), pt(s, 1, 1, 0), pt(s, -1, 1, 0)], [s, 0, 0], 'side')
    face([pt(-1, s, -1, 1), pt(1, s, -1, 1), pt(1, s, 1, 1), pt(-1, s, 1, 1)], [0, s, 0], s > 0 ? 'top' : 'bottom')
    face([pt(-1, -1, s, 2), pt(1, -1, s, 2), pt(1, 1, s, 2), pt(-1, 1, s, 2)], [0, 0, s], 'end')
    for (const t of b > 0 ? [-1, 1] : []) {
      face([pt(s, t, -1, 0), pt(s, t, 1, 0), pt(s, t, 1, 1), pt(s, t, -1, 1)], [s, t, 0], 'bevel', 'side')
      face([pt(-1, s, t, 1), pt(1, s, t, 1), pt(1, s, t, 2), pt(-1, s, t, 2)], [0, s, t], 'bevel', 'end')
      face([pt(s, -1, t, 0), pt(s, 1, t, 0), pt(s, 1, t, 2), pt(s, -1, t, 2)], [s, 0, t], 'bevel', 'side')
      for (const u of [-1, 1]) face([pt(s, t, u, 0), pt(s, t, u, 1), pt(s, t, u, 2)], [s, t, u], 'bevel', 'side')
    }
  }
}

/** A point on a ring round axis `ax` (0 x, 1 y, 2 z) through c: axial offset s, radius r, angle a. */
function ringPt(c0, ax, s, r, a) {
  const p = [c0[0], c0[1], c0[2]]
  p[ax] += s
  p[(ax + 1) % 3] += Math.cos(a) * r
  p[(ax + 2) % 3] += Math.sin(a) * r
  return p
}

/**
 * Cylinder / frustum / cone along axis `ax` through c, from axial offset s0 (radius r0)
 * to s1 (radius r1), n sides. `cap`: 0 none, 1 the s1 end, -1 the s0 end, 2 both (each
 * cap one n-gon). `alt`: a second colour for every other side. `inward`: faces point at
 * the axis (the inside of a tube, its caps facing in).
 */
function cyl(mb, c0, ax, s0, s1, r0, r1, n, color, { cap = 2, capColor = color, pattern = 0, capPattern = 0, coord = null, alt = null, phase = 0, inward = false } = {}) {
  // Caps face away from the solid (into the tube for an inward one).
  const dir = [0, 0, 0]
  dir[ax] = (s1 > s0 ? 1 : -1) * (inward ? -1 : 1)
  for (let i = 0; i < n; i += 1) {
    const a0 = phase + (i / n) * Math.PI * 2
    const a1 = phase + ((i + 1) / n) * Math.PI * 2
    const out = ringPt([0, 0, 0], ax, 0, inward ? -1 : 1, (a0 + a1) / 2)
    const col = alt && i % 2 ? alt : color
    const q0 = ringPt(c0, ax, s0, r0, a0)
    const q1 = ringPt(c0, ax, s0, r0, a1)
    const q2 = ringPt(c0, ax, s1, r1, a1)
    const q3 = ringPt(c0, ax, s1, r1, a0)
    if (r1 <= 0) poly(mb, [q0, q1, q2], out, col, pattern, coord)
    else if (r0 <= 0) poly(mb, [q0, q2, q3], out, col, pattern, coord)
    else poly(mb, [q0, q1, q2, q3], out, col, pattern, coord)
  }
  const ring = (s, r) => Array.from({ length: n }, (_, i) => ringPt(c0, ax, s, r, phase + (i / n) * Math.PI * 2))
  if ((cap === 1 || cap === 2) && r1 > 0) poly(mb, ring(s1, r1), dir, capColor, capPattern, coord)
  if ((cap === -1 || cap === 2) && r0 > 0) poly(mb, ring(s0, r0), [-dir[0], -dir[1], -dir[2]], capColor, capPattern, coord)
}

/** Flat ring (annulus) round axis `ax` at axial offset s, facing `side` (+1 / -1) along the axis. */
function annulus(mb, c0, ax, s, rIn, rOut, n, side, color, pattern = 0, phase = 0) {
  const out = [0, 0, 0]
  out[ax] = side
  for (let i = 0; i < n; i += 1) {
    const a0 = phase + (i / n) * Math.PI * 2
    const a1 = phase + ((i + 1) / n) * Math.PI * 2
    poly(mb, [ringPt(c0, ax, s, rIn, a0), ringPt(c0, ax, s, rOut, a0), ringPt(c0, ax, s, rOut, a1), ringPt(c0, ax, s, rIn, a1)], out, color, pattern)
  }
}

/** A beam from a to b: half width hw (across, perpendicular to `up`), half depth hd. */
function beam(mb, a, b, hw, hd, up, colors, patterns = {}) {
  const az = norm3(sub3(b, a))
  const ax = norm3(cross3(up, az))
  const ay = cross3(az, ax)
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  mb.box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [hw, hd, len / 2], ax, ay, az, colors.isColor ? { top: colors, side: colors, end: colors, bottom: colors } : colors, patterns)
}

/** Any convex six-faced solid from its 8 corners (box order: 0-3 one end, 4-7 the other, same winding). */
function hexa(mb, p, color, pattern = 0, coord = null) {
  const cen = [0, 1, 2].map((i) => p.reduce((s, q) => s + q[i], 0) / 8)
  for (const f of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]]) {
    const pts = f.map((i) => p[i])
    const fc = [0, 1, 2].map((i) => pts.reduce((s, q) => s + q[i], 0) / 4)
    poly(mb, pts, sub3(fc, cen), color, pattern, coord)
  }
}

/**
 * Corrugated sheet over the rectangle o + [0..1]u + [0..1]v: `count` ridges along u,
 * peaking `depth` along `out`. The facets alternate their tilt, so the light picks
 * out every rib (no extra colours needed, which keeps instance tints honest).
 */
function corrugate(mb, o, u, v, out, depth, count, color, colorB = color) {
  const at = (f, d) => [o[0] + u[0] * f + out[0] * d, o[1] + u[1] * f + out[1] * d, o[2] + u[2] * f + out[2] * d]
  const up = (p) => [p[0] + v[0], p[1] + v[1], p[2] + v[2]]
  for (let i = 0; i < count; i += 1) {
    const p0 = at(i / count, 0)
    const pm = at((i + 0.5) / count, depth)
    const p1 = at((i + 1) / count, 0)
    poly(mb, [p0, pm, up(pm), up(p0)], out, color)
    poly(mb, [pm, p1, up(p1), up(pm)], out, colorB)
  }
}

/** Shrinks a prop modelled at its nominal size (metres) to the unit size the sim scales back up; re-derives the flat normals. */
function unitScale(mb, sx, sy, sz) {
  const p = mb.pos
  const n = mb.nrm
  for (let i = 0; i < p.length; i += 3) {
    p[i] /= sx
    p[i + 1] /= sy
    p[i + 2] /= sz
  }
  for (let i = 0; i < p.length; i += 9) {
    const nn = norm3(cross3([p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]], [p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]]))
    for (let k = 0; k < 9; k += 3) {
      n[i + k] = nn[0]
      n[i + k + 1] = nn[1]
      n[i + k + 2] = nn[2]
    }
  }
  return mb
}

const ALL = (v) => ({ top: v, side: v, end: v, bottom: v })

// ---- Obstacles ------------------------------------------------------------------

/**
 * Marine mooring bollard (collider 1.1 x 1.7 x 1.1): a bolted base flange, a waisted
 * yellow barrel with a reflective band, and the dark flared head ropes loop over.
 * Origin at its base.
 */
export const bollardGeometry = () =>
  memo('bollard', () => {
    const mb = new MeshBuilder()
    const O = [0, 0, 0]
    const ph = Math.PI / 8
    const o = { phase: ph, cap: 0 }
    cyl(mb, O, 1, 0, 0.14, 0.64, 0.6, 8, GUNMETAL, { ...o, cap: 1, alt: DARK })
    cyl(mb, O, 1, 0.14, 0.84, 0.5, 0.475, 8, HAZ, o)
    cyl(mb, O, 1, 0.84, 1.06, 0.475, 0.47, 8, c('#eef3f8'), { ...o, pattern: P.GLOW })
    cyl(mb, O, 1, 1.06, 1.28, 0.47, 0.47, 8, HAZ, o)
    cyl(mb, O, 1, 1.28, 1.38, 0.47, 0.63, 8, DARK, o)
    cyl(mb, O, 1, 1.38, 1.56, 0.63, 0.63, 8, DARK, { ...o, alt: GUNMETAL })
    cyl(mb, O, 1, 1.56, 1.7, 0.63, 0.44, 8, DARK, { ...o, cap: 1 })
    return mb.build()
  })

/**
 * Giant swinging mallet, origin at its pivot, hanging down -y (matches obstacleSim's
 * HAMMER: arm 7.6 m to the head's centre, head 3.6 x 2.5 x 2.5 m). It swings in its x-y
 * plane, so the driver sees the +z side: a red octagonal head with a hazard band, steel
 * striking caps and rubber rings, on a striped steel handle with a hub round the axle.
 * Stays inside the head's box collider.
 */
export const hammerGeometry = () =>
  memo('hammer', () => {
    const mb = new MeshBuilder()
    const arm = 7.6
    const head = [0, -arm, 0]
    const red = c('#d8322b')
    const redB = c('#b9271f')
    const ph = Math.PI / 8
    // An octagon whose flats are at `apothem` from the axis (flats square to the box).
    const r = (apothem) => apothem / Math.cos(Math.PI / 8)
    // Head: red body either side of a raised hazard band, gunmetal collars, steel faces.
    for (const s of [-1, 1]) {
      cyl(mb, head, 0, s * 0.55, s * 1.42, r(1.14), r(1.14), 8, red, { cap: 0, alt: redB, phase: ph })
      cyl(mb, head, 0, s * 1.42, s * 1.62, r(1.25), r(1.25), 8, GUNMETAL, { cap: 2, capColor: DARK, phase: ph, alt: DARK })
      cyl(mb, head, 0, s * 1.62, s * 1.8, r(1.18), r(1.1), 8, STEEL_LIGHT, { cap: 1, capColor: c('#c9d3dc'), phase: ph, alt: STEEL })
    }
    cyl(mb, head, 0, -0.55, 0.55, r(1.2), r(1.2), 8, HAZ, { cap: 2, capColor: DARK, phase: ph, pattern: P.HAZARD, coord: along([1, 1, 1], 1.4) })
    // Handle: a square steel shaft with hazard stripes, a collar where it meets the head.
    const top = -0.45
    const bottom = -arm + 1.14
    mb.box([0, (top + bottom) / 2, 0], [0.24, (top - bottom) / 2, 0.24], [1, 0, 0], [0, 1, 0], [0, 0, 1], { top: DARK, side: HAZ, end: HAZ, bottom: DARK }, { side: P.HAZARD, end: P.HAZARD }, { along: [0.6, 1, 0.6], skip: ['top', 'bottom'] })
    bevelBox(mb, [-0.42, bottom - 0.06, -0.42], [0.42, bottom + 0.42, 0.42], 0.08, { top: GUNMETAL, side: GUNMETAL, end: GUNMETAL, bottom: DARK }, {}, null, ['bottom'])
    // Hub round the axle (along z) with cheek plates.
    bevelBox(mb, [-0.5, -0.75, -0.4], [0.5, 0.35, 0.4], 0.12, { top: STEEL_DARK, side: STEEL_DARK, end: GUNMETAL, bottom: STEEL_DARK })
    for (const s of [-1, 1]) cyl(mb, [0, 0, 0], 2, s * 0.4, s * 0.52, 0.42, 0.42, 8, STEEL_LIGHT, { cap: 1, capColor: DARK, phase: ph })
    return mb.build()
  })

/**
 * The hammer's gantry, modelled for a 14 m road (the sim scales x to the real width),
 * origin at the road centre: two portal frames 7.2 m apart along the road, legs on the
 * curbs, striped top beams, the axle the hammer hangs from, braces and beacons. Leaves
 * the road and the swing between the portals clear (no colliders: it's out of the way).
 */
export const hammerFrameGeometry = () =>
  memo('hammerFrame', () => {
    const mb = new MeshBuilder()
    const X = 7 - 0.3
    const Z = 3.6
    const pivot = 9.4
    const top = pivot + 0.32
    for (const z of [-Z, Z]) {
      for (const s of [-1, 1]) {
        const x = s * X
        bevelBox(mb, [x - 0.26, 0.38, z - 0.26], [x + 0.26, top, z + 0.26], 0.07, { top: DARK, side: HAZ, end: HAZ, bottom: DARK }, { side: P.HAZARD, end: P.HAZARD, bevel: P.HAZARD }, along([0.5, 1, 0.5], 1.4), ['top', 'bottom'])
        mb.aabb([x - 0.42, 0.38, z - 0.42], [x + 0.42, 0.5, z + 0.42], GUNMETAL)
        // Knee brace up to the beam.
        beam(mb, [x, top - 2.4, z], [x - s * 2.2, top, z], 0.1, 0.12, [0, 0, 1], STEEL_DARK)
      }
      // Top beam: hazard stripes along the faces the driver sees.
      bevelBox(mb, [-X - 0.4, top, z - 0.32], [X + 0.4, top + 0.72, z + 0.32], 0.08, { top: STEEL, side: STEEL, end: HAZ, bottom: DARK, bevel: STEEL }, { end: P.HAZARD }, along([1, 1, 0], 1.6))
      // Hanger plate down to the axle.
      mb.aabb([-0.34, pivot - 0.45, z - 0.18], [0.34, top, z + 0.18], STEEL_DARK)
      // Beacons on the outer ends.
      for (const s of [-1, 1]) cyl(mb, [s * X, top + 0.72, z], 1, 0, 0.32, 0.18, 0.13, 6, AMBER, { cap: 1, pattern: P.PULSE, capPattern: P.PULSE })
    }
    // Side rails joining the portals along the road, and the axle.
    for (const s of [-1, 1]) mb.aabb([s * X - 0.18, top + 0.2, -Z + 0.32], [s * X + 0.18, top + 0.52, Z - 0.32], STEEL_DARK)
    cyl(mb, [0, pivot, 0], 2, -Z + 0.18, Z - 0.18, 0.2, 0.2, 8, GUNMETAL, { cap: 0, alt: STEEL_DARK })
    // Warning board on the approach face of the front beam.
    mb.aabb([-1.9, top + 0.72, Z - 0.16], [1.9, top + 1.7, Z + 0.16], { top: ORANGE, side: ORANGE, end: ORANGE, bottom: DARK })
    mb.aabb([-2.05, top + 0.72, Z - 0.1], [2.05, top + 1.84, Z + 0.1], DARK)
    return mb.build()
  })

/**
 * ISO shipping container, 2.6 x 2.6 x 6 m nominal (the sim's scale), shrunk to unit size:
 * corrugated long sides, a frame of corner posts and rails, cargo doors with locking
 * bars at the +z end (the end that faces the approaching driver). Modelled in greys
 * over white so the per-instance colour tints the whole box.
 */
export const containerGeometry = () =>
  memo('container', () => {
    const mb = new MeshBuilder()
    const X = 1.3
    const Y = 1.3
    const Z = 3
    const post = 0.15
    const rail = 0.17
    const frame = c('#c2c9d1')
    const bar = c('#7d8792')
    // Roof and floor slabs (the roof a touch lighter), corner posts between them.
    mb.aabb([-X, Y - rail, -Z], [X, Y, Z], { top: c('#e8edf2'), side: frame, end: frame, bottom: frame })
    mb.aabb([-X, -Y, -Z], [X, -Y + rail, Z], frame)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) mb.aabb([sx > 0 ? X - post : -X, -Y + rail, sz > 0 ? Z - post : -Z], [sx > 0 ? X : -X + post, Y - rail, sz > 0 ? Z : -Z + post], frame)
    }
    // Corrugated sides: ridges peak at the collider face.
    const h = 2 * (Y - rail)
    for (const s of [-1, 1]) corrugate(mb, [s * (X - 0.07), -Y + rail, -Z + post], [0, 0, 2 * (Z - post)], [0, h, 0], [s, 0, 0], 0.07, 16, WHITE, c('#dfe5eb'))
    // Door end: two leaves, the seam, four locking bars with their cam keepers.
    mb.aabb([-X + post, -Y + rail, Z - 0.12], [X - post, Y - rail, Z - 0.05], WHITE)
    mb.aabb([-0.02, -Y + rail, Z - 0.06], [0.02, Y - rail, Z - 0.02], bar)
    for (const x of [-0.82, -0.32, 0.32, 0.82]) {
      mb.aabb([x - 0.03, -Y + rail + 0.04, Z - 0.05], [x + 0.03, Y - rail - 0.04, Z - 0.01], bar)
    }
    // Blind end.
    mb.aabb([-X + post, -Y + rail, -Z + 0.05], [X - post, Y - rail, -Z + 0.12], frame)
    return unitScale(mb, 2 * X, 2 * Y, 2 * Z).build()
  })

/**
 * Spinner boom, 7.4 x 0.9 x 0.9 m nominal (scaled by the sim): a chamfered box girder
 * in diagonal hazard stripes with rubber bumpers and red tip lights at both ends.
 */
export const boomGeometry = () =>
  memo('boom', () => {
    const mb = new MeshBuilder()
    const L = 3.7
    const H = 0.45
    const end = 0.42
    bevelBox(mb, [-L + end, -H, -H], [L - end, H, H], 0.1, { top: HAZ, side: HAZ, end: HAZ, bottom: DARK }, { top: P.HAZARD, end: P.HAZARD, bevel: P.HAZARD }, along([1, 1, 1], 2))
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? L - end : -L
      bevelBox(mb, [x0, -H, -H], [x0 + end, H, H], 0.13, RUBBER)
      // Tip light right through the bumper: shows on both faces and the top.
      const xm = s * (L - 0.2)
      mb.aabb([xm - 0.1, H - 0.2, -H - 0.03], [xm + 0.1, H + 0.03, H + 0.03], LIGHT_RED, ALL(P.GLOW))
    }
    return unitScale(mb, 2 * L, 2 * H, 2 * H).build()
  })

/**
 * Sweeper-deck arm (shared/track.js SPINNER: reach 14.1, tail 2.2), modelled at its true
 * size with its origin on the pivot, reaching out along +x: a hazard-striped box girder
 * (0.9 m square, the collider) with a dark spine, amber marker lamps along both faces
 * every ~2 m (so its sweep reads from far off), a rubber bumper and a red tip light at
 * the tip, and a dark counterweight block on the short tail.
 */
export const spinbarGeometry = () =>
  memo('spinbar', () => {
    const mb = new MeshBuilder()
    const L = 14.1
    const T = 2.2
    const H = 0.45
    const end = 0.6
    bevelBox(mb, [-T, -H, -H], [L - end, H, H], 0.1, { top: HAZ, side: HAZ, end: HAZ, bottom: DARK }, { top: P.HAZARD, end: P.HAZARD, bevel: P.HAZARD }, along([1, 1, 1], 2))
    // Dark spine along the top (2 cm proud), from the hub out.
    mb.aabb([1.6, H, -0.12], [L - end - 0.3, H + 0.02, 0.12], DARK)
    // Marker lamps along both faces.
    for (let x = 2.6; x <= L - 1.6 + 1e-6; x += (L - 4.2) / 5) mb.aabb([x - 0.16, -0.12, -H - 0.03], [x + 0.16, 0.12, H + 0.03], AMBER, ALL(P.GLOW))
    bevelBox(mb, [L - end, -H, -H], [L, H, H], 0.13, RUBBER)
    mb.aabb([L - 0.37, H - 0.22, -H - 0.03], [L - 0.13, H + 0.03, H + 0.03], LIGHT_RED, ALL(P.GLOW))
    // Counterweight on the tail (within the collider's width; it clears the lanes).
    bevelBox(mb, [-T, -H - 0.02, -H - 0.02], [-1.0, H + 0.4, H + 0.02], 0.08, { top: GUNMETAL, side: DARK, end: DARK, bottom: DARK })
    return mb.build()
  })

/**
 * Spinner hub (collider 1.8 x 3.2 x 1.8): a crane slewing mast - striped plinth, steel
 * column, the slewing ring at boom height, a cab cap and a red beacon. Origin at its base.
 */
export const hubGeometry = () =>
  memo('hub', () => {
    const mb = new MeshBuilder()
    const O = [0, 0, 0]
    const ph = Math.PI / 10
    cyl(mb, O, 1, 0, 0.34, 1.02, 0.96, 10, HAZ, { cap: 1, capColor: DARK, pattern: P.HAZARD, coord: along([1, 1, 1], 2.2), phase: ph })
    cyl(mb, O, 1, 0.34, 2.55, 0.8, 0.8, 10, STEEL, { cap: 0, phase: ph, alt: c('#2a6878') })
    cyl(mb, O, 1, 2.55, 3.0, 0.8, 0.8, 10, HAZ, { cap: 0, phase: ph, pattern: P.HAZARD, coord: along([1, 1, 1], 2.2) })
    cyl(mb, O, 1, 0.55, 1.65, 0.94, 0.94, 10, DARK, { cap: 2, capColor: GUNMETAL, phase: ph, alt: GUNMETAL })
    cyl(mb, O, 1, 3.0, 3.2, 0.9, 0.86, 10, DARK, { cap: 1, capColor: GUNMETAL, phase: ph })
    cyl(mb, O, 1, 3.2, 3.52, 0.28, 0.2, 6, LIGHT_RED, { cap: 1, pattern: P.PULSE, capPattern: P.PULSE })
    return mb.build()
  })

/**
 * Runaway buoy: a ball (unit radius, scaled by the sim) in red and white gores with
 * glowing yellow lamp caps at the poles, so its tumble reads whichever way it rolls.
 */
export const buoyGeometry = () =>
  memo('buoy', () => {
    const mb = new MeshBuilder()
    const LON = 12
    const LAT = 8
    const S = (t, a) => [Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)]
    for (let j = 0; j < LAT; j += 1) {
      const t0 = (j / LAT) * Math.PI
      const t1 = ((j + 1) / LAT) * Math.PI
      for (let i = 0; i < LON; i += 1) {
        const a0 = (i / LON) * Math.PI * 2
        const a1 = ((i + 1) / LON) * Math.PI * 2
        const out = S((t0 + t1) / 2, (a0 + a1) / 2)
        const polar = j === 0 || j === LAT - 1
        const color = polar ? HAZ : i % 2 ? WHITE : RED
        const pattern = polar ? P.GLOW : 0
        if (j === 0) poly(mb, [S(0, 0), S(t1, a0), S(t1, a1)], out, color, pattern)
        else if (j === LAT - 1) poly(mb, [S(t0, a0), S(t0, a1), S(Math.PI, 0)], out, color, pattern)
        else poly(mb, [S(t0, a0), S(t0, a1), S(t1, a1), S(t1, a0)], out, color, pattern)
      }
    }
    return mb.build()
  })

/**
 * Iron ballast ball (unit radius, scaled by the sim to IRONBALL_R): dark cast-iron gores,
 * two tones so the roll reads, round a hazard band - whole yellow and black gores (seven
 * stripe pairs round, no seam) - that runs round it like a tyre tread: its poles are on
 * the x axis, which the sim keeps along the road's right (the axis it rolls about), so
 * an oncoming driver sees the band spin straight down the middle of the ball.
 */
export const ironballGeometry = () =>
  memo('ironball', () => {
    const mb = new MeshBuilder()
    const LON = 14
    const LAT = 8
    const ironA = c('#4a525c')
    const ironB = c('#363c44')
    const S = (t, a) => [Math.cos(t), Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a)]
    for (let j = 0; j < LAT; j += 1) {
      const t0 = (j / LAT) * Math.PI
      const t1 = ((j + 1) / LAT) * Math.PI
      const band = j === 3 || j === 4
      for (let i = 0; i < LON; i += 1) {
        const a0 = (i / LON) * Math.PI * 2
        const a1 = ((i + 1) / LON) * Math.PI * 2
        const out = S((t0 + t1) / 2, (a0 + a1) / 2)
        // The band: yellow and black gores in turn (14 round: seven stripe pairs).
        const color = band ? (i % 2 ? HAZ_DARK : HAZ) : (i + j) % 2 ? ironA : ironB
        if (j === 0) poly(mb, [S(0, 0), S(t1, a0), S(t1, a1)], out, color)
        else if (j === LAT - 1) poly(mb, [S(t0, a0), S(t0, a1), S(Math.PI, 0)], out, color)
        else poly(mb, [S(t0, a0), S(t0, a1), S(t1, a1), S(t1, a0)], out, color)
      }
    }
    return mb.build()
  })

/**
 * A loose pontoon plank of the driftwood bridge (the moving ones), modelled 8 x 6 m
 * (PONTOON.model; the sim scales it to the real plank), origin at the middle of its top
 * face: a dark waterlogged deck of planks across the road, hazard lips along the open
 * edges, amber running lights down the sides and across the end you drive onto (so the
 * ones that give stand out from the fixed planks), and two float drums underneath.
 */
export const pontoonGeometry = () =>
  memo('pontoon', () => {
    const mb = new MeshBuilder()
    const [W, L] = PONTOON.model
    const X = W / 2
    const Z = L / 2
    const T = PONTOON.thick
    const wood = c('#6b4a2e')
    const woodSide = c('#4c3320')
    mb.aabb([-X, -T, -Z], [X, 0, Z], { top: wood, side: woodSide, end: woodSide, bottom: DARK }, { top: P.PLANKS })
    for (const s of [-1, 1]) {
      mb.aabb([s > 0 ? X - 0.25 : -X, 0, -Z], [s > 0 ? X : -X + 0.25, 0.02, Z], HAZ, { top: P.HAZARD, side: P.HAZARD, end: P.HAZARD })
      mb.aabb([s > 0 ? X : -X - 0.03, -0.46, -Z + 0.4], [s > 0 ? X + 0.03 : -X, -0.26, Z - 0.4], AMBER, ALL(P.PULSE))
      cyl(mb, [s * 2.4, -T - 0.5, 0], 2, -Z + 0.45, Z - 0.45, 0.6, 0.6, 8, c('#1f3570'), { cap: 2, capColor: STEEL_DARK, alt: c('#284a8f'), phase: Math.PI / 8 })
    }
    // The approach end (+z faces back down the road).
    mb.aabb([-X + 0.6, -0.46, Z], [X - 0.6, -0.26, Z + 0.03], AMBER, ALL(P.PULSE))
    return mb.build()
  })

/** Pop-up post, 1.5 x 2.6 x 1.5 m nominal (scaled by the sim): striped, a red cap with a warning light. */
export const postGeometry = () =>
  memo('post', () => {
    const mb = new MeshBuilder()
    bevelBox(mb, [-0.75, -1.3, -0.75], [0.75, 1.12, 0.75], 0.12, HAZ, { side: P.HAZARD, bevel: P.HAZARD }, along([1, 1, 1], 2), ['top'])
    bevelBox(mb, [-0.75, 1.12, -0.75], [0.75, 1.3, 0.75], 0.08, { top: RED, side: RED, end: RED, bottom: DARK })
    cyl(mb, [0, 1.3, 0], 1, 0, 0.12, 0.24, 0.18, 6, AMBER, { cap: 1, pattern: P.PULSE, capPattern: P.PULSE })
    return unitScale(mb, 1.5, 2.6, 1.5).build()
  })

/**
 * Piston ram, 5 x 1.8 x 2.6 m nominal (scaled by the sim to its reach): a striped ram
 * body between two rubber punch heads with red warning strips. Symmetric, because the
 * same model punches from either side of the road.
 */
export const pistonGeometry = () =>
  memo('piston', () => {
    const mb = new MeshBuilder()
    const X = 2.5
    const Y = 0.9
    const Z = 1.3
    const head = 0.34
    bevelBox(mb, [-X + head, -Y + 0.07, -Z + 0.07], [X - head, Y - 0.07, Z - 0.07], 0.14, { top: HAZ, side: HAZ, end: HAZ, bottom: DARK }, { top: P.HAZARD, end: P.HAZARD, bevel: P.HAZARD }, along([1, 1, 1], 1.7))
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? X - head : -X
      bevelBox(mb, [x0, -Y, -Z], [x0 + head, Y, Z], 0.12, RUBBER)
      const xm = s * (X - head / 2)
      mb.aabb([xm - 0.07, -0.14, -Z - 0.03], [xm + 0.07, 0.14, Z + 0.03], LIGHT_RED, ALL(P.GLOW))
    }
    return unitScale(mb, 2 * X, 2 * Y, 2 * Z).build()
  })

/**
 * Moving deck (lifts, drawbridge leaves, the turntable), 12 x 1 x 14 m nominal (scaled
 * by the sim): steel deck plates inside a hazard border, striped lip, dark skirt with
 * amber running lights. All patterns follow the deck (none from world position), so
 * nothing swims as it moves.
 */
export const liftGeometry = () =>
  memo('lift', () => {
    const mb = new MeshBuilder()
    const X = 6
    const Y = 0.5
    const Z = 7
    const rim = 0.55
    const lip = 0.34
    const up = [0, 1, 0]
    const stripes = along([1, 1, 1], 1.5)
    const deck = c('#a2afbb')
    const rect = (x0, z0, x1, z1) => [[x0, Y, z0], [x1, Y, z0], [x1, Y, z1], [x0, Y, z1]]
    // Top: plates in the middle, the border round them (all one plane, no overlaps).
    poly(mb, rect(-X + rim, -Z + rim, X - rim, Z - rim), up, deck, P.PLANKS, along([0, 0, 1], 0.55))
    for (const s of [-1, 1]) {
      poly(mb, rect(-X, s > 0 ? Z - rim : -Z, X, s > 0 ? Z : -Z + rim), up, HAZ, P.HAZARD, stripes)
      poly(mb, rect(s > 0 ? X - rim : -X, -Z + rim, s > 0 ? X : -X + rim, Z - rim), up, HAZ, P.HAZARD, stripes)
    }
    // Sides: striped lip over a dark skirt.
    const side = (a, b, out) => {
      poly(mb, [[a[0], Y - lip, a[1]], [b[0], Y - lip, b[1]], [b[0], Y, b[1]], [a[0], Y, a[1]]], out, HAZ, P.HAZARD, stripes)
      poly(mb, [[a[0], -Y, a[1]], [b[0], -Y, b[1]], [b[0], Y - lip, b[1]], [a[0], Y - lip, a[1]]], out, STEEL_DARK)
    }
    side([X, -Z], [X, Z], [1, 0, 0])
    side([-X, -Z], [-X, Z], [-1, 0, 0])
    side([-X, Z], [X, Z], [0, 0, 1])
    side([-X, -Z], [X, -Z], [0, 0, -1])
    poly(mb, [[-X, -Y, -Z], [X, -Y, -Z], [X, -Y, Z], [-X, -Y, Z]], [0, -1, 0], DARK)
    // Running lights along the skirt.
    const ly = [-0.16, -0.04]
    mb.aabb([X - 0.02, ly[0], -Z + 1], [X + 0.025, ly[1], Z - 1], AMBER, ALL(P.GLOW))
    mb.aabb([-X - 0.025, ly[0], -Z + 1], [-X + 0.02, ly[1], Z - 1], AMBER, ALL(P.GLOW))
    mb.aabb([-X + 1, ly[0], Z - 0.02], [X - 1, ly[1], Z + 0.025], AMBER, ALL(P.GLOW))
    mb.aabb([-X + 1, ly[0], -Z - 0.025], [X - 1, ly[1], -Z + 0.02], AMBER, ALL(P.GLOW))
    return unitScale(mb, 2 * X, 2 * Y, 2 * Z).build()
  })

/**
 * Harbour wind fan facing +Z (across the road), on legs: a steel frame round a round
 * shroud, a guard of rings and spokes on the blowing side, the motor pod behind, a
 * warning beacon on top.
 */
export const fanHousingGeometry = () =>
  memo('fanHousing', () => {
    const mb = new MeshBuilder()
    const r = 2.6
    const t = 0.4
    const d = 0.75
    const O = [0, 0, 0]
    // Square frame.
    bevelBox(mb, [-r, r - t, -d], [r, r, d], 0, { top: HAZ, side: STEEL, end: STEEL, bottom: STEEL }, { top: P.HAZARD }, along([1, 0, 1], 1.6))
    mb.aabb([-r, -r, -d], [r, -r + t, d], STEEL)
    for (const s of [-1, 1]) mb.aabb([s > 0 ? r - t : -r, -r + t, -d], [s > 0 ? r : -r + t, r - t, d], STEEL)
    // Round shroud: inner wall, front and back faces, and corner webs out to the frame.
    const n = 12
    const rIn = 2.0
    const rOut = r - t
    const ph = 0
    const shroud = c('#24485a')
    cyl(mb, O, 2, -d, d, rIn, rIn, n, shroud, { cap: 0, inward: true, phase: ph, alt: c('#1e3d4c') })
    for (const s of [-1, 1]) {
      annulus(mb, O, 2, s * d, rIn, rOut, n, s, STEEL, 0, ph)
      for (let q = 0; q < 4; q += 1) {
        const corner = [(q === 0 || q === 3 ? 1 : -1) * rOut, (q < 2 ? 1 : -1) * rOut, s * d]
        const pts = [corner]
        for (let i = 0; i <= 3; i += 1) pts.push(ringPt(O, 2, s * d, rOut, ((q * 3 + i) / n) * Math.PI * 2))
        poly(mb, pts, [0, 0, s], STEEL)
      }
    }
    // Guard on the blowing side: a ring and four spokes to a centre boss.
    const gz = d + 0.09
    annulus(mb, O, 2, gz, 1.22, 1.32, n, 1, DARK, 0, ph)
    for (let k = 0; k < 4; k += 1) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4
      beam(mb, [Math.cos(a) * 0.3, Math.sin(a) * 0.3, gz], [Math.cos(a) * rIn, Math.sin(a) * rIn, gz], 0.045, 0.045, [0, 0, 1], DARK)
    }
    cyl(mb, [0, 0, 0], 2, gz - 0.06, gz + 0.04, 0.3, 0.3, 8, DARK, { cap: 1, capColor: HAZ })
    // Motor pod behind, on a strut.
    cyl(mb, O, 2, -d, -d - 0.85, 0.62, 0.5, 8, GUNMETAL, { cap: 1, capColor: DARK, phase: Math.PI / 8 })
    beam(mb, [-rIn, 0, -d - 0.1], [rIn, 0, -d - 0.1], 0.1, 0.12, [0, 0, 1], DARK)
    // Legs with feet, and the beacon.
    for (const x of [-r + 0.4, r - 0.4]) {
      mb.aabb([x - 0.22, -r - 0.62, -0.28], [x + 0.22, -r, 0.28], STEEL)
      mb.aabb([x - 0.4, -r - 0.7, -0.5], [x + 0.4, -r - 0.62, 0.5], DARK)
    }
    cyl(mb, [0, r, 0], 1, 0, 0.3, 0.24, 0.18, 6, AMBER, { cap: 1, pattern: P.PULSE, capPattern: P.PULSE })
    return mb.build()
  })

/** Fan rotor: five pitched blades with red tips round a spinner, turning about Z. */
export const fanBladesGeometry = () =>
  memo('fanBlades', () => {
    const mb = new MeshBuilder()
    const pitch = 0.42
    const blade = (a, r0, r1, w0, w1, color) => {
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      // Blade frame: radial (ca, sa), across it pitched about the radial axis.
      const cp = Math.cos(pitch)
      const sp = Math.sin(pitch)
      const acr = [-sa * cp, ca * cp, sp]
      const nrm = [sa * sp, -ca * sp, cp]
      const P0 = (r, w, s, th) => [ca * r + acr[0] * w * s + nrm[0] * th, sa * r + acr[1] * w * s + nrm[1] * th, acr[2] * w * s + nrm[2] * th]
      const th = 0.035
      hexa(mb, [P0(r0, w0, -1, -th), P0(r0, w0, 1, -th), P0(r0, w0, 1, th), P0(r0, w0, -1, th), P0(r1, w1, -1, -th), P0(r1, w1, 1, -th), P0(r1, w1, 1, th), P0(r1, w1, -1, th)], color)
    }
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2
      blade(a, 0.32, 1.55, 0.16, 0.3, WHITE)
      blade(a, 1.55, 1.9, 0.3, 0.27, RED)
    }
    cyl(mb, [0, 0, 0], 2, -0.28, 0.06, 0.4, 0.4, 8, GUNMETAL, { cap: -1 })
    cyl(mb, [0, 0, 0], 2, 0.06, 0.5, 0.4, 0, 8, RED, { cap: 0, alt: WHITE })
    return mb.build()
  })

/**
 * Piston housing set into the side wall (2.2 x 2.2 x 3.4): a chamfered steel block,
 * striped frames round the ram port on both sides, red warning strips facing along the
 * road and an amber beacon. Origin at its centre.
 */
export const pistonBaseGeometry = () =>
  memo('pistonBase', () => {
    const mb = new MeshBuilder()
    bevelBox(mb, [-1.1, -1, -1.7], [1.1, 1.2, 1.7], 0.14, { top: HAZ, side: STEEL_DARK, end: STEEL_DARK, bottom: DARK, bevel: STEEL_DARK }, { top: P.HAZARD }, along([1, 0, 1], 1.6))
    const stripes = { side: P.HAZARD, top: P.HAZARD, end: P.HAZARD }
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? 1.08 : -1.16
      const x1 = x0 + 0.08
      bevelBox(mb, [x0, 0.86, -1.48], [x1, 1.02, 1.48], 0, HAZ, stripes, along([0, 1, 1], 2.4))
      for (const z of [-1, 1]) bevelBox(mb, [x0, -1, z > 0 ? 1.31 : -1.48], [x1, 0.86, z > 0 ? 1.48 : -1.31], 0, HAZ, stripes, along([0, 1, 1], 2.4))
      // Red warning strip on each road-facing face.
      mb.aabb([-0.8, 0.28, s > 0 ? 1.68 : -1.72], [0.8, 0.52, s > 0 ? 1.72 : -1.68], LIGHT_RED, ALL(P.PULSE))
    }
    mb.aabb([-0.24, 1.2, -0.24], [0.24, 1.3, 0.24], DARK)
    cyl(mb, [0, 1.3, 0], 1, 0, 0.3, 0.17, 0.12, 6, AMBER, { cap: 1, pattern: P.PULSE, capPattern: P.PULSE })
    return mb.build()
  })

/**
 * Cargo-door gantry for a 16 m road (scaled in x for others): chamfered hazard posts on
 * foot plates, a steel lintel with a striped soffit, a braced crown beam with an orange
 * name board, amber beacons over the outer posts. Origin at the road surface centre;
 * matches obstacleSim's doorFrameBoxes.
 */
export const gantryGeometry = () =>
  memo('gantry', () => {
    const mb = new MeshBuilder()
    const W = 16
    const post = 0.8
    const opening = (W - 4 * post) / 3
    const H = 4.6
    const xs = [-W / 2 + post / 2, -opening / 2 - post / 2, opening / 2 + post / 2, W / 2 - post / 2]
    for (const px of xs) {
      bevelBox(mb, [px - post / 2, 0.12, -0.45], [px + post / 2, H, 0.45], 0.1, { top: DARK, side: HAZ, end: HAZ, bottom: DARK }, { side: P.HAZARD, bevel: P.HAZARD }, along([1, 1, 1], 1.6), ['top', 'bottom'])
      mb.aabb([px - 0.52, 0, -0.58], [px + 0.52, 0.12, 0.58], GUNMETAL)
    }
    // Lintel: striped soffit band, steel above.
    bevelBox(mb, [-W / 2, H, -0.6], [W / 2, H + 0.32, 0.6], 0.08, { top: STEEL, side: HAZ, end: HAZ, bottom: DARK }, { side: P.HAZARD, end: P.HAZARD, bevel: P.HAZARD }, along([1, 1, 0], 1.6), ['top'])
    bevelBox(mb, [-W / 2, H + 0.32, -0.6], [W / 2, H + 1.2, 0.6], 0.12, { top: HAZ, side: STEEL, end: STEEL, bottom: STEEL, bevel: STEEL }, { top: P.HAZARD }, along([1, 0, 1], 1.6), ['bottom'])
    // Crown beam on struts, braced.
    const steelDark = STEEL_DARK
    mb.aabb([-W / 2 + 0.6, H + 2.3, -0.3], [W / 2 - 0.6, H + 2.8, 0.3], steelDark)
    const struts = [-W / 2 + 1.2, -opening / 2 - post / 2, opening / 2 + post / 2, W / 2 - 1.2]
    for (const x of struts) mb.aabb([x - 0.18, H + 1.2, -0.18], [x + 0.18, H + 2.3, 0.18], steelDark)
    // Braces in the outer bays, mirrored.
    beam(mb, [struts[0] + 0.18, H + 1.25, 0], [struts[1] - 0.18, H + 2.3, 0], 0.08, 0.1, [0, 0, 1], steelDark)
    beam(mb, [struts[3] - 0.18, H + 1.25, 0], [struts[2] + 0.18, H + 2.3, 0], 0.08, 0.1, [0, 0, 1], steelDark)
    // Name board with a dark frame, and beacons on the outer posts.
    mb.aabb([-2.35, H + 2.75, -0.2], [2.35, H + 3.75, 0.2], DARK)
    mb.aabb([-2.2, H + 2.85, -0.26], [2.2, H + 3.65, 0.26], { top: ORANGE, side: ORANGE, end: c('#e85f0a'), bottom: ORANGE })
    for (const x of [xs[0], xs[3]]) cyl(mb, [x, H + 1.2, 0], 1, 0, 0.34, 0.2, 0.15, 6, AMBER, { cap: 1, pattern: P.PULSE, capPattern: P.PULSE })
    return mb.build()
  })

/**
 * Roller shutter, 4.27 x 4.6 m nominal (the sim scales x and y, y shrinking as it rolls
 * up), origin at its TOP edge. Corrugated slats on the approach face, a row of vision
 * panes, a chamfered hazard bottom rail.
 */
export const shutterGeometry = () =>
  memo('shutter', () => {
    const mb = new MeshBuilder()
    const X = 2.135
    const Hh = 4.6
    const Z = 0.12
    const slat = c('#a9bccb')
    const slatB = c('#8299ab')
    // Back face and ends, flat; the front corrugated (ridges at the front plane).
    poly(mb, [[-X, -Hh, -Z], [X, -Hh, -Z], [X, 0, -Z], [-X, 0, -Z]], [0, 0, -1], slatB)
    for (const s of [-1, 1]) poly(mb, [[s * X, -Hh + 0.24, -Z], [s * X, 0, -Z], [s * X, 0, Z], [s * X, -Hh + 0.24, Z]], [s, 0, 0], slatB)
    corrugate(mb, [-X, 0, Z - 0.05], [0, -Hh, 0], [2 * X, 0, 0], [0, 0, 1], 0.05, 15, slat, slatB)
    // Vision panes.
    for (const x of [-1.4, -0.47, 0.47, 1.4]) mb.aabb([x - 0.32, -2.05, Z - 0.02], [x + 0.32, -1.8, Z + 0.015], c('#2b4a66'))
    // Bottom rail.
    bevelBox(mb, [-X, -Hh, -0.16], [X, -Hh + 0.24, 0.16], 0.06, { top: HAZ, side: HAZ, end: HAZ, bottom: DARK }, { end: P.HAZARD, bevel: P.HAZARD, side: P.HAZARD }, along([1, 1, 0], 2.2))
    return unitScale(mb, 2 * X, Hh, 1).build()
  })

/** Door lamp: a dark housing with a wide glowing lens (instance-tinted amber / green / red) and a visor. */
export const lampGeometry = () =>
  memo('lamp', () => {
    const mb = new MeshBuilder()
    bevelBox(mb, [-0.6, -0.3, -0.14], [0.6, 0.3, 0.06], 0.07, c('#3a3f47'))
    bevelBox(mb, [-0.48, -0.19, 0.04], [0.48, 0.19, 0.1], 0.05, WHITE, ALL(P.GLOW), null, ['bottom'])
    mb.aabb([-0.66, 0.3, -0.18], [0.66, 0.37, 0.2], DARK)
    return mb.build()
  })

/**
 * Forklift facing +X (its travel direction), origin on the ground at its centre: a
 * chamfered body and striped counterweight, hex wheels with pale rims, the overhead
 * guard, mast, forks and a crate, headlights and a roof beacon.
 */
export const forkliftGeometry = () =>
  memo('forklift', () => {
    const mb = new MeshBuilder()
    const body = c('#ffb020')
    // Chassis and counterweight.
    bevelBox(mb, [-1.3, 0.32, -0.78], [0.74, 1.12, 0.78], 0.11, { top: body, side: body, end: body, bottom: DARK }, {}, null, ['bottom'])
    bevelBox(mb, [-1.6, 0.3, -0.8], [-1.18, 1.42, 0.8], 0.15, { top: DARK, side: DARK, end: DARK, bottom: DARK }, {}, null, ['bottom'])
    bevelBox(mb, [-1.62, 0.55, -0.6], [-1.58, 0.8, 0.6], 0, HAZ, ALL(P.HAZARD), along([0, 1, 1], 4))
    // Wheels: hex prisms along z, pale rim caps outboard.
    for (const [x, r] of [[-1.0, 0.3], [0.42, 0.36]]) {
      for (const s of [-1, 1]) cyl(mb, [x, r, 0], 2, s * 0.66, s * 0.88, r, r, 6, c('#1b1d22'), { cap: 1, capColor: c('#c9ced4'), phase: Math.PI / 6 })
    }
    // Seat, cowl and the overhead guard.
    mb.aabb([-0.95, 1.12, -0.36], [-0.45, 1.55, 0.36], c('#24282e'))
    mb.aabb([0.2, 1.12, -0.6], [0.6, 1.45, 0.6], body)
    for (const z of [-0.68, 0.68]) {
      mb.aabb([-1.16, 1.12, z - 0.05], [-1.06, 2.3, z + 0.05], DARK)
      beam(mb, [0.62, 1.12, z], [0.42, 2.3, z], 0.05, 0.05, [0, 0, 1], DARK)
    }
    mb.aabb([-1.2, 2.3, -0.76], [0.5, 2.4, 0.76], { top: DARK, side: body, end: body, bottom: DARK })
    cyl(mb, [-0.5, 2.4, 0], 1, 0, 0.2, 0.12, 0.09, 6, AMBER, { cap: 1, pattern: P.PULSE, capPattern: P.PULSE })
    // Headlights.
    for (const z of [-0.6, 0.6]) mb.aabb([0.74, 0.86, z - 0.11], [0.79, 1.02, z + 0.11], c('#fff6d8'), ALL(P.GLOW))
    // Mast, carriage, forks and a crate on them.
    for (const z of [-0.5, 0.5]) mb.aabb([0.79, 0.2, z - 0.07], [0.92, 2.55, z + 0.07], GUNMETAL)
    mb.aabb([0.79, 2.4, -0.57], [0.92, 2.52, 0.57], GUNMETAL)
    mb.aabb([0.92, 0.25, -0.58], [0.98, 0.95, 0.58], DARK)
    for (const z of [-0.36, 0.36]) mb.aabb([0.98, 0.24, z - 0.08], [1.75, 0.32, z + 0.08], DARK)
    mb.aabb([1.02, 0.32, -0.6], [1.74, 1.0, 0.6], c('#b07a43'), { top: P.PLANKS, side: P.PLANKS, end: P.PLANKS })
    return mb.build()
  })

/**
 * Cargo truck facing +X (its travel direction), origin on the ground at its centre,
 * inside its 6.4 x 3.2 x 2.5 m collider: a cab-over cab with a dark windscreen, grille
 * and headlights, a beacon bar, a flatbed with a teal corrugated container, three axles
 * of hex wheels and a striped rear bumper.
 */
export const truckGeometry = () =>
  memo('truck', () => {
    const mb = new MeshBuilder()
    const cab = c('#f4f7fb')
    const box = c('#1f9e9a')
    const boxB = c('#1a8885')
    // Chassis and flatbed.
    mb.aabb([-3.15, 0.55, -1.0], [2.0, 0.85, 1.0], DARK)
    mb.aabb([-3.2, 0.85, -1.22], [1.55, 1.0, 1.22], GUNMETAL)
    // Container on the bed: corrugated sides, plain ends with door bars at the back.
    mb.aabb([-3.1, 1.0, -1.15], [1.45, 3.15, 1.15], { top: c('#e9edf2'), side: box, end: boxB, bottom: DARK })
    for (const s of [-1, 1]) corrugate(mb, [-3.0, 1.06, s * 1.15], [4.35, 0, 0], [0, 2.02, 0], [0, 0, s], 0.05, 14, box, boxB)
    for (const z of [-0.5, 0.5]) mb.aabb([-3.16, 1.1, z - 0.05], [-3.1, 3.05, z + 0.05], STEEL_LIGHT)
    // Cab: white, chamfered, windscreen and side windows, grille, headlights.
    bevelBox(mb, [1.62, 0.7, -1.2], [3.18, 3.0, 1.2], 0.18, { top: cab, side: cab, end: cab, bottom: DARK }, {}, null, ['bottom'])
    mb.aabb([3.18, 1.95, -1.0], [3.21, 2.75, 1.0], c('#2b4a66'))
    for (const s of [-1, 1]) mb.aabb([2.2, 1.95, s * 1.2 - 0.02], [3.0, 2.7, s * 1.2 + 0.02], c('#2b4a66'))
    mb.aabb([3.18, 0.85, -0.7], [3.22, 1.55, 0.7], DARK)
    for (const z of [-0.95, 0.95]) mb.aabb([3.18, 0.95, z - 0.17], [3.23, 1.2, z + 0.17], c('#fff6d8'), ALL(P.GLOW))
    // Orange stripe down the cab sides and a beacon bar on the roof.
    for (const s of [-1, 1]) mb.aabb([1.66, 1.5, s * 1.2 - 0.025], [3.14, 1.72, s * 1.2 + 0.025], ORANGE)
    mb.aabb([2.0, 3.0, -0.7], [2.6, 3.18, 0.7], AMBER, ALL(P.PULSE))
    // Bumpers: dark at the front, hazard-striped at the back.
    mb.aabb([3.1, 0.45, -1.15], [3.2, 0.8, 1.15], DARK)
    mb.aabb([-3.2, 0.42, -1.1], [-3.12, 0.72, 1.1], HAZ, ALL(P.HAZARD))
    // Wheels: hex prisms along z.
    for (const x of [-2.3, -1.2, 2.3]) {
      for (const s of [-1, 1]) cyl(mb, [x, 0.5, 0], 2, s * 0.78, s * 1.18, 0.5, 0.5, 6, c('#1b1d22'), { cap: 1, capColor: c('#c9ced4'), phase: Math.PI / 6 })
    }
    return mb.build()
  })

/**
 * Forklift shed beside the road, its open doorway facing +X: corrugated walls, a dark
 * interior with a strip light, a steel frame with hazard posts, the rolled-up door
 * drum and an amber beacon. Origin at the floor's centre (5 x 4.5 m).
 */
export const shedGeometry = () =>
  memo('shed', () => {
    const mb = new MeshBuilder()
    const wall = c('#2f6fe0')
    const wallB = c('#2861c8')
    const inside = c('#151a22')
    // Floor slab with a hazard edge, and the deck under it.
    mb.aabb([-2.5, -1.2, -2.25], [2.5, 0.05, 2.25], { top: c(PALETTE.plaza), side: HAZ, end: HAZ, bottom: DARK }, { top: P.TILES, side: P.HAZARD, end: P.HAZARD })
    // Back wall (dark inside, so the forklifts appear out of the gloom).
    mb.aabb([-2.5, 0.05, -2.26], [-2.2, 4, 2.26], { top: wall, side: inside, end: wall, bottom: wall })
    // Side walls: dark inner faces, corrugated outside.
    for (const s of [-1, 1]) {
      const zi = s * 2.1
      const zo = s * 2.34
      mb.aabb([-2.2, 0.05, Math.min(zi, zo - s * 0.08)], [2.5, 4, Math.max(zi, zo - s * 0.08)], { top: wall, side: wall, end: inside, bottom: wall })
      corrugate(mb, [-2.5, 0.05, zo - s * 0.08], [5, 0, 0], [0, 3.95, 0], [0, 0, s], 0.08, 12, wall, wallB)
    }
    mb.aabb([-2.62, 4, -2.45], [2.62, 4.35, 2.45], { top: c('#e9edf2'), side: wall, end: wall, bottom: inside })
    mb.aabb([-2.0, 3.9, -0.12], [1.8, 3.98, 0.12], c('#f4fbff'), ALL(P.GLOW))
    // Doorway frame: hazard posts, header, the rolled-up door drum, a beacon.
    for (const s of [-1, 1]) mb.box([2.45, 2, s * 2.0], [0.12, 1.95, 0.2], [1, 0, 0], [0, 1, 0], [0, 0, 1], { top: HAZ, side: HAZ, end: HAZ, bottom: DARK }, { side: P.HAZARD, end: P.HAZARD }, { along: [0, 1, 0], skip: ['bottom'] })
    mb.aabb([2.3, 3.5, -2.36], [2.62, 3.97, 2.36], { top: HAZ, side: HAZ, end: HAZ, bottom: DARK }, { side: P.HAZARD, end: P.HAZARD })
    cyl(mb, [2.05, 3.22, 0], 2, -1.8, 1.8, 0.26, 0.26, 6, c('#8fa3b3'), { cap: 0, alt: c('#6f8496') })
    cyl(mb, [2.5, 4.35, 0], 1, 0, 0.24, 0.17, 0.12, 6, AMBER, { cap: 1, pattern: P.PULSE, capPattern: P.PULSE })
    return mb.build()
  })

/**
 * Rolling steel pipe along X, unit length and unit radius (scaled by the sim): flanged
 * ends, hazard bands that spin as it rolls, alternating facets, and a dark bore.
 */
export const pipeGeometry = () =>
  memo('pipe', () => {
    const mb = new MeshBuilder()
    const n = 10
    const steelA = c('#7d8f9e')
    const steelB = c('#64788a')
    const flange = c('#56687a')
    const rB = 0.9
    // Hazard bands: stripes slanting round the pipe (coordinates unwrapped per facet,
    // three whole periods round, so there is no seam).
    const bands = [[-0.42, -0.3, true], [-0.3, 0.3, false], [0.3, 0.42, true]]
    for (const [x0, x1, haz] of bands) {
      for (let i = 0; i < n; i += 1) {
        const a0 = (i / n) * Math.PI * 2
        const a1 = ((i + 1) / n) * Math.PI * 2
        const pts = [ringPt([0, 0, 0], 0, x0, rB, a0), ringPt([0, 0, 0], 0, x0, rB, a1), ringPt([0, 0, 0], 0, x1, rB, a1), ringPt([0, 0, 0], 0, x1, rB, a0)]
        const out = ringPt([0, 0, 0], 0, 0, 1, (a0 + a1) / 2)
        if (haz) poly(mb, pts, out, HAZ, P.HAZARD, [i * 0.72 + x0 * 3, (i + 1) * 0.72 + x0 * 3, (i + 1) * 0.72 + x1 * 3, i * 0.72 + x1 * 3])
        else poly(mb, pts, out, i % 2 ? steelA : steelB)
      }
    }
    // Flanges: a raised collar at each end, its face, the bore.
    for (const s of [-1, 1]) {
      cyl(mb, [0, 0, 0], 0, s * 0.42, s * 0.5, 1, 1, n, flange, { cap: 0, alt: steelB })
      annulus(mb, [0, 0, 0], 0, s * 0.42, rB, 1, n, -s, flange)
      annulus(mb, [0, 0, 0], 0, s * 0.5, 0.72, 1, n, s, steelA)
      cyl(mb, [0, 0, 0], 0, s * 0.5, s * 0.36, 0.72, 0.72, n, DARK, { cap: 1, capColor: c('#14171c'), inward: true })
    }
    return mb.build()
  })

/**
 * Pipe chute guard wall, 0.7 x 1.3 x 96 m nominal (scaled by the sim to the chute's
 * length): steel grating panels between dark posts, a striped cap rail.
 */
export const chuteGeometry = () =>
  memo('chute', () => {
    const mb = new MeshBuilder()
    const X = 0.35
    const Y = 0.65
    const L = 48
    bevelBox(mb, [-X + 0.05, -Y, -L], [X - 0.05, Y - 0.16, L], 0, { top: STEEL, side: STEEL, end: STEEL_DARK, bottom: DARK }, { side: P.GRATE }, null, ['top', 'bottom'])
    // Cap rail, its stripes slanting along the wall.
    bevelBox(mb, [-X, Y - 0.16, -L], [X, Y, L], 0, { top: HAZ, side: HAZ, end: HAZ, bottom: DARK }, { top: P.HAZARD, side: P.HAZARD }, along([1, 1, 1], 1.4))
    for (let k = 0; k < 16; k += 1) {
      const z = -L + ((k + 0.5) / 16) * 2 * L
      bevelBox(mb, [-X, -Y, z - 0.2], [X, Y - 0.16, z + 0.2], 0, STEEL_DARK, {}, null, ['top', 'bottom'])
    }
    return unitScale(mb, 2 * X, 2 * Y, 2 * L).build()
  })

/**
 * Cargo drone, centred on its collision sphere: an orange pod with a dark canopy and a
 * red camera eye facing the driver, four arms to motor pods and rotor guards with
 * blurred discs, nav lights and a strobe, a striped parcel slung underneath.
 */
export const droneGeometry = () =>
  memo('drone', () => {
    const mb = new MeshBuilder()
    const pod = c('#ff7a1a')
    bevelBox(mb, [-0.42, -0.1, -0.5], [0.42, 0.26, 0.5], 0.1, { top: pod, side: pod, end: pod, bottom: DARK }, {})
    mb.aabb([-0.24, 0.26, -0.32], [0.24, 0.33, 0.22], c('#2b4a66'))
    mb.aabb([-0.12, -0.24, 0.3], [0.12, -0.08, 0.52], DARK)
    mb.aabb([-0.06, -0.2, 0.52], [0.06, -0.12, 0.55], LIGHT_RED, ALL(P.GLOW))
    cyl(mb, [0, 0.33, -0.05], 1, 0, 0.06, 0.06, 0.06, 6, WHITE, { cap: 1, pattern: P.PULSE, capPattern: P.PULSE })
    const R = 0.36
    const o = 0.64
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const ax = x * o
      const az = z * o
      beam(mb, [x * 0.3, 0.1, z * 0.36], [ax, 0.12, az], 0.05, 0.045, [0, 1, 0], DARK)
      mb.aabb([ax - 0.08, 0.06, az - 0.08], [ax + 0.08, 0.24, az + 0.08], GUNMETAL)
      // Guard ring (outside and top faces) and a blurred rotor disc.
      cyl(mb, [ax, 0, az], 1, 0.16, 0.3, R, R, 8, DARK, { cap: 0, phase: Math.PI / 8 })
      // Rim: nav lights on the two guards facing the driver (red left, green right).
      const rimColor = z < 0 ? STEEL_LIGHT : x < 0 ? LIGHT_RED : c('#3fff6a')
      annulus(mb, [ax, 0, az], 1, 0.3, R - 0.05, R, 8, 1, rimColor, z > 0 ? P.GLOW : 0, Math.PI / 8)
      for (let i = 0; i < 8; i += 1) {
        const a0 = (i / 8) * Math.PI * 2
        const a1 = ((i + 1) / 8) * Math.PI * 2
        const r = R - 0.06
        poly(mb, [[ax, 0.27, az], [ax + Math.cos(a0) * r, 0.27, az + Math.sin(a0) * r], [ax + Math.cos(a1) * r, 0.27, az + Math.sin(a1) * r]], [0, 1, 0], i % 2 ? c('#dde7ee') : c('#a9b8c6'))
      }
    }
    // The parcel on its sling.
    mb.aabb([-0.03, -0.38, -0.03], [0.03, -0.1, 0.03], DARK)
    mb.box([0, -0.62, 0], [0.36, 0.24, 0.36], [1, 0, 0], [0, 1, 0], [0, 0, 1], { top: HAZ, side: HAZ, end: HAZ, bottom: DARK }, { side: P.HAZARD, end: P.HAZARD }, { along: [1, 2, 1] })
    return mb.build()
  })

// ---- Pickups --------------------------------------------------------------------

/** Coin: a thick gold disc standing up (faces +-Z): a glowing face inside a deeper-gold bevelled rim. */
export const coinGeometry = () =>
  memo('coin', () => {
    const mb = new MeshBuilder()
    const n = 10
    const r = 0.85
    const ri = 0.66
    const t = 0.1
    const ti = 0.17
    const gold = c(PALETTE.coin)
    const bevel = c('#f2b01c')
    const rim = c(PALETTE.coinEdge)
    cyl(mb, [0, 0, 0], 2, -t, t, r, r, n, rim, { cap: 0, phase: Math.PI / 2 })
    for (const s of [-1, 1]) {
      cyl(mb, [0, 0, 0], 2, s * t, s * ti, r, ri, n, bevel, { cap: 1, capColor: gold, pattern: P.GLOW, capPattern: P.GLOW, phase: Math.PI / 2 })
    }
    return mb.build()
  })

/**
 * Mystery cube (the item pickup): a step-cut gem standing on one corner, so it spins
 * like a jewel. Each face is a raised table (dark, with a glowing "?") ringed by four
 * crown facets alternating self-lit and lit - as it turns, the lit facets flash with the
 * sun while the others glow steadily. A tilted halo ring orbits its waist. Painted in
 * near-white so each cube's instance colour (the item it holds, Stage.jsx) tints the lot.
 * ~200 triangles; still one instanced draw for every cube on the stage.
 */
export const crateGeometry = () =>
  memo('crate', () => {
    const mb = new MeshBuilder()
    const H = 0.56
    const T = 0.32
    const D = 0.12
    const cyan = c('#ffffff')
    const violet = c('#bcc0d4')
    const table = c('#2a2f4a')
    const gold = c('#fff0b8')
    // Corner-up pose: turn the (1, 1, 1) diagonal onto +y (Rodrigues), lifted a little so
    // the low corner clears the road as it bobs.
    const k = norm3([-1, 0, 1])
    const ang = Math.acos(1 / Math.sqrt(3))
    const ca = Math.cos(ang)
    const sa = Math.sin(ang)
    const rot = (v) => {
      const kv = cross3(k, v)
      const kd = dot3(k, v) * (1 - ca)
      return [v[0] * ca + kv[0] * sa + k[0] * kd, v[1] * ca + kv[1] * sa + k[1] * kd, v[2] * ca + kv[2] * sa + k[2] * kd]
    }
    const lift = 0.15
    const W = (v) => {
      const r = rot(v)
      return [r[0], r[1] + lift, r[2]]
    }
    // One face built on +z, then turned onto each of the six.
    const turn = [(p) => p, ([x, y, z]) => [z, y, -x], ([x, y, z]) => [-x, y, -z], ([x, y, z]) => [-z, y, x], ([x, y, z]) => [x, z, -y], ([x, y, z]) => [x, -z, y]]
    for (const R of turn) {
      const out = rot(R([0, 0, 1]))
      const P2 = (x, y, z) => W(R([x, y, z]))
      const outer = [P2(-H, -H, H), P2(H, -H, H), P2(H, H, H), P2(-H, H, H)]
      const inner = [P2(-T, -T, H + D), P2(T, -T, H + D), P2(T, T, H + D), P2(-T, T, H + D)]
      for (let e = 0; e < 4; e += 1) {
        const n = (e + 1) % 4
        // Crown facet: from the cube's edge up to the table's edge.
        const fc = [0, 1, 2].map((i) => (outer[e][i] + outer[n][i] + inner[e][i] + inner[n][i]) / 4)
        const mid = [0, 1, 2].map((i) => (outer[0][i] + outer[2][i]) / 2)
        poly(mb, [outer[e], outer[n], inner[n], inner[e]], sub3(fc, mid).map((v, i) => v + out[i] * 0.3), e % 2 ? violet : cyan, e % 2 ? 0 : P.GLOW)
      }
      poly(mb, inner, out, table)
      // The "?" a couple of centimetres proud of the table.
      const z = H + D + 0.02
      const q = (x0, y0, x1, y1) => poly(mb, [P2(x0, y0, z), P2(x1, y0, z), P2(x1, y1, z), P2(x0, y1, z)], out, WHITE, P.GLOW)
      q(-0.13, 0.15, 0.13, 0.24)
      q(-0.13, 0.08, -0.05, 0.15)
      q(0.05, 0.05, 0.13, 0.15)
      q(-0.04, -0.02, 0.13, 0.05)
      q(-0.04, -0.1, 0.04, -0.02)
      q(-0.045, -0.24, 0.045, -0.16)
    }
    // The halo: a flat gold ring round the waist, tilted, both faces.
    const tilt = 0.32
    const ring = (a, r) => [Math.cos(a) * r, lift + Math.sin(a) * r * Math.sin(tilt), Math.sin(a) * r * Math.cos(tilt)]
    const ringUp = [0, Math.cos(tilt), -Math.sin(tilt)]
    const N = 16
    for (let i = 0; i < N; i += 1) {
      const a0 = (i / N) * Math.PI * 2
      const a1 = ((i + 1) / N) * Math.PI * 2
      const quad = [ring(a0, 1.18), ring(a1, 1.18), ring(a1, 1.34), ring(a0, 1.34)]
      poly(mb, quad, ringUp, gold, P.GLOW)
      poly(mb, quad, ringUp.map((v) => -v), gold, P.GLOW)
    }
    return mb.build()
  })

/**
 * Support tower: a steel lattice (four corner posts, X-bracing on every face, a hazard
 * cap) - unit footprint and unit height, origin at the base centre. Scaled per
 * instance, so the bracing stretches with the tower; twelve bays read as girder work
 * at any height.
 */
export const pillarGeometry = () =>
  memo('pillar', () => {
    const mb = new MeshBuilder()
    const steel = STEEL
    const post = 0.14
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      mb.aabb([x - post / 2, 0, z - post / 2], [x + post / 2, 1, z + post / 2], steel)
    }
    // Six bays of X-bracing, one diagonal per face per bay, alternating: ~110
    // triangles a tower, so ~200 towers stay around 20k triangles in one draw.
    const bays = 6
    for (let i = 0; i < bays; i += 1) {
      const y0 = i / bays
      const y1 = (i + 1) / bays
      const flip = i % 2 ? 1 : -1
      for (const [ax, az, nx, nz] of [[1, 0, 0, -0.5], [-1, 0, 0, 0.5], [0, -1, -0.5, 0], [0, 1, 0.5, 0]]) {
        const a = [nx - ax * 0.5 * flip, y0, nz - az * 0.5 * flip]
        const b = [nx + ax * 0.5 * flip, y1, nz + az * 0.5 * flip]
        const ox = az * 0.04
        const oz = ax * 0.04
        // Wound to face outwards.
        if (flip > 0) mb.quad([a[0] - ox, a[1], a[2] - oz], [a[0] + ox, a[1], a[2] + oz], [b[0] + ox, b[1], b[2] + oz], [b[0] - ox, b[1], b[2] - oz], steel)
        else mb.quad([a[0] + ox, a[1], a[2] + oz], [a[0] - ox, a[1], a[2] - oz], [b[0] - ox, b[1], b[2] - oz], [b[0] + ox, b[1], b[2] + oz], steel)
      }
    }
    // Hazard cap under the road.
    mb.aabb([-0.55, 0.985, -0.55], [0.55, 1, 0.55], { top: HAZ, side: HAZ, end: HAZ, bottom: DARK }, { side: P.HAZARD, end: P.HAZARD })
    return mb.build()
  })

/**
 * A laser gate's light curtain (obstacleSim `laser`), modelled 1 m wide (the sim scales x
 * to its span) and as tall as the gantry it hangs from, origin on the road under its middle:
 * a row of thin vertical laser lines rippling upwards (PULSE) between a glowing sill on the
 * road and a lintel under the gantry. Inside its collider (LASER: 0.5 m deep).
 */
export const laserCurtainGeometry = () =>
  memo('laserCurtain', () => {
    const mb = new MeshBuilder()
    const red = c('#ff2a6d')
    const hot = c('#ff8ab0')
    const H = LASER.frameHeight - 0.05
    const n = 9
    for (let k = 0; k < n; k += 1) {
      const x = -0.5 + (k + 0.5) / n
      mb.aabb([x - 0.012, 0.06, -0.03], [x + 0.012, H, 0.03], red, ALL(P.PULSE))
    }
    mb.aabb([-0.5, 0.02, -0.07], [0.5, 0.08, 0.07], hot, ALL(P.GLOW))
    mb.aabb([-0.5, H - 0.08, -0.06], [0.5, H, 0.06], hot, ALL(P.GLOW))
    return mb.build()
  })

/**
 * A laser gate's gantry, modelled for a 14 m road (the sim scales x to the real width),
 * origin at the road centre: legs just outside the road edges, a dark top beam at
 * LASER.frameHeight with a strip of glowing emitters along its underside, magenta edge
 * lights and beacons. No colliders: it stands clear of the road.
 */
export const laserFrameGeometry = () =>
  memo('laserFrame', () => {
    const mb = new MeshBuilder()
    const X = 7 + 0.45
    const top = LASER.frameHeight
    const neon = c('#ff3df0')
    const emit = c('#ff8ab0')
    for (const s of [-1, 1]) {
      const x = s * X
      bevelBox(mb, [x - 0.3, 0, -0.3], [x + 0.3, top + 0.7, 0.3], 0.06, { top: DARK, side: GUNMETAL, end: GUNMETAL, bottom: DARK }, {}, null, ['bottom'])
      // A glowing strip up the face of each leg the driver sees (both ways), proud of it.
      for (const z of [-1, 1]) mb.aabb([x - 0.08, 0.4, z * 0.3 - 0.03], [x + 0.08, top - 0.2, z * 0.3 + 0.03], neon, ALL(P.GLOW))
      cyl(mb, [x, top + 0.7, 0], 1, 0, 0.32, 0.2, 0.14, 6, neon, { cap: 1, pattern: P.PULSE, capPattern: P.PULSE })
    }
    bevelBox(mb, [-X - 0.4, top, -0.4], [X + 0.4, top + 0.7, 0.4], 0.08, { top: DARK, side: GUNMETAL, end: DARK, bottom: DARK, bevel: GUNMETAL })
    // Emitter strip under the beam, and neon edge lines along both faces.
    mb.aabb([-X + 0.3, top - 0.08, -0.16], [X - 0.3, top, 0.16], emit, ALL(P.GLOW))
    for (const z of [-1, 1]) mb.aabb([-X - 0.3, top + 0.28, z * 0.4 - 0.03], [X + 0.3, top + 0.42, z * 0.4 + 0.03], neon, ALL(P.GLOW))
    return mb.build()
  })

// ---- Snowy Mountain looks (the Grand Tour; obstacle spec `look`) ----------------------

const ICE_C = c('#cdeefc')
const ICE_DEEP = c('#8fd0f0')
const FROST = c('#f4fbff')
const SNOW_C = c('#f2f6fa')
const BARK = c('#5e4430')
const BARK_DARK = c('#47321f')
const TIMBER = c('#8a6440')
const ROPE = c('#3a3128')

/**
 * Giant snowball (`buoys` with `heavy` and `look: 'snowball'`; unit radius, scaled to
 * IRONBALL_R): packed snow in two soft whites so the roll reads, a band of ice-blue frost
 * round it like a tread (its poles on x, the axis it rolls about, as the iron ball's), a few
 * dark stones and twigs caught in it.
 */
export const snowballGeometry = () =>
  memo('snowball', () => {
    const mb = new MeshBuilder()
    const LON = 14
    const LAT = 8
    const shade = c('#e6edf3')
    const S = (t, a) => [Math.cos(t), Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a)]
    for (let j = 0; j < LAT; j += 1) {
      const t0 = (j / LAT) * Math.PI
      const t1 = ((j + 1) / LAT) * Math.PI
      const band = j === 3 || j === 4
      for (let i = 0; i < LON; i += 1) {
        const a0 = (i / LON) * Math.PI * 2
        const a1 = ((i + 1) / LON) * Math.PI * 2
        const out = S((t0 + t1) / 2, (a0 + a1) / 2)
        // A stone or a twig in a few cells; frost-blue cells in the band every other one.
        const stone = (i * 7 + j * 3) % 11 === 0 && !band
        const color = stone ? GUNMETAL : band ? (i % 2 ? ICE_C : FROST) : (i + j) % 2 ? SNOW_C : shade
        const pattern = stone ? 0 : P.SNOW
        if (j === 0) poly(mb, [S(0, 0), S(t1, a0), S(t1, a1)], out, color, pattern)
        else if (j === LAT - 1) poly(mb, [S(t0, a0), S(t0, a1), S(Math.PI, 0)], out, color, pattern)
        else poly(mb, [S(t0, a0), S(t0, a1), S(t1, a1), S(t1, a0)], out, color, pattern)
      }
    }
    return mb.build()
  })

/**
 * A swinging icicle (`hammer` with `look: 'icicle'`), origin at the pivot, hanging down -y
 * like the mallet (head centred 7.6 m down, inside HAMMER.head's 3.6 x 2.5 x 2.5 m box): a
 * long ice crystal lying across the road, pointed at both ends, frosted rings round it,
 * hung on two dark ropes from the axle.
 */
export const icicleGeometry = () =>
  memo('icicle', () => {
    const mb = new MeshBuilder()
    const arm = 7.6
    const head = [0, -arm, 0]
    const ph = Math.PI / 6
    cyl(mb, head, 0, -1.05, 1.05, 1.18, 1.18, 6, ICE_C, { cap: 0, alt: ICE_DEEP, phase: ph, pattern: P.ICE })
    for (const s of [-1, 1]) {
      cyl(mb, head, 0, s * 1.05, s * 1.78, 1.18, 0.05, 6, ICE_C, { cap: 0, alt: FROST, phase: ph, pattern: P.ICE })
      cyl(mb, head, 0, s * 0.62, s * 0.8, 1.24, 1.24, 6, FROST, { cap: 2, phase: ph, pattern: P.SNOW })
    }
    // Ropes from the axle to the crystal's shoulders.
    for (const s of [-1, 1]) beam(mb, [0, -0.3, 0], [s * 0.7, -arm + 1.05, 0], 0.07, 0.07, [0, 0, 1], ROPE)
    bevelBox(mb, [-0.36, -0.55, -0.32], [0.36, 0.3, 0.32], 0.08, { top: STEEL_DARK, side: STEEL_DARK, end: GUNMETAL, bottom: STEEL_DARK })
    return mb.build()
  })

/**
 * A swinging log (`hammer` with `look: 'log'`), origin at the pivot like the mallet (head
 * inside HAMMER.head's box): a bark-brown log across the road with pale cut ends and a
 * dusting of snow on top, hung on two chains from the axle.
 */
export const logGeometry = () =>
  memo('logHammer', () => {
    const mb = new MeshBuilder()
    const arm = 7.6
    const head = [0, -arm, 0]
    const ph = Math.PI / 8
    cyl(mb, head, 0, -1.72, 1.72, 1.16, 1.16, 8, BARK, { cap: 2, capColor: c('#d9b98a'), alt: BARK_DARK, phase: ph, capPattern: P.PLANKS })
    // Snow along its top.
    mb.box([0, -arm + 1.12, 0], [1.5, 0.1, 0.55], [1, 0, 0], [0, 1, 0], [0, 0, 1], { top: SNOW_C, side: SNOW_C, end: SNOW_C, bottom: SNOW_C }, { top: P.SNOW }, { skip: ['bottom'] })
    for (const s of [-1, 1]) beam(mb, [0, -0.3, 0], [s * 1.1, -arm + 1.1, 0], 0.08, 0.08, [0, 0, 1], GUNMETAL)
    bevelBox(mb, [-0.36, -0.55, -0.32], [0.36, 0.3, 0.32], 0.08, { top: STEEL_DARK, side: STEEL_DARK, end: GUNMETAL, bottom: STEEL_DARK })
    return mb.build()
  })

/**
 * The swinging icicles' and logs' gantry (instead of the steel one), modelled for a 14 m
 * road like hammerFrameGeometry (the sim scales x): two timber portal frames 7.2 m apart,
 * snow on the top beams, the axle, braces and a pair of lanterns. Clear of the road and
 * the swing (no colliders).
 */
export const timberFrameGeometry = () =>
  memo('timberFrame', () => {
    const mb = new MeshBuilder()
    const X = 7 - 0.3
    const Z = 3.6
    const pivot = 9.4
    const top = pivot + 0.32
    const wood = { top: TIMBER, side: TIMBER, end: BARK, bottom: BARK_DARK }
    for (const z of [-Z, Z]) {
      for (const s of [-1, 1]) {
        const x = s * X
        bevelBox(mb, [x - 0.3, 0.38, z - 0.3], [x + 0.3, top, z + 0.3], 0.08, wood, {}, null, ['bottom'])
        mb.aabb([x - 0.45, 0.38, z - 0.45], [x + 0.45, 0.62, z + 0.45], GUNMETAL)
        beam(mb, [x, top - 2.4, z], [x - s * 2.2, top, z], 0.12, 0.12, [0, 0, 1], BARK)
      }
      bevelBox(mb, [-X - 0.45, top, z - 0.34], [X + 0.45, top + 0.7, z + 0.34], 0.08, wood)
      // Snow lying on the beam.
      mb.box([0, top + 0.78, z], [X + 0.3, 0.08, 0.3], [1, 0, 0], [0, 1, 0], [0, 0, 1], { top: SNOW_C, side: SNOW_C, end: SNOW_C, bottom: SNOW_C }, { top: P.SNOW }, { skip: ['bottom'] })
      mb.aabb([-0.34, pivot - 0.45, z - 0.18], [0.34, top, z + 0.18], STEEL_DARK)
      // Lanterns on the outer ends.
      for (const s of [-1, 1]) cyl(mb, [s * X, top + 0.7, z], 1, 0, 0.36, 0.2, 0.16, 6, c('#ffcf7a'), { cap: 1, pattern: P.GLOW, capPattern: P.GLOW })
    }
    for (const s of [-1, 1]) mb.aabb([s * X - 0.2, top + 0.2, -Z + 0.34], [s * X + 0.2, top + 0.52, Z - 0.34], BARK)
    cyl(mb, [0, pivot, 0], 2, -Z + 0.18, Z - 0.18, 0.2, 0.2, 8, GUNMETAL, { cap: 0, alt: STEEL_DARK })
    return mb.build()
  })

/**
 * Snowplough (`sweeper` with `look: 'plough'`), 2.6 x 2.6 x 6 m nominal like the container
 * it stands in for (unit size, the sim scales it): a red tracked snow-groomer sliding across
 * the road, a yellow-striped blade on both sides (the ways it moves), the cab in the middle
 * with dark windows, an amber beacon on the roof. Inside the collider's box.
 */
export const ploughGeometry = () =>
  memo('plough', () => {
    const mb = new MeshBuilder()
    const red = c('#d8322b')
    const glass = c('#26323e')
    // Tracks and chassis.
    for (const z of [-1, 1]) bevelBox(mb, [-0.95, -1.3, z * 2.75 - 0.5], [0.95, -0.72, z * 2.75 + 0.5], 0.12, { top: GUNMETAL, side: RUBBER, end: RUBBER, bottom: RUBBER })
    bevelBox(mb, [-0.95, -1.15, -2.3], [0.95, -0.72, 2.3], 0.06, RUBBER)
    bevelBox(mb, [-1.0, -0.75, -2.9], [1.0, -0.2, 2.9], 0.1, { top: red, side: red, end: red, bottom: DARK })
    // Cab: windows all round, roof, beacon.
    bevelBox(mb, [-0.9, -0.2, -1.2], [0.9, 0.95, 1.2], 0.1, { top: red, side: glass, end: glass, bottom: DARK })
    bevelBox(mb, [-0.95, 0.95, -1.3], [0.95, 1.08, 1.3], 0.04, WHITE)
    cyl(mb, [0, 1.08, 0], 1, 0, 0.2, 0.16, 0.12, 6, AMBER, { cap: 1, pattern: P.PULSE, capPattern: P.PULSE })
    // Engine housing and rear tank either end of the cab.
    bevelBox(mb, [-0.85, -0.2, 1.3], [0.85, 0.45, 2.7], 0.12, { top: red, side: red, end: DARK, bottom: DARK })
    bevelBox(mb, [-0.8, -0.2, -2.7], [0.8, 0.3, -1.3], 0.12, { top: STEEL_LIGHT, side: STEEL, end: STEEL, bottom: DARK })
    // The blades: angled plates on both sides, hazard-striped, shod with steel.
    for (const s of [-1, 1]) {
      const x0 = s * 1.05
      const x1 = s * 1.3
      const pts = [
        [x0, -1.3, -3],
        [x1, -1.3, -3],
        [x1, 0.1, -3],
        [x0, 0.25, -3],
        [x0, -1.3, 3],
        [x1, -1.3, 3],
        [x1, 0.1, 3],
        [x0, 0.25, 3],
      ]
      hexa(mb, [pts[0], pts[1], pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]], HAZ, P.HAZARD, along([0, 1, 1], 1.2))
      mb.aabb([Math.min(x0, x1) - 0.02, -1.3, -3], [Math.max(x0, x1) + 0.02, -1.12, 3], STEEL_LIGHT)
      beam(mb, [s * 0.95, -0.5, -1.6], [x0, -0.6, -1.6], 0.09, 0.09, [0, 0, 1], GUNMETAL)
      beam(mb, [s * 0.95, -0.5, 1.6], [x0, -0.6, 1.6], 0.09, 0.09, [0, 0, 1], GUNMETAL)
    }
    return unitScale(mb, 2.6, 2.6, 6).build()
  })

// ---- Tropical Island looks (the Grand Tour; obstacle spec `look`) -----------------------

const HUSK = c('#6b4423')
const HUSK_DARK = c('#55361b')
const HUSK_FIBRE = c('#9a6a3a')
const BASALT = c('#3b3735')
const BASALT_DARK = c('#2b2827')
const MAGMA = c('#ff6a1a')
const PALM_BARK = c('#8a6a48')
const PALM_RING = c('#6c5035')
const BAMBOO_C = c('#c9a45a')
const BAMBOO_NODE = c('#8f7438')
const THATCH = c('#d8b86a')
const THATCH_DARK = c('#b09048')
const FLAME = c('#ffb03a')
const CRAB = c('#e8452e')
const CRAB_DARK = c('#b8301f')
const CRAB_BELLY = c('#ffb38a')

/** A unit sphere of LON x LAT cells, coloured per cell by `paint(i, j)` -> [color, pattern]; `bump(j, i)` scales a vertex's radius. */
function ballCells(mb, LON, LAT, paint, bump = () => 1) {
  const S = (j, i) => {
    const t = (j / LAT) * Math.PI
    const a = (i / LON) * Math.PI * 2
    const k = j <= 0 || j >= LAT ? 1 : bump(j, ((i % LON) + LON) % LON)
    return [Math.cos(t) * k, Math.sin(t) * Math.cos(a) * k, Math.sin(t) * Math.sin(a) * k]
  }
  for (let j = 0; j < LAT; j += 1) {
    for (let i = 0; i < LON; i += 1) {
      const t = ((j + 0.5) / LAT) * Math.PI
      const a = ((i + 0.5) / LON) * Math.PI * 2
      const mid = [Math.cos(t), Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a)]
      const [color, pattern] = paint(i, j)
      if (j === 0) poly(mb, [S(0, 0), S(1, i), S(1, i + 1)], mid, color, pattern)
      else if (j === LAT - 1) poly(mb, [S(j, i), S(j, i + 1), S(LAT, 0)], mid, color, pattern)
      else {
        // Two triangles (a bumped quad isn't planar).
        poly(mb, [S(j, i), S(j, i + 1), S(j + 1, i + 1)], mid, color, pattern)
        poly(mb, [S(j, i), S(j + 1, i + 1), S(j + 1, i)], mid, color, pattern)
      }
    }
  }
}

/**
 * Giant coconut (`buoys` with `look: 'coconut'`; unit radius, scaled to the buoy's): a brown
 * husk in two shades with pale fibre stripes round it like a tread (poles on x, the axis it
 * rolls about) and dark "eyes" round one pole.
 */
export const coconutGeometry = () =>
  memo('coconut', () => {
    const mb = new MeshBuilder()
    ballCells(mb, 12, 8, (i, j) => {
      if (j === 0) return [i % 4 === 0 ? RUBBER : HUSK_DARK, 0]
      if (j === 3 || j === 4) return [i % 2 ? HUSK_FIBRE : HUSK, 0]
      return [(i + j) % 2 ? HUSK : HUSK_DARK, 0]
    })
    return mb.build()
  })

/**
 * Lava boulder (`buoys` with `heavy` and `look: 'boulder'`; unit radius, scaled to
 * IRONBALL_R): a lumpy basalt rock (inside the unit sphere) with glowing magma cracks, most
 * of them in a band round it the way the iron ball's hazard band runs.
 */
export const boulderGeometry = () =>
  memo('boulder', () => {
    const mb = new MeshBuilder()
    const bump = (j, i) => 0.84 + 0.16 * (((i * 7 + j * 13) % 5) / 4)
    ballCells(
      mb,
      12,
      8,
      (i, j) => {
        if ((j === 3 || j === 4) && (i + 2 * j) % 4 === 0) return [MAGMA, P.GLOW]
        if ((i * 5 + j * 3) % 17 === 0) return [MAGMA, P.GLOW]
        return [(i + j) % 2 ? BASALT : BASALT_DARK, 0]
      },
      bump,
    )
    return mb.build()
  })

/**
 * A swinging palm log (`hammer` with `look: 'palmlog'`), origin at the pivot like the mallet
 * (head inside HAMMER.head's box): a ringed palm trunk across the road with pale cut ends,
 * hung on two ropes from the axle.
 */
export const palmLogGeometry = () =>
  memo('palmLog', () => {
    const mb = new MeshBuilder()
    const arm = 7.6
    const head = [0, -arm, 0]
    const ph = Math.PI / 8
    // Rings of bark: short frustums in two browns, each a little fatter at one end.
    const n = 7
    for (let k = 0; k < n; k += 1) {
      const s0 = -1.72 + (3.44 * k) / n
      const s1 = -1.72 + (3.44 * (k + 1)) / n
      const cap = k === 0 ? -1 : k === n - 1 ? 1 : 0
      cyl(mb, head, 0, s0, s1, 1.04, 1.14, 8, k % 2 ? PALM_RING : PALM_BARK, { cap, capColor: c('#e0c08e'), phase: ph, capPattern: P.PLANKS })
    }
    for (const s of [-1, 1]) beam(mb, [0, -0.3, 0], [s * 1.1, -arm + 1.05, 0], 0.08, 0.08, [0, 0, 1], ROPE)
    bevelBox(mb, [-0.36, -0.55, -0.32], [0.36, 0.3, 0.32], 0.08, { top: BAMBOO_NODE, side: BAMBOO_NODE, end: PALM_RING, bottom: BAMBOO_NODE })
    return mb.build()
  })

/**
 * The palm logs' gantry (instead of the steel one), modelled for a 14 m road like
 * hammerFrameGeometry (the sim scales x): two bamboo portal frames 7.2 m apart, palm thatch
 * along the top beams, the axle and a tiki torch on each post. Clear of the road and the
 * swing (no colliders).
 */
export const bambooFrameGeometry = () =>
  memo('bambooFrame', () => {
    const mb = new MeshBuilder()
    const X = 7 - 0.3
    const Z = 3.6
    const pivot = 9.4
    const top = pivot + 0.32
    for (const z of [-Z, Z]) {
      for (const s of [-1, 1]) {
        const x = s * X
        // A bamboo pole in sections (darker every other one), on a stone foot.
        for (let y = 0.38, k = 0; y < top - 0.01; y += 1.6, k += 1) cyl(mb, [x, 0, z], 1, y, Math.min(top, y + 1.6), 0.3, 0.3, 6, k % 2 ? BAMBOO_NODE : BAMBOO_C, { cap: 0 })
        mb.aabb([x - 0.45, 0.38, z - 0.45], [x + 0.45, 0.62, z + 0.45], GUNMETAL)
        beam(mb, [x, top - 2.4, z], [x - s * 2.2, top, z], 0.12, 0.12, [0, 0, 1], BAMBOO_NODE)
        // Tiki torch on the post's outer face.
        cyl(mb, [x + s * 0.55, 0, z], 1, top - 1.8, top - 0.9, 0.14, 0.22, 6, BAMBOO_NODE, { cap: 0 })
        cyl(mb, [x + s * 0.55, 0, z], 1, top - 0.9, top - 0.2, 0.2, 0.02, 6, FLAME, { cap: 0, pattern: P.GLOW })
      }
      bevelBox(mb, [-X - 0.45, top, z - 0.34], [X + 0.45, top + 0.6, z + 0.34], 0.08, { top: BAMBOO_C, side: BAMBOO_C, end: BAMBOO_NODE, bottom: BAMBOO_NODE })
      // Palm thatch along the beam: a straw ridge.
      const tz = 0.75
      poly(mb, [[-X - 0.6, top + 0.6, z - tz], [X + 0.6, top + 0.6, z - tz], [X + 0.6, top + 1.25, z], [-X - 0.6, top + 1.25, z]], [0, 0.6, -1], THATCH, P.PLANKS, along([1, 0, 0], 2))
      poly(mb, [[-X - 0.6, top + 0.6, z + tz], [X + 0.6, top + 0.6, z + tz], [X + 0.6, top + 1.25, z], [-X - 0.6, top + 1.25, z]], [0, 0.6, 1], THATCH_DARK, P.PLANKS, along([1, 0, 0], 2))
      mb.aabb([-0.34, pivot - 0.45, z - 0.18], [0.34, top, z + 0.18], BAMBOO_NODE)
    }
    for (const s of [-1, 1]) mb.aabb([s * X - 0.2, top + 0.2, -Z + 0.34], [s * X + 0.2, top + 0.52, Z - 0.34], BAMBOO_NODE)
    cyl(mb, [0, pivot, 0], 2, -Z + 0.18, Z - 0.18, 0.2, 0.2, 8, GUNMETAL, { cap: 0, alt: STEEL_DARK })
    return mb.build()
  })

/**
 * Giant crab (`sweeper` with `look: 'crab'`), 2.6 x 2.6 x 6 m nominal like the container it
 * stands in for (unit size, the sim scales it): a red carapace on four pairs of jointed
 * legs, big raised claws and eye stalks facing the oncoming cars (+z), a pale belly.
 * Inside the collider's box.
 */
export const crabGeometry = () =>
  memo('crab', () => {
    const mb = new MeshBuilder()
    const ph = Math.PI / 8
    // Carapace: two low octagonal domes in a row (an oval), the belly under the front one.
    cyl(mb, [0, -0.2, -0.1], 1, 0, 0.55, 1.15, 0.8, 8, CRAB, { cap: 1, alt: CRAB_DARK, phase: ph })
    cyl(mb, [0, -0.2, -0.1], 1, -0.45, 0, 0.9, 1.15, 8, CRAB_BELLY, { cap: -1, phase: ph })
    cyl(mb, [0, -0.2, -1.25], 1, -0.35, 0.45, 0.95, 0.65, 8, CRAB_DARK, { cap: 2, alt: CRAB, phase: ph })
    // Legs: four a side, each up to a knee then down to the ground (y -1.3).
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k += 1) {
        const z = -2.3 + k * 0.85
        const hip = [s * 0.85, -0.25, z * 0.7]
        const knee = [s * 1.2, 0.45, z]
        const foot = [s * 1.22, -1.3, z - 0.15]
        beam(mb, hip, knee, 0.11, 0.11, [0, 0, 1], CRAB_DARK)
        beam(mb, knee, foot, 0.09, 0.09, [0, 0, 1], CRAB)
      }
    }
    // Claws: an arm up and forward, a big pincer (two jaws) at the end; eye stalks.
    for (const s of [-1, 1]) {
      const x = s * 0.95
      beam(mb, [s * 0.7, -0.1, 0.8], [x, 0.5, 1.7], 0.16, 0.16, [0, 1, 0], CRAB)
      bevelBox(mb, [x - 0.3, 0.25, 1.7], [x + 0.3, 0.95, 2.4], 0.1, { top: CRAB, side: CRAB_DARK, end: CRAB, bottom: CRAB_BELLY })
      const jaw = (y0, y1, colorUp, colorDown) => {
        const pts = [
          [x - 0.24, y0, 2.4],
          [x + 0.24, y0, 2.4],
          [x, y1, 2.92],
        ]
        poly(mb, pts, [0, 1, 0.3], colorUp)
        poly(mb, pts, [0, -1, 0.3], colorDown)
      }
      jaw(0.95, 1.12, CRAB, CRAB_DARK)
      jaw(0.3, 0.52, CRAB, CRAB_BELLY)
      beam(mb, [s * 0.35, 0.3, 0.6], [s * 0.4, 0.92, 0.75], 0.06, 0.06, [0, 0, 1], CRAB_BELLY)
      bevelBox(mb, [s * 0.4 - 0.13, 0.92, 0.62], [s * 0.4 + 0.13, 1.18, 0.88], 0.04, { top: RUBBER, side: RUBBER, end: WHITE, bottom: RUBBER })
    }
    return unitScale(mb, 2.6, 2.6, 6).build()
  })

/**
 * The later zones' obstacle look kinds (obstacleSim SEPARATE_LOOKS): `{ kind: geometry
 * factory }`. Drawn by the zone's scenery from a draw-only copy of the obstacle sim (the
 * Tropical Island: world/scenery/grandTour/tropicZone.jsx), not by the stage's meshes.
 */
export const LOOK_KINDS = {
  coconut: coconutGeometry,
  boulder: boulderGeometry,
  palmLog: palmLogGeometry,
  bambooFrame: bambooFrameGeometry,
  crab: crabGeometry,
}

export const ORANGE_COLOR = ORANGE

export function disposePropGeometry() {
  for (const g of cache.values()) g.dispose()
  cache.clear()
}
