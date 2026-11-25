import { Color } from 'three'

import { MeshBuilder } from '../render/meshBuilder'
import { PATTERN } from '../render/worldMaterial'

/**
 * The harbour town around Pier Zero, as plain geometry (no React, no GPU): quays on
 * three sides of the pier with a waterfront of buildings, the Sky Docks Tower, the
 * ferry terminal and its ferry, the lighthouse, the Harbour Wheel's frame, trees,
 * lamps and boats - plus a distant skyline. The track leaves the pier to the north,
 * so the town keeps to the east, south and west.
 *
 * Everything is boxes and prisms on the shared world material (windows and glass are
 * shader patterns), merged into one mesh per layer. The billboards are returned as
 * placements for render/banners.js.
 *
 * Axes: +x east, +z south (the spawn faces -z, towards the Start gate).
 */

export const LAND_Y = 3
const SEA_FLOOR = -3

/** Footprints the harbour uses (scenery placement keeps out of them). [x0, z0, x1, z1] */
export const HARBOUR_ZONES = [
  [-240, 75, 240, 265], // south quay
  [85, -215, 265, 75], // east quay
  [-265, -95, -85, 75], // west quay
  [-90, -95, -60, -60], // lighthouse rock
  [50, -60, 80, 30], // the ferry
]

/** The Harbour Wheel: centre (axle) and radius; the wheel itself turns (Harbour.jsx). */
export const WHEEL = { x: -132, z: 8, y: LAND_Y + 36, r: 30, cabins: 16 }

const c = (hex) => new Color(hex)
const C = {
  paving: c('#e6dfd0'),
  seawall: c('#7d858f'),
  coping: c('#c9ced4'),
  asphalt: c('#4b5058'),
  line: c('#f2f4f7'),
  roof: c('#98a2ad'),
  roofDark: c('#6c7682'),
  trim: c('#f7f5ef'),
  shopGlass: c('#2f5d7a'),
  frame: c('#14234f'),
  rail: c('#2e7383'),
  post: c('#f4f7fb'),
  trunk: c('#7a5a3a'),
  leaf: c('#3fae5a'),
  leafLight: c('#6ccf63'),
  lampHead: c('#fff1a8'),
  white: c('#f4f7fb'),
  red: c('#e2453b'),
  navy: c('#1f3570'),
  tank: c('#b7c0c9'),
  glow: c('#9fe9ff'),
  rock: c('#6b7280'),
}
export const WALLS = ['#f2e6d0', '#f7d9c4', '#cfe8e0', '#d8e4f5', '#f5f0e6', '#e9c9a8', '#c97b5a', '#f4c56a', '#e8a9a0', '#b9d8ef'].map(c)
export const GLASS = ['#3d7fb5', '#4a9cc4', '#2f6b8f', '#5aa9b8', '#4673a8'].map(c)
const AWNINGS = ['#ff7a1a', '#19a974', '#2f6fe0', '#e2453b', '#ffb020', '#8a5cf6'].map(c)

const FRONT = { n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0] }
const UP = [0, 1, 0]
const all = (col) => ({ top: col, side: col, end: col, bottom: col })

export function rng(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/** Viewer's right when looking at a face whose outward normal is `n` (horizontal). */
const rightOf = (n) => [n[2], 0, -n[0]]

/** Axis-aligned box from min/max with per-face colours/patterns and options. */
export function box(mb, min, max, colors, patterns = {}, opts = {}) {
  const ctr = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const h = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2]
  mb.box(ctr, h, [1, 0, 0], [0, 1, 0], [0, 0, 1], colors.isColor ? all(colors) : colors, patterns, opts)
}

/** A beam between two points, `t` thick. */
function beam(mb, p0, p1, t, color, pattern = 0) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
  const len = Math.hypot(d[0], d[1], d[2]) || 1
  const ay = [d[0] / len, d[1] / len, d[2] / len]
  const ref = Math.abs(ay[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  let ax = [ay[1] * ref[2] - ay[2] * ref[1], ay[2] * ref[0] - ay[0] * ref[2], ay[0] * ref[1] - ay[1] * ref[0]]
  const al = Math.hypot(ax[0], ax[1], ax[2]) || 1
  ax = [ax[0] / al, ax[1] / al, ax[2] / al]
  const az = [ax[1] * ay[2] - ax[2] * ay[1], ax[2] * ay[0] - ax[0] * ay[2], ax[0] * ay[1] - ax[1] * ay[0]]
  const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2]
  mb.box(mid, [t / 2, len / 2, t / 2], ax, ay, az, all(color), pattern ? { side: pattern, end: pattern, top: pattern } : {}, { along: ay })
}

/** Low-poly blob (octahedron), for tree crowns. */
function blob(mb, [x, y, z], rx, ry, color) {
  const top = [x, y + ry, z]
  const bot = [x, y - ry * 0.7, z]
  const ring = [
    [x + rx, y, z],
    [x, y, z + rx],
    [x - rx, y, z],
    [x, y, z - rx],
  ]
  for (let i = 0; i < 4; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % 4]
    mb.tri(top, b, a, color)
    mb.tri(bot, a, b, color)
  }
}

export function tree(mb, x, z, s, rand) {
  mb.prism(x, z, LAND_Y, LAND_Y + 2.4 * s, 0.22 * s, 5, C.trunk)
  const leaf = rand() < 0.5 ? C.leaf : C.leafLight
  blob(mb, [x, LAND_Y + 3.4 * s, z], 1.9 * s, 1.8 * s, leaf)
  blob(mb, [x + 0.5 * s, LAND_Y + 4.6 * s, z - 0.3 * s], 1.3 * s, 1.3 * s, leaf)
}

function lamp(mb, x, z, n) {
  mb.prism(x, z, LAND_Y, LAND_Y + 6, 0.13, 5, C.navy)
  const r = rightOf(n)
  const arm = [x + n[0] * 0.9, LAND_Y + 6, z + n[2] * 0.9]
  beam(mb, [x, LAND_Y + 5.9, z], arm, 0.14, C.navy)
  box(mb, [arm[0] - 0.35 - Math.abs(r[0]) * 0.1, LAND_Y + 5.75, arm[2] - 0.35 - Math.abs(r[2]) * 0.1], [arm[0] + 0.35, LAND_Y + 6.0, arm[2] + 0.35], C.lampHead, all(PATTERN.GLOW))
}

/** A quay: paved top and sea-wall sides. */
function quay(mb, x0, z0, x1, z1) {
  box(mb, [x0, SEA_FLOOR, z0], [x1, LAND_Y, z1], { top: C.paving, side: C.seawall, end: C.seawall, bottom: C.seawall }, { top: PATTERN.TILES })
}

/** Waterside railing: posts every 3.2 m and a top rail, along x (z fixed) or along z. */
function railing(mb, alongX, fixed, a0, a1) {
  for (let a = a0; a <= a1; a += 3.2) {
    const px = alongX ? a : fixed
    const pz = alongX ? fixed : a
    box(mb, [px - 0.08, LAND_Y, pz - 0.08], [px + 0.08, LAND_Y + 1.1, pz + 0.08], C.post)
  }
  const r0 = alongX ? [a0, LAND_Y + 1.1, fixed - 0.1] : [fixed - 0.1, LAND_Y + 1.1, a0]
  const r1 = alongX ? [a1, LAND_Y + 1.24, fixed + 0.1] : [fixed + 0.1, LAND_Y + 1.24, a1]
  box(mb, r0, r1, C.rail)
}

/** A street: asphalt with a dashed centre line, a few cm proud of the paving. */
function street(mb, x0, z0, x1, z1) {
  const alongX = x1 - x0 > z1 - z0
  box(mb, [x0, LAND_Y, z0], [x1, LAND_Y + 0.04, z1], { top: C.asphalt, side: C.asphalt, end: C.asphalt }, { top: PATTERN.ASPHALT }, { skip: ['bottom'] })
  const mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2
  if (alongX) box(mb, [x0, LAND_Y + 0.04, mid - 0.12], [x1, LAND_Y + 0.06, mid + 0.12], C.line, { top: PATTERN.DASH }, { skip: ['bottom'], along: [1, 0, 0] })
  else box(mb, [mid - 0.12, LAND_Y + 0.04, z0], [mid + 0.12, LAND_Y + 0.06, z1], C.line, { top: PATTERN.DASH }, { skip: ['bottom'] })
}

/** A billboard on a face: frame box plus a quad placement for the banner atlas. */
function billboard(mb, out, centre, n, width, art) {
  const height = width / 2
  const r = rightOf(n)
  mb.box([centre[0] + n[0] * 0.15, centre[1], centre[2] + n[2] * 0.15], [width / 2 + 0.35, height / 2 + 0.35, 0.15], r, UP, n, all(C.frame), {}, { skip: ['bottom'] })
  out.banners.push({ art, center: [centre[0] + n[0] * 0.32, centre[1], centre[2] + n[2] * 0.32], right: r, up: UP, width, height })
  // Two lamps on arms over the top edge, shining down on the artwork.
  const topY = centre[1] + height / 2 + 0.35
  for (const k of [-0.3, 0.3]) {
    const bx = centre[0] + r[0] * width * k
    const bz = centre[2] + r[2] * width * k
    const reach = 0.25 + Math.min(1.6, width * 0.07)
    mb.box([bx + n[0] * (0.3 + reach / 2), topY + 0.35, bz + n[2] * (0.3 + reach / 2)], [0.08, 0.08, reach / 2], r, UP, n, all(C.frame))
    mb.box([bx + n[0] * (0.3 + reach), topY + 0.25, bz + n[2] * (0.3 + reach)], [0.32, 0.16, 0.2], r, UP, n, { top: C.frame, side: C.frame, end: C.frame, bottom: C.lampHead }, { bottom: PATTERN.GLOW })
  }
}

/** A low-poly palm for a resort roof: a slim trunk and a crown of drooping fronds (two-sided). */
function palm(mb, x, y, z, s) {
  const h = 3.4 * s
  mb.prism(x, z, y, y + h, 0.17 * s, 5, C.trunk, C.trunk)
  const top = [x, y + h, z]
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2 + 0.3
    const dx = Math.cos(a)
    const dz = Math.sin(a)
    const mid = [x + dx * 1.5 * s, y + h + 0.55 * s, z + dz * 1.5 * s]
    const tip = [x + dx * 2.7 * s, y + h - 0.55 * s, z + dz * 2.7 * s]
    const left = [mid[0] - dz * 0.5 * s, mid[1], mid[2] + dx * 0.5 * s]
    const right = [mid[0] + dz * 0.5 * s, mid[1], mid[2] - dx * 0.5 * s]
    const col = k % 2 ? C.leaf : C.leafLight
    mb.tri(top, left, tip, col)
    mb.tri(top, tip, left, col)
    mb.tri(top, tip, right, col)
    mb.tri(top, right, tip, col)
  }
}

/** Glow-ring colours of the neon resort towers (our palette: teal, warm gold, coral). */
export const RESORT_RINGS = ['#5fe3ff', '#ffd23a', '#ff7a3a'].map(c)
/** Debug: `?noresort` turns the resort towers off (before/after screenshots). */
const NO_RESORT = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('noresort')
/** The resort towers' cream facade. */
export const RESORT_WALL = c('#efe3c4')

/**
 * A building: optional shop floor (glass shopfronts + striped awning on the front),
 * one or more tiers (facade or glass), cornices, rooftop clutter, an optional banner
 * on the front and a rooftop billboard. Options for towers: `base` (ground height,
 * default the quay), `bands` (a trim band every N metres), `crown` (a lit crown band
 * and spire on top).
 */
export function building(mb, out, spec, detail, rand) {
  // (`?noresort` in the URL draws the resort towers as plain towers: for before/after screenshots.)
  const b = NO_RESORT && spec.resort ? { ...spec, resort: undefined, rooftop: undefined, bands: undefined, roof: undefined, wall: spec.wall === RESORT_WALL ? WALLS[Math.abs(Math.round(spec.x)) % WALLS.length] : spec.wall } : spec
  const { x, z, w, d, h, front = 'n', style = 'facade', shop = true } = b
  const base = b.base ?? LAND_Y
  const n = FRONT[front]
  const r = rightOf(n)
  const wallPick = b.wall || WALLS[Math.floor(rand() * WALLS.length)]
  const wall = b.resort ? RESORT_WALL : wallPick
  const glass = b.glass || GLASS[Math.floor(rand() * GLASS.length)]
  const body = style === 'glass' ? glass : wall
  const pat = style === 'glass' ? PATTERN.GLASS : PATTERN.FACADE
  const trim = b.trim || C.trim
  let y0 = base
  if (shop) {
    box(mb, [x - w / 2, y0, z - d / 2], [x + w / 2, y0 + 5, z + d / 2], { top: C.roof, side: C.shopGlass, end: C.shopGlass }, { side: PATTERN.GLASS, end: PATTERN.GLASS }, { skip: ['bottom'] })
    // Awning along the front.
    const awn = b.awning || AWNINGS[Math.floor(rand() * AWNINGS.length)]
    const fc = [x + n[0] * (w / 2 + 0.9), y0 + 4.2, z + n[2] * (d / 2 + 0.9)]
    const span = Math.abs(n[2]) ? w : d
    mb.box(fc, [span / 2 - 0.4, 0.12, 0.9], r, UP, n, all(awn), { top: PATTERN.STRIPES, side: PATTERN.STRIPES, end: PATTERN.STRIPES }, { along: r })
    y0 += 5
  }
  const tiers = b.tiers || [[1, 1]]
  const faces = []
  const ext = []
  for (const [scale, frac] of tiers) {
    const tw = w * scale
    const td = d * scale
    const top = base + h * frac
    box(mb, [x - tw / 2, y0, z - td / 2], [x + tw / 2, top, z + td / 2], { top: C.roof, side: body, end: body }, { side: pat, end: pat }, { skip: ['bottom'] })
    // Trim bands up the tier, then the cornice.
    if (b.bands) {
      // (No band behind a billboard: the frame's edges would sit flush with it.)
      const by = b.banner ? (b.banner.y !== undefined ? base + b.banner.y : null) : null
      const bh = b.banner ? (b.banner.width || 22) / 4 + 0.8 : 0
      for (let y = y0 + b.bands; y < top - b.bands * 0.5; y += b.bands) if (by === null || Math.abs(y - by) > bh) box(mb, [x - tw / 2 - 0.2, y - 0.35, z - td / 2 - 0.2], [x + tw / 2 + 0.2, y + 0.35, z + td / 2 + 0.2], trim)
    }
    box(mb, [x - tw / 2 - 0.3, top - 0.5, z - td / 2 - 0.3], [x + tw / 2 + 0.3, top + 0.25, z + td / 2 + 0.3], trim)
    faces.push({ half: Math.abs(n[2]) ? td / 2 : tw / 2, span: Math.abs(n[2]) ? tw : td, bottom: y0, top })
    ext.push({ tw, td, bottom: y0, top })
    y0 = top + 0.25
  }
  const roofY = y0
  const last = tiers[tiers.length - 1][0]
  const rw = w * last
  const rd = d * last
  if (b.crown) {
    // A glowing crown band and a spire: towers read from far down the track.
    box(mb, [x - rw / 2 - 0.4, roofY, z - rd / 2 - 0.4], [x + rw / 2 + 0.4, roofY + 1.6, z + rd / 2 + 0.4], b.crown, all(PATTERN.GLOW), { skip: ['bottom'] })
    if (detail) {
      mb.prism(x, z, roofY + 1.6, roofY + 1.6 + Math.min(40, h * 0.12), 0.6, 6, C.white)
      box(mb, [x - 0.7, roofY + 1.6 + Math.min(40, h * 0.12), z - 0.7], [x + 0.7, roofY + 3 + Math.min(40, h * 0.12), z + 0.7], C.red, all(PATTERN.GLOW))
    }
  } else if (detail) {
    if (b.roof === 'antenna') {
      mb.prism(x, z, roofY, roofY + Math.min(40, h * 0.22), 0.35, 6, C.white)
      box(mb, [x - 0.6, roofY + Math.min(40, h * 0.22), z - 0.6], [x + 0.6, roofY + Math.min(40, h * 0.22) + 1.2, z + 0.6], C.red, all(PATTERN.GLOW))
    } else if (b.roof === 'helipad') {
      mb.prism(x, z, roofY, roofY + 0.4, Math.min(rw, rd) * 0.38, 12, C.roofDark, C.roofDark)
      mb.prism(x, z, roofY + 0.4, roofY + 0.45, Math.min(rw, rd) * 0.3, 12, c('#ffc41f'), c('#ffc41f'), PATTERN.GLOW)
    } else if (b.roof !== 'none') {
      // Water tank on legs and a couple of AC units (on a resort tower, towards the back, clear
      // of the rooftop sign and the palms).
      const D = Math.abs(n[2]) ? rd : rw
      const W = Math.abs(n[2]) ? rw : rd
      const bx = x - n[0] * D * 0.2
      const bz = z - n[2] * D * 0.2
      const tx = b.resort ? bx - r[0] * W * 0.22 : x - rw * 0.22
      const tz = b.resort ? bz - r[2] * W * 0.22 : z + rd * 0.18
      for (const [ox, oz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) box(mb, [tx + ox - 0.1, roofY, tz + oz - 0.1], [tx + ox + 0.1, roofY + 2, tz + oz + 0.1], C.roofDark)
      mb.prism(tx, tz, roofY + 2, roofY + 4.6, 1.5, 8, c('#8b6b45'), C.roofDark)
      if (b.resort) {
        // Two AC units either side of the tank's opposite number, centred, axis-aligned.
        for (const k of [0, 1]) {
          const ux = bx + r[0] * W * 0.22 - n[0] * k * 3.2
          const uz = bz + r[2] * W * 0.22 - n[2] * k * 3.2
          box(mb, [ux - 1.2, roofY, uz - 0.8], [ux + 1.2, roofY + 1.4, uz + 0.8], C.tank)
        }
      } else {
        const ux = x + rw * 0.12
        const uz = z - rd * 0.2
        box(mb, [ux, roofY, uz], [ux + 2.4, roofY + 1.4, uz + 1.6], C.tank)
        box(mb, [ux, roofY, uz + 2.6], [ux + 2.4, roofY + 1.4, uz + 4.2], C.tank)
      }
    }
  }
  if (b.resort) {
    // Neon resort tower: glowing rings wrapped round the whole tower (a little proud of the
    // facade and the floor bands, never coplanar with them); LOW keeps one, no palms.
    const rs = b.resort
    const cols = rs.colors || RESORT_RINGS
    const rings = rs.rings || [0.34, 0.54, 0.74].map((f) => h * f)
    const count = detail ? rings.length : 1
    for (let k = 0; k < count; k += 1) {
      let ry = base + rings[k] + 0.37
      // Keep the ring's top and bottom faces 5 cm or more off any floor band's (never coplanar).
      const tier0 = ext.find((e) => ry > e.bottom + 1.5 && ry + 1.1 < e.top - 1.4)
      if (b.bands && tier0) {
        // (Bands sit at tier bottom + k * bands, 0.35 m either side.)
        for (let tries = 0; tries < 8; tries += 1) {
          const edges = [ry, ry + 1.1].map((e) => (((e - tier0.bottom) % b.bands) + b.bands) % b.bands)
          const clash = edges.some((m) => [0.35, b.bands - 0.35, b.bands + 0.35, -0.35].some((q) => Math.abs(m - q) < 0.06))
          if (!clash) break
          ry += 0.17
        }
      }
      const t = ext.find((e) => ry > e.bottom + 1.5 && ry + 1.1 < e.top - 1.4)
      if (!t) continue
      box(mb, [x - t.tw / 2 - 0.5, ry, z - t.td / 2 - 0.5], [x + t.tw / 2 + 0.5, ry + 1.1, z + t.td / 2 + 0.5], cols[k % cols.length], all(k === 1 ? PATTERN.PULSE : PATTERN.GLOW))
    }
    if (detail) {
      const D = Math.abs(n[2]) ? rd : rw
      const W = Math.abs(n[2]) ? rw : rd
      for (const s of [-1, 1]) palm(mb, x - n[0] * (D / 2 - 2) + r[0] * s * (W / 2 - 2.2), roofY, z - n[2] * (D / 2 - 2) + r[2] * s * (W / 2 - 2.2), 1 + 0.12 * s)
    }
  }
  if (b.banner) {
    const { art, at = 0.6 } = b.banner
    const first = faces[0]
    // `y` (above the ground) places it exactly; otherwise `at` up the first tier.
    const y = b.banner.y !== undefined ? base + b.banner.y : first.bottom + (first.top - first.bottom) * at
    const face = faces.find((f) => y >= f.bottom && y <= f.top) || first
    const width = b.banner.width || Math.min(face.span * 0.8, 22)
    // Keep the frame clear of the tier's cornice and floor (no flush faces).
    const hh = width / 4 + 0.35
    const yc = Math.min(Math.max(y, face.bottom + hh + 0.8), face.top - hh - 0.9)
    const centre = [x + n[0] * face.half, yc, z + n[2] * face.half]
    billboard(mb, out, centre, n, width, art)
  }
  if (b.rooftop) {
    const { art, width } = b.rooftop
    const hgt = width / 2
    const rb = [x + n[0] * (Math.abs(n[2]) ? rd : rw) * 0.25, roofY, z + n[2] * (Math.abs(n[2]) ? rd : rw) * 0.25]
    for (const s of [-1, 1]) {
      const px = rb[0] + r[0] * s * width * 0.35
      const pz = rb[2] + r[2] * s * width * 0.35
      box(mb, [px - 0.25, roofY, pz - 0.25], [px + 0.25, roofY + 2.2, pz + 0.25], C.frame)
    }
    billboard(mb, out, [rb[0], roofY + 2.2 + hgt / 2, rb[2]], n, width, art)
  }
}

/** The Sky Docks Tower: a stepped glass landmark with a spire and crown banners. */
function skyTower(mb, out, x, z, detail) {
  const g = c('#3d86c4')
  const tiers = [
    [36, 70],
    [28, 120],
    [20, 158],
  ]
  let y0 = LAND_Y
  for (const [s, top] of tiers) {
    box(mb, [x - s / 2, y0, z - s / 2], [x + s / 2, LAND_Y + top, z + s / 2], { top: C.roof, side: g, end: g }, { side: PATTERN.GLASS, end: PATTERN.GLASS }, { skip: ['bottom'] })
    box(mb, [x - s / 2 - 0.5, LAND_Y + top - 0.8, z - s / 2 - 0.5], [x + s / 2 + 0.5, LAND_Y + top + 0.4, z + s / 2 + 0.5], C.white)
    y0 = LAND_Y + top + 0.4
  }
  // Lobby podium and the spire.
  box(mb, [x - 24, LAND_Y, z - 24], [x + 24, LAND_Y + 7, z + 24], { top: C.roof, side: C.shopGlass, end: C.shopGlass }, { side: PATTERN.GLASS, end: PATTERN.GLASS }, { skip: ['bottom'] })
  mb.prism(x, z, y0, y0 + 34, 1.2, 6, C.white)
  if (detail) {
    for (let k = 0; k < 4; k += 1) mb.prism(x, z, y0 + 6 + k * 7, y0 + 7 + k * 7, 2.2 - k * 0.35, 6, C.red, C.red, PATTERN.GLOW)
  }
  box(mb, [x - 0.8, y0 + 34, z - 0.8], [x + 0.8, y0 + 36, z + 0.8], C.red, all(PATTERN.GLOW))
  // Crown banners on the middle tier, facing the pier (west) and the town (south).
  for (const f of ['w', 's', 'n']) {
    const n = FRONT[f]
    billboard(mb, out, [x + n[0] * 14, LAND_Y + 104, z + n[2] * 14], n, 24, 'logo')
  }
  billboard(mb, out, [x - 18, LAND_Y + 40, z], FRONT.w, 30, 'summit')
}

/** The ferry terminal: a long glass hall with a stepped roof, and its banner. */
function terminal(mb, out, x, z) {
  box(mb, [x - 11, LAND_Y, z - 30], [x + 11, LAND_Y + 9, z + 30], { top: C.roof, side: c('#5aa9b8'), end: c('#5aa9b8') }, { side: PATTERN.GLASS, end: PATTERN.GLASS }, { skip: ['bottom'] })
  box(mb, [x - 12.5, LAND_Y + 9, z - 31.5], [x + 12.5, LAND_Y + 10, z + 31.5], C.white)
  box(mb, [x - 8, LAND_Y + 10, z - 26], [x + 8, LAND_Y + 13, z + 26], { top: C.roof, side: C.white, end: C.white }, {}, { skip: ['bottom'] })
  box(mb, [x - 5, LAND_Y + 13, z - 22], [x + 5, LAND_Y + 15, z + 22], C.red)
  // Rooftop billboard on two posts, high enough to clear the ferry's funnel.
  for (const s of [-1, 1]) box(mb, [x - 5.5, LAND_Y + 15, z + s * 7 - 0.3], [x - 4.9, LAND_Y + 24, z + s * 7 + 0.3], C.frame)
  billboard(mb, out, [x - 5.5, LAND_Y + 29.5, z], FRONT.w, 22, 'ferries')
  // Gangway out to the ferry.
  box(mb, [x - 51, LAND_Y + 3.5, z - 2], [x - 11, LAND_Y + 4, z + 2], C.white)
  box(mb, [x - 51, LAND_Y + 4, z - 2], [x - 11, LAND_Y + 6.2, z + 2], c('#9fe3ff'), { side: PATTERN.GLASS, end: PATTERN.GLASS, top: 0 }, { skip: ['bottom'] })
  for (const gx of [x - 44, x - 30]) box(mb, [gx - 0.5, -2, z - 0.5], [gx + 0.5, LAND_Y + 3.5, z + 0.5], C.white)
}

/** A car ferry moored along z at (x, z): hull, two decks of windows, funnel. */
function ferry(mb, x, z) {
  const hull = C.navy
  box(mb, [x - 7, -2, z - 30], [x + 7, 4, z + 26], { top: c('#d8dde2'), side: hull, end: hull })
  // Bow wedge.
  mb.box([x, 1, z - 32.5], [4.5, 3, 2.5], [1, 0, 0], [0, 1, 0], [0, 0, 1], { top: c('#d8dde2'), side: hull, end: hull })
  box(mb, [x - 7.05, 1.2, z - 30.05], [x + 7.05, 1.8, z + 26.05], C.red)
  box(mb, [x - 6, 4, z - 22], [x + 6, 8, z + 22], C.white, { side: PATTERN.FACADE, end: PATTERN.FACADE }, { skip: ['bottom'] })
  box(mb, [x - 5, 8, z - 16], [x + 5, 11.5, z + 14], C.white, { side: PATTERN.FACADE, end: PATTERN.FACADE }, { skip: ['bottom'] })
  box(mb, [x - 5.5, 11.5, z - 18], [x + 5.5, 13, z - 10], c('#9fe3ff'), { side: PATTERN.GLASS, end: PATTERN.GLASS }, { skip: ['bottom'] })
  mb.prism(x, z + 6, 11.5, 18, 1.8, 8, C.red, c('#24282e'))
  mb.prism(x, z + 6, 15.5, 16.6, 1.85, 8, c('#24282e'), c('#24282e'))
  // Lifeboats.
  for (const s of [-1, 1]) for (const k of [-8, 0, 8]) box(mb, [x + s * 6.2 - 0.6, 9, z + k - 1.6], [x + s * 6.2 + 0.6, 10, z + k + 1.6], c('#ff7a1a'))
}

/** The lighthouse on its rock, with a short breakwater back to the west quay. */
function lighthouse(mb, x, z) {
  mb.prism(x, z, SEA_FLOOR, 1.5, 9, 9, C.rock, C.rock)
  box(mb, [-85, SEA_FLOOR, z - 3], [x - 4, 1.4, z + 3], { top: c('#9aa3ad'), side: C.rock, end: C.rock })
  const bands = 7
  for (let i = 0; i < bands; i += 1) {
    const y0 = 1.5 + i * 4
    const r0 = 3.6 - i * 0.22
    mb.prism(x, z, y0, y0 + 4, r0, 10, i % 2 ? C.white : C.red)
  }
  const top = 1.5 + bands * 4
  mb.prism(x, z, top, top + 0.5, 3.4, 10, c('#24282e'))
  mb.prism(x, z, top + 0.5, top + 3.2, 1.9, 10, c('#fff1a8'), c('#fff1a8'), PATTERN.GLOW)
  mb.prism(x, z, top + 3.2, top + 4.6, 2.3, 10, C.red)
  mb.prism(x, z, top + 4.6, top + 5.8, 0.4, 6, c('#24282e'))
}

/** The Harbour Wheel's A-frame legs and base (the wheel itself turns, see Harbour.jsx). */
function wheelFrame(mb, out) {
  const { x, z, y, r } = WHEEL
  for (const s of [-1, 1]) {
    const ax = x + s * 3.4
    beam(mb, [ax, LAND_Y, z - r * 0.62], [ax, y, z], 1.3, C.white)
    beam(mb, [ax, LAND_Y, z + r * 0.62], [ax, y, z], 1.3, C.white)
    beam(mb, [ax, LAND_Y + 12, z - r * 0.42], [ax, LAND_Y + 12, z + r * 0.42], 0.8, C.white)
  }
  box(mb, [x - 4.6, y - 1.4, z - 1.4], [x + 4.6, y + 1.4, z + 1.4], C.red)
  // Boarding platform and its booth.
  box(mb, [x - 6, LAND_Y, z - 7], [x + 6, LAND_Y + 1.2, z + 7], { top: c('#1fb5c9'), side: C.white, end: C.white }, { top: PATTERN.STRIPES }, { skip: ['bottom'] })
  box(mb, [x + 8, LAND_Y, z + 9], [x + 14, LAND_Y + 4, z + 15], C.white, {}, { skip: ['bottom'] })
  box(mb, [x + 7.5, LAND_Y + 4, z + 8.5], [x + 14.5, LAND_Y + 4.6, z + 15.5], c('#1fb5c9'))
  billboard(mb, out, [x + 14, LAND_Y + 8.5, z + 12], FRONT.e, 10, 'wheel')
}

/** A little sailing boat in the marina. */
function sailboat(mb, x, z, yaw, rand) {
  const f = [Math.sin(yaw), 0, -Math.cos(yaw)]
  const r = [-f[2], 0, f[0]]
  const hullCol = rand() < 0.5 ? C.white : c('#1f3570')
  mb.box([x, 0.3, z], [1.3, 0.55, 3.6], r, UP, [-f[0], 0, -f[2]], { top: c('#c8a77a'), side: hullCol, end: hullCol })
  mb.prism(x + f[0] * 0.4, z + f[2] * 0.4, 0.8, 9, 0.09, 4, C.white)
  const mast = [x + f[0] * 0.4, 0, z + f[2] * 0.4]
  const sail = rand() < 0.3 ? c('#ff7a1a') : C.white
  const a = [mast[0], 1.4, mast[2]]
  const b = [mast[0], 8.8, mast[2]]
  const d = [mast[0] - f[0] * 3, 1.4, mast[2] - f[2] * 3]
  mb.tri(a, b, d, sail)
  mb.tri(a, d, b, sail)
}

/**
 * The town (one merged geometry) and its billboard placements.
 * @param {boolean} detail rooftop clutter, more trees, boats (off on LOW)
 */
export function buildHarbour(detail) {
  const mb = new MeshBuilder()
  const out = { banners: [] }
  const rand = rng(4242)

  // --- Quays -----------------------------------------------------------------------------
  quay(mb, -240, 75, 240, 265)
  quay(mb, 85, -215, 265, 75)
  quay(mb, -265, -95, -85, 75)
  railing(mb, true, 75.6, -85, 85)
  railing(mb, false, 85.6, -214, 74)
  railing(mb, true, -214.4, 86, 264)
  railing(mb, false, -85.6, -94, 74)
  railing(mb, true, -94.4, -264, -86)
  street(mb, -240, 92, 240, 102)
  street(mb, 100, -215, 110, 75)
  street(mb, -108, -95, -98, 75)

  // --- South waterfront: a front row facing the pier, taller towers behind ---------------
  const front = [
    { x: -205, w: 26, h: 26 },
    { x: -174, w: 30, h: 38, bands: 8, roof: 'tank', resort: {}, rooftop: { art: 'harbourHotel', width: 20 } },
    { x: -140, w: 28, h: 22 },
    { x: -108, w: 26, h: 40 },
    { x: -76, w: 30, h: 30, banner: { art: 'cola' } },
    { x: -42, w: 28, h: 46, roof: 'antenna' },
    { x: -8, w: 34, h: 24, rooftop: { art: 'summit', width: 26 } },
    { x: 26, w: 26, h: 36 },
    { x: 58, w: 30, h: 36, bands: 8, roof: 'tank', resort: { colors: [RESORT_RINGS[1], RESORT_RINGS[2], RESORT_RINGS[0]] }, rooftop: { art: 'docksideSuites', width: 22 } },
    { x: 92, w: 26, h: 42 },
    { x: 124, w: 30, h: 26, banner: { art: 'tyres' } },
    { x: 158, w: 28, h: 34 },
    { x: 192, w: 30, h: 34, bands: 8, roof: 'tank', resort: { colors: [RESORT_RINGS[2], RESORT_RINGS[0], RESORT_RINGS[1]] }, rooftop: { art: 'gullBayResort', width: 22 } },
    { x: 222, w: 22, h: 30 },
  ]
  for (const f of front) building(mb, out, { ...f, z: 118, d: 24, front: 'n' }, detail, rand)
  const back = [
    { x: -200, h: 70, style: 'facade' },
    { x: -150, h: 96, style: 'glass', tiers: [[1, 0.7], [0.75, 1]], roof: 'helipad' },
    { x: -96, h: 70, style: 'facade', bands: 8, roof: 'tank', resort: {}, rooftop: { art: 'skyInn', width: 20 } },
    { x: -40, h: 110, style: 'glass', tiers: [[1, 0.6], [0.8, 0.85], [0.6, 1]], roof: 'antenna' },
    { x: 18, h: 78, style: 'facade', banner: { art: 'logo', at: 0.72, width: 22 } },
    { x: 70, h: 124, style: 'glass', tiers: [[1, 0.65], [0.7, 1]], roof: 'helipad' },
    { x: 128, h: 78, style: 'facade', bands: 8, roof: 'tank', tiers: [[1, 0.7], [0.8, 1]], resort: { colors: [RESORT_RINGS[1], RESORT_RINGS[0], RESORT_RINGS[2]] }, rooftop: { art: 'craneView', width: 18 } },
    { x: 186, h: 90, style: 'glass', roof: 'antenna' },
  ]
  for (const b of back) building(mb, out, { ...b, z: 185, w: 34, d: 34, front: 'n', shop: false }, detail, rand)

  // --- East: the Sky Docks Tower, the ferry terminal and warehouses ------------------------
  skyTower(mb, out, 170, -95, detail)
  terminal(mb, out, 124, -15)
  ferry(mb, 66, -15)
  building(mb, out, { x: 140, z: 48, w: 30, d: 30, h: 20, front: 'w', wall: c('#c97b5a'), banner: { art: 'tyres', at: 0.55 } }, detail, rand)
  building(mb, out, { x: 140, z: -160, w: 34, d: 30, h: 34, front: 'w', banner: { art: 'radio', at: 0.6 } }, detail, rand)
  building(mb, out, { x: 228, z: -10, w: 40, d: 40, h: 82, front: 'w', style: 'glass', tiers: [[1, 0.7], [0.7, 1]], shop: false }, detail, rand)
  building(mb, out, { x: 230, z: -170, w: 36, d: 36, h: 104, front: 'w', style: 'facade', shop: false, roof: 'antenna' }, detail, rand)
  building(mb, out, { x: 214, z: 52, w: 30, d: 30, h: 48, front: 'w', shop: false }, detail, rand)

  // --- West: old-town row facing the pier, the market hall, the wheel, the lighthouse ------
  const row = [
    { z: -78, h: 16 },
    { z: -62, h: 20 },
    { z: -46, h: 14 },
    { z: 42, h: 18 },
    { z: 58, h: 22, banner: { art: 'market', at: 0.55, width: 13 } },
  ]
  for (const f of row) building(mb, out, { ...f, x: -120, w: 14, d: 15, front: 'e', roof: 'none' }, detail, rand)
  building(mb, out, { x: -210, z: 40, w: 40, d: 40, h: 64, front: 'e', style: 'glass', shop: false, roof: 'helipad' }, detail, rand)
  building(mb, out, { x: -205, z: -50, w: 36, d: 36, h: 44, front: 'e', banner: { art: 'cola', at: 0.6 } }, detail, rand)
  building(mb, out, { x: -160, z: -70, w: 28, d: 28, h: 30, front: 'e' }, detail, rand)
  wheelFrame(mb, out)
  lighthouse(mb, -76, -80)

  // --- Trees, lamps, boats --------------------------------------------------------------
  const step = detail ? 14 : 28
  for (let x = -232; x <= 232; x += step) {
    if (Math.abs(x - 33) < 6) continue
    tree(mb, x, 84, 1 + rand() * 0.3, rand)
    lamp(mb, x + step / 2, 80, FRONT.s)
  }
  for (let z = -205; z <= 60; z += step) {
    if (z > -50 && z < 20) continue
    tree(mb, 92, z, 1 + rand() * 0.3, rand)
  }
  for (let z = -86; z <= 66; z += step) tree(mb, -91, z, 0.9 + rand() * 0.3, rand)
  // A small park beside the wheel.
  for (let k = 0; k < (detail ? 10 : 4); k += 1) tree(mb, -152 - rand() * 28, -24 + rand() * 40, 1 + rand() * 0.4, rand)
  if (detail) {
    const boats = [
      [-62, 58, 0.3],
      [-52, 62, -0.4],
      [-70, 48, 1.2],
      [55, 58, 2.6],
      [64, 64, 3.4],
      [-60, -30, 1.7],
    ]
    for (const [x, z, yaw] of boats) sailboat(mb, x, z, yaw, rand)
  }
  // The footbridge from the pier's south-east corner to the waterfront.
  footbridge(mb)

  return { geometry: mb.build(), banners: out.banners, triangles: mb.triangles }
}

/** An arched footbridge from the pier (z = 40) to the south quay (z = 75), at x = 33. */
function footbridge(mb) {
  const x = 33
  const steps = 8
  const z0 = 40
  const z1 = 75
  const y0 = 2
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps
    const t1 = (i + 1) / steps
    const ya = y0 + Math.sin(t0 * Math.PI) * 4 + (LAND_Y - y0) * t0
    const yb = y0 + Math.sin(t1 * Math.PI) * 4 + (LAND_Y - y0) * t1
    const za = z0 + (z1 - z0) * t0
    const zb = z0 + (z1 - z0) * t1
    mb.box([x, (ya + yb) / 2 - 0.25, (za + zb) / 2], [2.2, 0.25, Math.hypot(zb - za, yb - ya) / 2 + 0.05], [1, 0, 0], ...frameOf(za, ya, zb, yb), all(c('#c8a77a')), { top: PATTERN.PLANKS })
    for (const s of [-1, 1]) {
      beam(mb, [x + s * 2.1, ya + 1.1, za], [x + s * 2.1, yb + 1.1, zb], 0.16, C.rail)
      beam(mb, [x + s * 2.1, ya, za], [x + s * 2.1, ya + 1.1, za], 0.12, C.post)
    }
  }
  // Arch underneath.
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps
    const t1 = (i + 1) / steps
    const ya = 0.5 + Math.sin(t0 * Math.PI) * 3.2
    const yb = 0.5 + Math.sin(t1 * Math.PI) * 3.2
    beam(mb, [x, ya, z0 + (z1 - z0) * t0], [x, yb, z0 + (z1 - z0) * t1], 0.7, C.rail)
  }
}

/** Up and forward axes of a deck segment rising from (za, ya) to (zb, yb) along +z. */
function frameOf(za, ya, zb, yb) {
  const dz = zb - za
  const dy = yb - ya
  const l = Math.hypot(dz, dy) || 1
  const fwd = [0, dy / l, dz / l]
  const up = [0, dz / l, -dy / l]
  return [up, fwd]
}

/**
 * The far skyline (MEDIUM/HIGH): towers and low hills in an arc round the east, south
 * and west, where the track doesn't go. One merged geometry.
 */
export function buildSkyline() {
  const mb = new MeshBuilder()
  const rand = rng(777)
  for (let k = 0; k < 110; k += 1) {
    const a = -0.45 + rand() * (Math.PI + 0.7)
    const r = 330 + rand() * 120
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    // Only on the far shore (see the shore boxes below).
    if (!(z >= 285 || (x >= 295 && z >= -150) || (x <= -295 && z >= -120))) continue
    const w = 18 + rand() * 22
    const h = 40 + rand() * rand() * 170
    const glass = rand() < 0.45
    const col = glass ? GLASS[k % GLASS.length] : WALLS[k % WALLS.length]
    const pat = glass ? PATTERN.GLASS : PATTERN.FACADE
    box(mb, [x - w / 2, LAND_Y, z - w / 2], [x + w / 2, LAND_Y + h, z + w / 2], { top: C.roof, side: col, end: col }, { side: pat, end: pat }, { skip: ['bottom'] })
    if (h > 120) mb.prism(x, z, LAND_Y + h, LAND_Y + h + 18, 0.6, 5, C.white)
  }
  // Hills behind, and the far shore they stand on.
  for (let k = 0; k < 14; k += 1) {
    const a = -0.5 + (k / 13) * (Math.PI + 0.8)
    const r = 470 + rand() * 40
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (z < -150) continue
    const peak = [x, 50 + rand() * 60, z]
    const s = 90 + rand() * 50
    const col = rand() < 0.5 ? c('#5f9f78') : c('#78ad7f')
    const ring = [0, 1, 2, 3, 4].map((i) => {
      const t = (i / 5) * Math.PI * 2 + rand() * 0.4
      return [x + Math.cos(t) * s, LAND_Y - 1, z + Math.sin(t) * s]
    })
    for (let i = 0; i < 5; i += 1) mb.tri(peak, ring[(i + 1) % 5], ring[i], col)
  }
  // The far shore under it all: south, east and west.
  const shore = { top: c('#9fbf8f'), side: C.seawall, end: C.seawall }
  box(mb, [-560, SEA_FLOOR, 275], [560, LAND_Y - 0.5, 600], shore)
  box(mb, [285, SEA_FLOOR, -160], [600, LAND_Y - 0.5, 275], shore)
  box(mb, [-600, SEA_FLOOR, -130], [-285, LAND_Y - 0.5, 275], shore)
  return { geometry: mb.build(), triangles: mb.triangles }
}

/** One turning wheel: rims, spokes and the hub, in the wheel's own frame (axle = x). */
export function buildWheel() {
  const mb = new MeshBuilder()
  const { r } = WHEEL
  const n = 28
  const col = C.white
  for (const side of [-1.6, 1.6]) {
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * Math.PI * 2
      const a1 = ((i + 1) / n) * Math.PI * 2
      beam(mb, [side, Math.cos(a0) * r, Math.sin(a0) * r], [side, Math.cos(a1) * r, Math.sin(a1) * r], 0.7, col)
    }
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2
      beam(mb, [side, 0, 0], [side, Math.cos(a) * r, Math.sin(a) * r], 0.3, c('#d8dde2'))
    }
  }
  // Light strip round the rim.
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    beam(mb, [0, Math.cos(a0) * (r - 0.8), Math.sin(a0) * (r - 0.8)], [0, Math.cos(a1) * (r - 0.8), Math.sin(a1) * (r - 0.8)], 0.35, i % 2 ? c('#ffc41f') : c('#ff7a1a'), PATTERN.GLOW)
  }
  box(mb, [-2, -1.6, -1.6], [2, 1.6, 1.6], C.red)
  return mb.build()
}

/** A wheel cabin (white; tinted per instance), hanging below its pivot at the origin. */
export function buildCabin() {
  const mb = new MeshBuilder()
  box(mb, [-0.15, -1.4, -0.15], [0.15, 0, 0.15], C.white)
  box(mb, [-1.6, -4.2, -1.3], [1.6, -1.4, 1.3], C.white, { side: PATTERN.GLASS, end: PATTERN.GLASS })
  box(mb, [-1.8, -1.6, -1.5], [1.8, -1.2, 1.5], C.white)
  return mb.build()
}
