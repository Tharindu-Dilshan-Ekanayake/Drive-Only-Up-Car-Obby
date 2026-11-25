import { Color } from 'three'

import { footprintDistance, stageFootprints } from '@shared/track'

import { MeshBuilder } from '../../render/meshBuilder'
import { HARBOUR_ZONES, rng } from '../harbourGeometry'
import { NEON_PATTERN as NP } from './neonMaterial'
import { NEON_ARTS } from './neonSigns'
import { takePrebuilt } from '../../prep/prebuilt'

/**
 * Neon Night City's scenery as plain geometry (no React, no GPU), laid out from the stage
 * (deterministic, seeded):
 *
 * - The towers along the track: dark facades full of lit windows (or LED curtain walls),
 *   neon corner strips, glowing bands and roof outlines, spires with beacons, about two in
 *   five carrying a rooftop sign, some a hologram in front of their face at road height.
 *   Each about as tall as the road beside it - and always well under any road that passes
 *   over it (the track coils over itself), never on a support pillar.
 * - Set pieces round the road (`stage.decor`, shared/stages/neonCity.js): a tower under every
 *   checkpoint plaza (the plazas are rooftops), towers under the Rooftop Leap's roofs, the
 *   tower the Glow Tunnel runs through (lit inside), the core tower inside the Interchange
 *   helix, neon rings round the loop run-ups, the Neon Crown's pylons at the finish.
 * - The city grid far below: a ground of dark blocks and streets with traffic trails (the
 *   material draws them), low-rise blocks on it (`lowRise`: off on LOW), a lit seawall.
 *
 * Everything is on the neon material (./neonMaterial.js); signs, holograms and searchlight
 * beams come back as placements for ./neonSigns.js and ./searchlights.js. The towers and
 * set pieces are split into 200 m tiles (the track coils over itself, so a run of sections
 * covers the whole map), the low-rise blocks into 256 m tiles, so the renderer culls what's
 * out of view (and the scenery what's lost in the fog).
 */

export const GROUND_Y = 2.5
const SEA_FLOOR = -4
/** Top of the concrete platforms under buildings standing in the water. */
const PLATFORM_Y = GROUND_Y - 0.25
const SECTIONS_PER_CHUNK = 2
const TILE = 256
/** Tiles (m) the towers and set pieces are grouped in, for culling. */
const AREA = 200
/** Metres between a track-side tower's footprint and the road's centre line. */
const ROAD_CLEAR = 18
/** A road passing within this much (beyond its edge) of a building must clear its roof by UNDER m. */
const SIDE = 9
const UNDER = 14
const HEIGHT_CAP = 900

const c = (hex) => new Color(hex)
const WALLS = ['#161b30', '#1b1631', '#11202b', '#211a2a', '#191d27', '#1d1539', '#14182a'].map(c)
const ACCENTS = ['#2de2ff', '#ff3df0', '#9b6bff', '#ffd23a', '#3dffb0', '#ff6e3d', '#ff6ec7'].map(c)
const LEDS = ['#2de2ff', '#ff3df0', '#9b6bff', '#3dffb0', '#ffd23a'].map(c)
const ROOF = c('#10131f')
const PANEL = c('#0b0d18')
const CONCRETE = c('#262b3a')
const SEAWALL = c('#1c2030')
const RED = c('#ff2a3a')
const WHITE = c('#dfe6ff')
const BEAM_COLORS = ['#bfe6ff', '#d8c6ff', '#c6fff4', '#ffd9f4']

const FRONT = { n: [0, 0, -1], s: [0, 0, 1], e: [1, 0, 0], w: [-1, 0, 0] }
/** Viewer's right looking at a face whose outward normal is `n` (horizontal). */
const rightOf = (n) => [n[2], 0, -n[0]]
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]

// ---- Geometry helpers ------------------------------------------------------------

/** A convex polygon wound so its normal faces `out`. */
function face(mb, pts, out, color, pattern = 0, coords = null) {
  const u = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]]
  const v = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]]
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const flip = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0
  const p = flip ? [...pts].reverse() : pts
  const k = coords ? (flip ? [...coords].reverse() : coords) : pts.map(() => 0)
  for (let i = 1; i < p.length - 1; i += 1) mb.tri(p[0], p[i], p[i + 1], color, pattern, [k[0], k[i], k[i + 1]])
}

/**
 * An upright block on a horizontal frame (`r` right, `f` forward; unit, level): `hw` x `hd`
 * half extents round (x, z), from y0 to y1. Walls carry a pattern coordinate along the
 * wall (metres, from `u0`) for the window grid; `pats` overrides a wall's pattern by side
 * ('r', 'l', 'f', 'b'); `roof` / `bottom` colours draw those faces.
 */
function block(mb, { x, z, r = [1, 0, 0], f = [0, 0, 1], hw, hd, y0, y1, color, pat = NP.WINDOWS, pats = {}, roof = ROOF, bottom = null, u0 = 0 }) {
  const P = (sr, sf, y) => [x + r[0] * hw * sr + f[0] * hd * sf, y, z + r[2] * hw * sr + f[2] * hd * sf]
  const walls = [
    ['r', r, hd, [1, 0]],
    ['l', [-r[0], 0, -r[2]], hd, [-1, 0]],
    ['f', f, hw, [0, 1]],
    ['b', [-f[0], 0, -f[2]], hw, [0, -1]],
  ]
  let u = u0
  for (const [key, n, half, [sr, sf]] of walls) {
    const R = rightOf(n)
    const wc = [x + r[0] * hw * sr + f[0] * hd * sf, 0, z + r[2] * hw * sr + f[2] * hd * sf]
    const a = [wc[0] - R[0] * half, y0, wc[2] - R[2] * half]
    const b = [wc[0] + R[0] * half, y0, wc[2] + R[2] * half]
    const p = pats[key] ?? pat
    face(mb, [a, b, [b[0], y1, b[2]], [a[0], y1, a[2]]], n, color, p, [u, u + half * 2, u + half * 2, u])
    u += half * 2 + 7.3
  }
  if (roof) face(mb, [P(-1, -1, y1), P(1, -1, y1), P(1, 1, y1), P(-1, 1, y1)], [0, 1, 0], roof)
  if (bottom) face(mb, [P(-1, -1, y0), P(1, -1, y0), P(1, 1, y0), P(-1, 1, y0)], [0, -1, 0], bottom)
}

/** Axis-aligned glowing (or plain) box, bottom face left out. */
function gbox(mb, min, max, color, pattern = NP.GLOW) {
  const ctr = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const h = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2]
  const col = { top: color, side: color, end: color }
  mb.box(ctr, h, [1, 0, 0], [0, 1, 0], [0, 0, 1], col, { top: pattern, side: pattern, end: pattern }, { skip: ['bottom'] })
}

/** An oriented box between two points, `t` thick (strips, ring segments, posts). */
function beam(mb, p0, p1, t, color, pattern = NP.GLOW, ref = null) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
  const len = Math.hypot(d[0], d[1], d[2]) || 1
  const ay = [d[0] / len, d[1] / len, d[2] / len]
  const rr = ref || (Math.abs(ay[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])
  let ax = [ay[1] * rr[2] - ay[2] * rr[1], ay[2] * rr[0] - ay[0] * rr[2], ay[0] * rr[1] - ay[1] * rr[0]]
  const al = Math.hypot(ax[0], ax[1], ax[2]) || 1
  ax = [ax[0] / al, ax[1] / al, ax[2] / al]
  const az = [ax[1] * ay[2] - ax[2] * ay[1], ax[2] * ay[0] - ax[0] * ay[2], ax[0] * ay[1] - ax[1] * ay[0]]
  const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2]
  const col = { top: color, side: color, end: color, bottom: color }
  mb.box(mid, [t / 2, len / 2, t / 2], ax, ay, az, col, { top: pattern, side: pattern, end: pattern, bottom: pattern }, { along: ay })
}

/** Upright prism (n sides) round (x, z): walls with a coordinate round the circumference. */
function prism(mb, x, z, y0, y1, rad, n, color, pattern, roof = ROOF) {
  const side = 2 * rad * Math.sin(Math.PI / n)
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    const p0 = [x + Math.cos(a0) * rad, y0, z + Math.sin(a0) * rad]
    const p1 = [x + Math.cos(a1) * rad, y0, z + Math.sin(a1) * rad]
    const am = (a0 + a1) / 2
    face(mb, [p0, p1, [p1[0], y1, p1[2]], [p0[0], y1, p0[2]]], [Math.cos(am), 0, Math.sin(am)], color, pattern, [i * side, (i + 1) * side, (i + 1) * side, i * side])
    if (roof) face(mb, [[x, y1, z], [p0[0], y1, p0[2]], [p1[0], y1, p1[2]]], [0, 1, 0], roof)
  }
}

// ---- Layout helpers ---------------------------------------------------------------

function gridOf(points, cell = 40) {
  const g = new Map()
  for (const p of points) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`
    if (!g.has(k)) g.set(k, [])
    g.get(k).push(p)
  }
  return g
}

function* near(grid, x, z, rad, cell = 40) {
  const cx = Math.floor(x / cell)
  const cz = Math.floor(z / cell)
  const n = Math.ceil(rad / cell)
  for (let i = -n; i <= n; i += 1) {
    for (let j = -n; j <= n; j += 1) {
      const list = grid.get(`${cx + i},${cz + j}`)
      if (list) yield* list
    }
  }
}

/** Highest a roof at (x, z) of radius `rad` may reach: UNDER m below every road passing over or beside it. */
function capAt(grid, x, z, rad, skip = null) {
  let cap = Infinity
  for (const p of near(grid, x, z, rad + 30)) {
    if (skip && skip(p)) continue
    if (Math.hypot(p.x - x, p.z - z) < rad + p.w / 2 + SIDE) cap = Math.min(cap, p.y - UNDER)
  }
  return cap
}

const supportNear = (sgrid, x, z, rad) => {
  for (const s of near(sgrid, x, z, rad + 4)) if (Math.hypot(s.x - x, s.z - z) < rad + (s.width || 2) / 2) return true
  return false
}

/** Is (x, z) on the city's ground (north of the harbour), `m` m in from its edges? */
function inGround(B, x, z, m) {
  if (x < B.x0 + m || x > B.x1 - m || z < B.z0 + m) return false
  if (HARBOUR_ZONES.some(([x0, z0, x1, z1]) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m)) return false
  return (x <= -280 - m && z <= -100 - m) || z <= -230 - m
}

/** Distance from (x, z) to an oriented rectangle (centre, forward f, half sizes hl along f, hw across). */
function rectDistance(R, x, z) {
  const dx = x - R.x
  const dz = z - R.z
  const a = Math.abs(dx * R.f[0] + dz * R.f[2]) - R.hl
  const b = Math.abs(dx * R.f[2] - dz * R.f[0]) - R.hw
  return Math.hypot(Math.max(0, a), Math.max(0, b))
}

/** Frame of a path sample: level forward and right. */
function levelFrame(p) {
  const l = Math.hypot(p.fx, p.fz) || 1
  const f = [p.fx / l, 0, p.fz / l]
  return { f, r: [-f[2], 0, f[0]] }
}

// ---- Buildings -------------------------------------------------------------------

/**
 * A track-side neon tower (spec from neonLayout). `detail` adds bands, rooftop clutter
 * and spires (off on LOW).
 */
function tower(mb, out, t, detail) {
  const { x, z, w, d, base, top, wall, accent, accent2, front } = t
  const n = FRONT[front]
  const R = rightOf(n)
  const tiers = t.tiers || [[1, 1]]
  let y0 = base
  const faces = []
  let tw = w
  let td = d
  for (const [k, frac] of tiers) {
    tw = w * k
    td = d * k
    const y1 = base + (top - base) * frac
    block(mb, { x, z, hw: tw / 2, hd: td / 2, y0, y1, color: t.led ? LEDS[t.ledIndex] : wall, pat: t.led ? NP.LED : NP.WINDOWS, u0: t.u0 })
    // Neon strips up the corners, a little proud of the walls (LOW: the top tier's only).
    if (detail || frac === 1) for (const sx of [-1, 1]) for (const sz of [-1, 1]) gbox(mb, [x + sx * tw / 2 - 0.35, y0 + 0.4, z + sz * td / 2 - 0.35], [x + sx * tw / 2 + 0.35, y1 - 0.5, z + sz * td / 2 + 0.35], accent)
    // Glowing bands round the tier.
    if (t.bands && detail) {
      for (let y = y0 + t.bands; y < y1 - 8; y += t.bands) gbox(mb, [x - tw / 2 - 0.45, y, z - td / 2 - 0.45], [x + tw / 2 + 0.45, y + 0.7, z + td / 2 + 0.45], accent2, t.pulse ? NP.PULSE : NP.GLOW)
    }
    faces.push({ half: Math.abs(n[2]) ? td / 2 : tw / 2, span: Math.abs(n[2]) ? tw : td, bottom: y0, top: y1 })
    y0 = y1
  }
  const roofY = y0
  // A glowing outline round the roof.
  for (const s of [-1, 1]) {
    gbox(mb, [x - tw / 2 - 0.2, roofY, z + s * td / 2 - 0.3], [x + tw / 2 + 0.2, roofY + 0.9, z + s * td / 2 + 0.3], accent)
    gbox(mb, [x + s * tw / 2 - 0.3, roofY, z - td / 2 + 0.3], [x + s * tw / 2 + 0.3, roofY + 0.9, z + td / 2 - 0.3], accent)
  }
  if (detail && t.spire) {
    const sh = Math.min(45, (top - base) * 0.12)
    prism(mb, x, z, roofY, roofY + sh, 0.5, 6, WHITE, NP.PLAIN)
    gbox(mb, [x - 0.7, roofY + sh, z - 0.7], [x + 0.7, roofY + sh + 1.3, z + 0.7], RED, NP.PULSE)
  } else if (detail) {
    // AC units and a water tank (dark), towards the back of the roof.
    const bx = x - n[0] * Math.min(tw, td) * 0.2
    const bz = z - n[2] * Math.min(tw, td) * 0.2
    gbox(mb, [bx - 1.6, roofY, bz - 1.1], [bx + 1.6, roofY + 1.5, bz + 1.1], CONCRETE, NP.PLAIN)
    prism(mb, bx + R[0] * 4, bz + R[2] * 4, roofY, roofY + 3.2, 1.4, 8, CONCRETE, NP.PLAIN)
  }
  if (t.sign) {
    const width = Math.min(18, faces[faces.length - 1].span * 0.8)
    const height = width / 2
    const depth = Math.abs(n[2]) ? td : tw
    const sc = [x + n[0] * depth * 0.22, roofY + 2.4 + height / 2, z + n[2] * depth * 0.22]
    for (const s of [-1, 1]) {
      const px = sc[0] + R[0] * s * width * 0.32 - n[0] * 0.35
      const pz = sc[2] + R[2] * s * width * 0.32 - n[2] * 0.35
      gbox(mb, [px - 0.22, roofY, pz - 0.22], [px + 0.22, roofY + 2.5, pz + 0.22], PANEL, NP.PLAIN)
    }
    // A dark backing panel, the sign quad 10 cm in front of it.
    mb.box(add(sc, n, -0.2), [width / 2 + 0.35, height / 2 + 0.35, 0.15], R, [0, 1, 0], n, { top: PANEL, side: PANEL, end: PANEL, bottom: PANEL })
    out.signs.push({ art: t.sign, center: add(sc, n, 0.05), right: R, up: [0, 1, 0], width, height, chunk: t.chunk })
  }
  if (t.holo) {
    // A hologram floating in front of the face at road height, its projector on the wall.
    const fc = faces.find((fz) => t.holoY >= fz.bottom + 8 && t.holoY <= fz.top - 8) || faces[0]
    const width = Math.min(22, fc.span * 0.85)
    const height = width / 2
    const y = Math.min(Math.max(t.holoY, fc.bottom + height / 2 + 3), fc.top - height / 2 - 3)
    const ctr = [x + n[0] * (fc.half + 3.2), y, z + n[2] * (fc.half + 3.2)]
    out.holos.push({ art: t.holo, center: ctr, right: R, up: [0, 1, 0], width, height, chunk: t.chunk })
    const pj = [x + n[0] * (fc.half + 0.5), y - height / 2 - 1.2, z + n[2] * (fc.half + 0.5)]
    mb.box(pj, [width * 0.3, 0.25, 0.5], R, [0, 1, 0], n, { top: accent, side: PANEL, end: PANEL, bottom: PANEL }, { top: NP.GLOW })
  }
  if (t.beam) out.beams.push({ x, y: roofY + 1, z, phase: t.beam.phase, speed: t.beam.speed, tilt: t.beam.tilt, color: t.beam.color, h: top })
}

/** A plain dark tower on an oriented footprint with neon corners and a glowing fascia under the deck it carries. */
function deckTower(mb, P, detail) {
  const { x, z, f, hl, hw, top, accent } = P
  const r = [-f[2], 0, f[0]]
  const base = P.sea ? SEA_FLOOR : GROUND_Y
  // In the water: on a concrete platform (its top a little under the city ground's level).
  const foot = P.sea ? PLATFORM_Y : GROUND_Y
  if (P.sea) block(mb, { x, z, r, f, hw: hw + 3, hd: hl + 3, y0: SEA_FLOOR, y1: PLATFORM_Y, color: SEAWALL, pat: NP.PLAIN, roof: CONCRETE })
  block(mb, { x, z, r, f, hw, hd: hl, y0: foot, y1: top, color: P.wall, pat: P.led ? NP.LED : NP.WINDOWS, u0: P.u0 })
  // Corner strips and a glowing fascia band just under the deck.
  for (const sr of [-1, 1]) {
    for (const sf of [-1, 1]) {
      const cx = x + r[0] * hw * sr + f[0] * hl * sf
      const cz = z + r[2] * hw * sr + f[2] * hl * sf
      beam(mb, [cx, GROUND_Y + 0.5, cz], [cx, top - 3.4, cz], 0.8, accent)
    }
  }
  const fy = top - 2.6
  for (const [n, half] of [[r, hl], [f, hw]]) {
    for (const s of [-1, 1]) {
      const R = rightOf([n[0] * s, 0, n[2] * s])
      const wc = [x + n[0] * s * (n === r ? hw : hl), fy, z + n[2] * s * (n === r ? hw : hl)]
      beam(mb, add(add(wc, R, -half), [n[0] * s, 0, n[2] * s], 0.35), add(add(wc, R, half), [n[0] * s, 0, n[2] * s], 0.35), 0.7, accent, P.pulse ? NP.PULSE : NP.GLOW, [0, 1, 0])
    }
  }
  if (detail && top - base > 60) {
    for (let y = GROUND_Y + 40; y < top - 20; y += 40) {
      for (const s of [-1, 1]) {
        const wc = [x + r[0] * s * (hw + 0.4), y, z + r[2] * s * (hw + 0.4)]
        beam(mb, add(wc, f, -hl), add(wc, f, hl), 0.5, P.accent2, NP.GLOW, [0, 1, 0])
      }
    }
  }
}

/** The tower the Glow Tunnel runs through: a block with a lit tunnel through its base. */
function tunnelTower(mb, out, T, detail) {
  const { x, z, f, r, L, ya, yb, top } = T
  const Wi = 8.6
  const Wo = 30
  const floor = Math.min(ya, yb) - 1.3
  const ceil = Math.max(ya, yb) + 9
  const hl = L / 2
  const wall = WALLS[2]
  const u0 = 13.7
  if (T.sea) block(mb, { x, z, r, f, hw: Wo + 3, hd: hl + 3, y0: SEA_FLOOR, y1: PLATFORM_Y, color: SEAWALL, pat: NP.PLAIN, roof: CONCRETE })
  const foot = T.sea ? PLATFORM_Y : GROUND_Y
  // Side blocks (dark walls inside), the block under the road and the one over the tunnel.
  for (const s of [-1, 1]) {
    const off = s * (Wi + Wo) / 2
    block(mb, { x: x + r[0] * off, z: z + r[2] * off, r, f, hw: (Wo - Wi) / 2, hd: hl, y0: foot, y1: top, color: wall, pats: { [s > 0 ? 'l' : 'r']: NP.PLAIN }, u0 })
  }
  block(mb, { x, z, r, f, hw: Wi, hd: hl, y0: foot, y1: floor, color: wall, roof: PANEL, u0 })
  block(mb, { x, z, r, f, hw: Wi, hd: hl, y0: ceil, y1: top, color: wall, bottom: PANEL, u0 })
  // Inside: two chasing light strips along each wall following the road's slope, and light
  // panels across the ceiling.
  const at = (t, lat, h) => {
    const y = ya + ((yb - ya) * (t + hl)) / L + h
    return [x + f[0] * t + r[0] * lat, y, z + f[2] * t + r[2] * lat]
  }
  for (const s of [-1, 1]) {
    const n = [-r[0] * s, 0, -r[2] * s]
    for (const [h, col] of [[1.8, ACCENTS[0]], [5.2, ACCENTS[1]]]) {
      const lat = s * (Wi - 0.04)
      const a = at(-hl + 0.5, lat, h)
      const b = at(hl - 0.5, lat, h)
      face(mb, [a, b, [b[0], b[1] + 0.45, b[2]], [a[0], a[1] + 0.45, a[2]]], n, col, NP.CHASE, [0, L, L, 0])
    }
    // A dark walkway between the barrier and the wall (no view down past the road's edge).
    const e = T.w / 2 + 0.05
    face(mb, [at(-hl, s * e, -0.4), at(hl, s * e, -0.4), at(hl, s * Wi, -0.4), at(-hl, s * Wi, -0.4)], [0, 1, 0], PANEL)
  }
  for (let t = -hl + 5; t < hl - 3; t += 9) {
    const a = [x + f[0] * t - r[0] * (Wi - 1.5), ceil - 0.06, z + f[2] * t - r[2] * (Wi - 1.5)]
    const b = [x + f[0] * t + r[0] * (Wi - 1.5), ceil - 0.06, z + f[2] * t + r[2] * (Wi - 1.5)]
    const fa = add(a, f, 0.8)
    const fb = add(b, f, 0.8)
    face(mb, [a, b, fb, fa], [0, -1, 0], WHITE, NP.GLOW)
  }
  // Portal frames round both mouths: magenta in, cyan out.
  for (const [s, col] of [[-1, ACCENTS[1]], [1, ACCENTS[0]]]) {
    const n = [f[0] * s, 0, f[2] * s]
    // (1 m thick, standing just clear of the tower's face.)
    const mouth = (lat, y) => [x + f[0] * s * (hl + 0.6) + r[0] * lat, y, z + f[2] * s * (hl + 0.6) + r[2] * lat]
    const y0 = (s < 0 ? ya : yb) - 1
    beam(mb, mouth(-Wi - 0.5, y0), mouth(-Wi - 0.5, ceil + 0.5), 1, col, NP.GLOW, n)
    beam(mb, mouth(Wi + 0.5, y0), mouth(Wi + 0.5, ceil + 0.5), 1, col, NP.GLOW, n)
    beam(mb, mouth(-Wi - 1, ceil + 0.5), mouth(Wi + 1, ceil + 0.5), 1, col, NP.GLOW, n)
  }
  // Neon bands up the tower and a sign over the entrance.
  if (detail) {
    for (let y = ceil + 20; y < top - 10; y += 30) gboxOriented(mb, x, z, r, f, Wo + 0.45, hl + 0.45, y, y + 0.8, ACCENTS[2])
  }
  const sc = [x - f[0] * (hl + 0.6), ceil + 9, z - f[2] * (hl + 0.6)]
  const n = [-f[0], 0, -f[2]]
  out.holos.push({ art: 'upWeDrive', center: add(sc, n, 1.5), right: rightOf(n), up: [0, 1, 0], width: 22, height: 11, chunk: T.chunk })
}

/** A ring band round an oriented block (`hw`, `hl` half extents), from y0 to y1. */
function gboxOriented(mb, x, z, r, f, hw, hl, y0, y1, color) {
  for (const [n, half, off] of [[r, hl, hw], [f, hw, hl]]) {
    for (const s of [-1, 1]) {
      const R = rightOf([n[0] * s, 0, n[2] * s])
      const wc = [x + n[0] * s * off, (y0 + y1) / 2, z + n[2] * s * off]
      beam(mb, add(wc, R, -half - 0.4), add(wc, R, half + 0.4), y1 - y0, color, NP.GLOW, [0, 1, 0])
    }
  }
}

/** The core tower inside the Interchange helix: a round glass tower ringed with light. */
function coreTower(mb, out, C, detail) {
  const { x, z, rad, top } = C
  prism(mb, x, z, GROUND_Y, top, rad, 12, LEDS[0], NP.LED)
  for (let y = GROUND_Y + 24; y < top - 6; y += detail ? 14 : 28) prism(mb, x, z, y, y + 0.9, rad + 0.5, 12, ACCENTS[(Math.round(y / 14) % 2) * 1], NP.PULSE, null)
  prism(mb, x, z, top, top + 3, rad * 0.7, 12, ACCENTS[1], NP.GLOW)
  if (detail) {
    prism(mb, x, z, top + 3, top + 40, 0.7, 6, WHITE, NP.PLAIN)
    gbox(mb, [x - 0.9, top + 40, z - 0.9], [x + 0.9, top + 41.6, z + 0.9], RED, NP.PULSE)
  }
  out.beams.push({ x, y: top + 3.2, z, phase: 0.4, speed: 0.35, tilt: 0.42, color: BEAM_COLORS[1], h: top })
}

/** A neon ring round the road (it passes through it), centred `lift` over the surface. */
function ring(mb, p, color, radius = 8.6, lift = 2.2, n = 18) {
  const { f } = levelFrame(p)
  const up = [p.ux, p.uy, p.uz]
  const right = [-f[2], 0, f[0]]
  const c0 = [p.x + up[0] * lift, p.y + up[1] * lift, p.z + up[2] * lift]
  const pt = (k) => {
    const a = (k / n) * Math.PI * 2
    return [c0[0] + right[0] * Math.cos(a) * radius + up[0] * Math.sin(a) * radius, c0[1] + right[1] * Math.cos(a) * radius + up[1] * Math.sin(a) * radius, c0[2] + right[2] * Math.cos(a) * radius + up[2] * Math.sin(a) * radius]
  }
  for (let k = 0; k < n; k += 1) beam(mb, pt(k), pt(k + 1), 0.5, color, NP.GLOW, [f[0], 0, f[2]])
}

// ---- Layout ------------------------------------------------------------------------

const layoutCache = new WeakMap()

/** Is path sample `p` one this city is built round (a zone view's sections only, else all)? */
const inZone = (stage, p) => !stage.zone || (p.section >= stage.zone.from && p.section <= stage.zone.to)

/**
 * The city's ground: 360 m round its roads. In a zone of a bigger map (the Grand Tour) only
 * round the zone's own roads, and clipped short of the next zone's roads to the east (the
 * mountains): the city ends at a seawall and the last road leaves it over the water.
 */
function boundsOf(stage) {
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  for (const p of stage.path) {
    if (!inZone(stage, p)) continue
    x0 = Math.min(x0, p.x)
    x1 = Math.max(x1, p.x)
    z0 = Math.min(z0, p.z)
  }
  const B = { x0: x0 - 360, x1: x1 + 360, z0: z0 - 360 }
  if (stage.zone) {
    const mid = (x0 + x1) / 2
    for (const p of stage.path) {
      if (inZone(stage, p) || p.z < B.z0 || p.z > 0 || p.x < mid) continue
      B.x1 = Math.min(B.x1, p.x - 200)
    }
  }
  return B
}

/** The set pieces round the road (from `stage.decor` and the checkpoints), each with a footprint. */
function setPieces(stage, grid, sgrid, B) {
  const rand = rng(777)
  const pieces = []
  const path = stage.path
  const decor = stage.decor || {}
  const chunkOf = (section) => Math.floor(section / SECTIONS_PER_CHUNK)
  const okSite = (x, z, rad) => !(Math.abs(x) < 80 && z > -80 && z < 80) && !HARBOUR_ZONES.some(([x0, z0, x1, z1]) => x > x0 - rad && x < x1 + rad && z > z0 - rad && z < z1 + rad)
  /** Is an oriented footprint clear of every road below `top` (but the piece's own path range) and of other roads' pillars? */
  const clearBelow = (R, top, own) => {
    for (const p of near(grid, R.x, R.z, Math.hypot(R.hl, R.hw) + 30)) {
      if (own(p)) continue
      if (p.y < top + UNDER && rectDistance(R, p.x, p.z) < p.w / 2 + 4) return false
    }
    for (const s of near(sgrid, R.x, R.z, Math.hypot(R.hl, R.hw) + 6)) {
      if (Math.abs(s.top - (top + 0.05)) < 0.6) continue
      if (s.top > top + 2 && rectDistance(R, s.x, s.z) < 2) return false
    }
    return true
  }

  // A tower under every checkpoint plaza: the plazas are rooftops.
  for (const fp of stageFootprints(stage)) {
    if (fp.kind !== 'plaza' || fp.index === 0) continue
    // (In a zone view: only the zone's own plazas - plaza k starts section k.)
    if (stage.zone && (fp.index < stage.zone.from || fp.index > stage.zone.to)) continue
    const cp = stage.checkpoints[fp.index]
    const top = fp.y - 1.25
    if (top < 12) continue
    const f = [fp.fx, 0, fp.fz]
    const own = (p) => p.s > fp.sFrom - 30 && p.s < fp.sTo + 30
    for (const k of [0.92, 0.78, 0.62, 0.48]) {
      const R = { x: fp.x, z: fp.z, f, hl: fp.hl * k - 2, hw: fp.hw * k - 2 }
      if (!okSite(fp.x, fp.z, Math.max(R.hl, R.hw) + 4)) break
      if (!clearBelow(R, top, own)) continue
      const sea = !inGround(B, fp.x, fp.z, 0)
      pieces.push({ kind: 'plaza', ...R, top, sea, finish: !!cp.finish, wall: WALLS[fp.index % WALLS.length], led: fp.index % 3 === 1, accent: ACCENTS[fp.index % ACCENTS.length], accent2: ACCENTS[(fp.index + 2) % ACCENTS.length], pulse: fp.index % 2 === 0, u0: rand() * 100, r: Math.hypot(R.hl, R.hw), chunk: chunkOf(cp.index) })
      break
    }
  }
  // Towers under the Rooftop Leap's roofs.
  for (const rg of decor.rooftops || []) {
    const a = path[rg.from]
    const b = path[rg.to]
    const mid = path[Math.round((rg.from + rg.to) / 2)]
    const { f } = levelFrame(mid)
    let top = Infinity
    for (let i = rg.from; i <= rg.to; i += 1) top = Math.min(top, path[i].y - 1.25)
    const R = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, f, hl: Math.hypot(b.x - a.x, b.z - a.z) / 2 + 1, hw: 12 }
    const own = (p) => p.i >= rg.from - 30 && p.i <= rg.to + 30
    if (!okSite(R.x, R.z, 20) || !clearBelow(R, top, own)) continue
    pieces.push({ kind: 'roof', ...R, top, sea: !inGround(B, R.x, R.z, 0), wall: WALLS[(rg.from >> 3) % WALLS.length], led: true, accent: ACCENTS[(rg.from >> 2) % ACCENTS.length], accent2: ACCENTS[1], pulse: true, u0: rand() * 100, r: Math.hypot(R.hl, R.hw), chunk: chunkOf(mid.section) })
  }
  // The Glow Tunnel's tower.
  for (const rg of decor.tunnels || []) {
    const a = path[rg.from]
    const b = path[rg.to]
    const mid = path[Math.round((rg.from + rg.to) / 2)]
    const { f, r } = levelFrame(mid)
    const L = Math.hypot(b.x - a.x, b.z - a.z)
    const x = (a.x + b.x) / 2
    const z = (a.z + b.z) / 2
    // (Its own road runs on in line with it at both mouths.)
    const own = (p) => p.i >= rg.from - 25 && p.i <= rg.to + 25
    const R = { x, z, f, hl: L / 2, hw: 30 }
    // Roads over it cap its height; none may pass through it below the tunnel's ceiling.
    let top = Math.max(a.y, b.y) + 9 + 110
    let ok = true
    for (const p of near(grid, x, z, L / 2 + 60)) {
      if (own(p) || rectDistance(R, p.x, p.z) > p.w / 2 + SIDE) continue
      if (p.y < Math.max(a.y, b.y) + 9 + UNDER) ok = false
      else top = Math.min(top, p.y - UNDER)
    }
    if (!ok || !okSite(x, z, 40)) continue
    pieces.push({ kind: 'tunnel', x, z, f, r, L, ya: a.y, yb: b.y, w: mid.w, top, sea: !inGround(B, x, z, 0), hl: L / 2, hw: 30, r0: Math.hypot(L / 2, 30), chunk: chunkOf(mid.section) })
  }
  // The core tower inside the Interchange helix.
  for (const rg of decor.spirals || []) {
    let sx = 0
    let sz = 0
    let ymax = -Infinity
    const n = rg.to - rg.from + 1
    for (let i = rg.from; i <= rg.to; i += 1) {
      sx += path[i].x
      sz += path[i].z
      ymax = Math.max(ymax, path[i].y)
    }
    const x = sx / n
    const z = sz / n
    let inner = Infinity
    for (let i = rg.from; i <= rg.to; i += 1) inner = Math.min(inner, Math.hypot(path[i].x - x, path[i].z - z) - path[i].w / 2)
    const rad = Math.min(14, inner - 6)
    if (rad < 6) continue
    const own = (p) => p.i >= rg.from - 4 && p.i <= rg.to + 4
    // (Only if no road below the helix stops it short: a stub in the middle would look lost.)
    let ymin = Infinity
    for (let i = rg.from; i <= rg.to; i += 1) ymin = Math.min(ymin, path[i].y)
    const top = Math.min(ymax + 55, capAt(grid, x, z, rad, own))
    if (top < ymin || !okSite(x, z, rad)) continue
    pieces.push({ kind: 'core', x, z, rad, top, r0: rad + 2, chunk: chunkOf(path[rg.from].section) })
  }
  for (const p of pieces) if (p.r0 === undefined) p.r0 = p.r
  return pieces
}

/**
 * Where everything goes along `stage` for a scenery density (1 = HIGH): the set pieces and
 * the track-side towers. Cached per stage and density.
 */
export function neonLayout(stage, density = 1) {
  let byDensity = layoutCache.get(stage)
  if (!byDensity) layoutCache.set(stage, (byDensity = new Map()))
  if (byDensity.has(density)) return byDensity.get(density)
  const B = boundsOf(stage)
  const grid = gridOf(stage.path)
  const sgrid = gridOf(stage.supports)
  const fps = stageFootprints(stage)
  const pieces = setPieces(stage, grid, sgrid, B)
  const taken = pieces.map((p) => ({ x: p.x, z: p.z, r: p.r0 }))
  const rand = rng(51515)
  const towers = []
  const spacing = 44 / Math.max(0.3, density)
  let nextS = 110
  let beams = 0
  for (const p of stage.path) {
    if (p.s < nextS || p.air || !inZone(stage, p)) continue
    nextS = p.s + spacing * (0.7 + rand() * 0.6)
    const len = Math.hypot(p.fx, p.fz) || 1
    const nx = -p.fz / len
    const nz = p.fx / len
    const sides = rand() < 0.5 ? [1, -1] : [-1, 1]
    for (const side of sides) {
      const w = 16 + Math.round(rand() * 20)
      const d = 16 + Math.round(rand() * 20)
      const r = Math.hypot(w, d) / 2
      const off = r + ROAD_CLEAR + 2 + rand() * 40
      const x = p.x + nx * off * side + (rand() - 0.5) * 10
      const z = p.z + nz * off * side + (rand() - 0.5) * 10
      if (!inGround(B, x, z, r + 2)) continue
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r + 6)) continue
      if (supportNear(sgrid, x, z, r + 2)) continue
      let cap = capAt(grid, x, z, r)
      for (const fp of fps) if (footprintDistance(fp, x, z) < r + 8) cap = Math.min(cap, fp.y - UNDER)
      const want = Math.max(36, p.y * (0.7 + rand() * 0.55) + 14 + rand() * 32)
      const top = Math.min(want, cap, HEIGHT_CAP)
      if (top - GROUND_Y < 26) continue
      const toRoad = [p.x - x, p.z - z]
      const front = Math.abs(toRoad[0]) > Math.abs(toRoad[1]) ? (toRoad[0] > 0 ? 'e' : 'w') : toRoad[1] > 0 ? 's' : 'n'
      const tall = top - GROUND_Y > 110
      const led = rand() < (tall ? 0.28 : 0.12)
      const spec = {
        x,
        z,
        w,
        d,
        r,
        base: GROUND_Y,
        top,
        front,
        chunk: Math.floor(p.section / SECTIONS_PER_CHUNK),
        wall: WALLS[Math.floor(rand() * WALLS.length)],
        led,
        ledIndex: Math.floor(rand() * LEDS.length),
        accent: ACCENTS[Math.floor(rand() * ACCENTS.length)],
        accent2: ACCENTS[Math.floor(rand() * ACCENTS.length)],
        u0: rand() * 200,
        bands: rand() < 0.65 ? 24 + Math.round(rand() * 4) * 8 : 0,
        pulse: rand() < 0.3,
        tiers: tall && rand() < 0.65 ? [[1, 0.55 + rand() * 0.15], [0.78, 0.85], [0.56, 1]] : tall ? [[1, 0.72], [0.7, 1]] : null,
        spire: tall && rand() < 0.55,
        sign: rand() < 0.42 ? NEON_ARTS[Math.floor(rand() * NEON_ARTS.length)] : null,
        holo: rand() < 0.38 ? NEON_ARTS[Math.floor(rand() * NEON_ARTS.length)] : null,
        holoY: p.y + 6,
        beam: null,
      }
      if (tall && rand() < 0.4 && beams < 24) {
        beams += 1
        spec.beam = { phase: rand() * Math.PI * 2, speed: 0.2 + rand() * 0.35, tilt: 0.25 + rand() * 0.4, color: BEAM_COLORS[Math.floor(rand() * BEAM_COLORS.length)] }
      }
      towers.push(spec)
      taken.push({ x, z, r })
      break
    }
  }
  const out = { B, pieces, towers, taken, grid, sgrid }
  byDensity.set(density, out)
  return out
}

/** Low-rise blocks on the city grid (64 m blocks, 14 m streets), under every road with room to spare. */
function lowRise(stage, L, density) {
  const rand = rng(8080)
  const out = []
  const { B, grid, sgrid, taken } = L
  const keep = Math.min(1, density)
  for (let gx = Math.floor(B.x0 / 64); gx * 64 < B.x1; gx += 1) {
    for (let gz = Math.floor(B.z0 / 64); gz * 64 < -100; gz += 1) {
      const bx0 = gx * 64 + 14
      const bz0 = gz * 64 + 14
      const lots = rand() < 0.5 ? 2 : rand() < 0.5 ? 1 : 4
      const cells = lots === 1 ? [[0, 0, 50, 50]] : lots === 2 ? [[0, 0, 25, 50], [25, 0, 50, 50]] : [[0, 0, 25, 25], [25, 0, 50, 25], [0, 25, 25, 50], [25, 25, 50, 50]]
      for (const [a0, b0, a1, b1] of cells) {
        if (rand() > keep) continue
        const m = 2.5 + rand() * 2
        const x0 = bx0 + a0 + m
        const x1 = bx0 + a1 - m
        const z0 = bz0 + b0 + m
        const z1 = bz0 + b1 - m
        const x = (x0 + x1) / 2
        const z = (z0 + z1) / 2
        const r = Math.hypot(x1 - x0, z1 - z0) / 2
        if (!inGround(B, x, z, r)) continue
        if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r + 2)) continue
        if (supportNear(sgrid, x, z, r)) continue
        const cap = capAt(grid, x, z, r)
        const h = Math.min(8 + rand() * rand() * 70, cap - GROUND_Y)
        if (h < 6) continue
        out.push({ x, z, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, h, wall: WALLS[Math.floor(rand() * WALLS.length)], accent: rand() < 0.22 ? ACCENTS[Math.floor(rand() * ACCENTS.length)] : null, u0: rand() * 300 })
      }
    }
  }
  return out
}

/**
 * Builds the neon city along `stage`: one geometry per chunk of sections (track-side towers
 * and set pieces), per 256 m tile of low-rise blocks (`lowRise`), the ground with its
 * seawall, and the sign / hologram / searchlight placements.
 */
export function buildNeonCity(stage, { density = 1, detail = true, lowRise: withLowRise = true } = {}) {
  // Built ahead of time in the prep worker (game/prep), when it was.
  const pre = takePrebuilt('neon', stage, { density, detail, lowRise: withLowRise })
  if (pre) return pre
  const L = neonLayout(stage, density)
  const builders = new Map()
  const mbFor = (key) => {
    if (!builders.has(key)) builders.set(key, new MeshBuilder())
    return builders.get(key)
  }
  const out = { signs: [], holos: [], beams: [] }
  // Spatial tiles (not sections): the track coils over itself, so a chunk of sections spans the map.
  const tileOf = (x, z) => `s${Math.floor(x / AREA)},${Math.floor(z / AREA)}`
  for (const t of L.towers) tower(mbFor(tileOf(t.x, t.z)), out, t, detail)
  for (const P of L.pieces) {
    const mb = mbFor(tileOf(P.x, P.z))
    if (P.kind === 'plaza' || P.kind === 'roof') deckTower(mb, P, detail)
    else if (P.kind === 'tunnel') tunnelTower(mb, out, P, detail)
    else if (P.kind === 'core') coreTower(mb, out, P, detail)
    if (P.kind === 'plaza' && P.finish) neonCrown(mb, out, P)
  }
  // The Glow Tunnel: neon rings every 8 m round a straight, alternating cyan and magenta.
  for (const rg of stage.decor?.lightTunnels || []) {
    const len = stage.path[rg.to].s - stage.path[rg.from].s
    const n = Math.max(2, Math.round(len / (detail ? 8 : 12)))
    for (let k = 0; k <= n; k += 1) {
      const p = stage.path[Math.round(rg.from + ((rg.to - rg.from) * k) / n)]
      ring(mbFor(tileOf(p.x, p.z)), p, ACCENTS[k % 2], 9.2, 2.6, detail ? 18 : 12)
    }
  }
  // Neon rings round the loop run-ups.
  const rings = [ACCENTS[0], ACCENTS[1], ACCENTS[2]]
  for (const rg of stage.decor?.rings || []) {
    const n = 6
    for (let k = 0; k < n; k += 1) {
      const p = stage.path[Math.round(rg.from + ((rg.to - rg.from) * (k + 0.5)) / n)]
      ring(mbFor(tileOf(p.x, p.z)), p, rings[k % 3], 8.6, 2.2, detail ? 18 : 12)
    }
  }
  // The Sky Bridge out of the city (the Grand Tour): pairs of tall pylons either side of the
  // span every ~85 m, rising from the water past the deck, a light strip up their road
  // faces, a beacon on top and two neon stay cables down to the deck's edges.
  for (const rg of stage.decor?.bridges || []) {
    const len = stage.path[rg.to].s - stage.path[rg.from].s
    const n = Math.max(2, Math.round(len / 85))
    for (let k = 1; k < n; k += 1) {
      const p = stage.path[Math.round(rg.from + ((rg.to - rg.from) * k) / n)]
      const { f, r } = levelFrame(p)
      const top = p.y + 34
      for (const s of [-1, 1]) {
        const off = p.w / 2 + 3.4
        const bx = p.x + r[0] * off * s
        const bz = p.z + r[2] * off * s
        const mb = mbFor(tileOf(bx, bz))
        gbox(mb, [bx - 1.5, SEA_FLOOR, bz - 1.5], [bx + 1.5, top, bz + 1.5], SEAWALL, NP.PLAIN)
        const fx = bx - r[0] * s * 1.55
        const fz = bz - r[2] * s * 1.55
        mb.box([fx, (p.y + 1.6 + top) / 2, fz], [0.35, (top - p.y - 2.4) / 2, 0.06], f, [0, 1, 0], [-r[0] * s, 0, -r[2] * s], { top: ACCENTS[k % 2], side: ACCENTS[k % 2], end: ACCENTS[k % 2], bottom: ACCENTS[k % 2] }, { top: NP.GLOW, side: NP.GLOW, end: NP.GLOW, bottom: NP.GLOW })
        gbox(mb, [bx - 0.8, top, bz - 0.8], [bx + 0.8, top + 1.4, bz + 0.8], RED, NP.PULSE)
        for (const a of [-1, 1]) {
          const ex = p.x + r[0] * s * (p.w / 2 + 0.9) + f[0] * a * 30
          const ez = p.z + r[2] * s * (p.w / 2 + 0.9) + f[2] * a * 30
          beam(mb, [bx - r[0] * s * 1.2, top - 2, bz - r[2] * s * 1.2], [ex, p.y + 0.4 + p.fy * a * 30, ez], 0.22, ACCENTS[(k + 1) % 2])
        }
      }
    }
  }
  if (withLowRise) {
    for (const b of lowRise(stage, L, density)) {
      const mb = mbFor(`t${Math.floor(b.x / TILE)},${Math.floor(b.z / TILE)}`)
      block(mb, { x: b.x, z: b.z, hw: b.hw, hd: b.hd, y0: GROUND_Y, y1: GROUND_Y + b.h, color: b.wall, u0: b.u0 })
      if (b.accent) gbox(mb, [b.x - b.hw - 0.3, GROUND_Y + b.h - 1.6, b.z - b.hd - 0.3], [b.x + b.hw + 0.3, GROUND_Y + b.h - 0.7, b.z + b.hd + 0.3], b.accent)
    }
  }
  let triangles = 0
  const chunks = []
  for (const [key, mb] of builders) {
    triangles += mb.triangles
    chunks.push({ key, geometry: mb.build(), triangles: mb.triangles })
  }
  const ground = groundGeometry(L.B)
  return { chunks, ground, signs: out.signs, holos: out.holos, beams: out.beams.sort((a, b) => b.h - a.h), triangles, towers: L.towers.length, pieces: L.pieces.length }
}

/** The Neon Crown at the finish: glowing pylons at the summit tower's corners and a hologram over the far end. */
function neonCrown(mb, out, P) {
  const { x, z, f, hl, hw, top } = P
  const r = [-f[2], 0, f[0]]
  for (const sr of [-1, 1]) {
    for (const sf of [-1, 1]) {
      const cx = x + r[0] * (hw - 0.6) * sr + f[0] * (hl - 0.6) * sf
      const cz = z + r[2] * (hw - 0.6) * sr + f[2] * (hl - 0.6) * sf
      beam(mb, [cx, top - 3.3, cz], [cx, top + 28, cz], 1.2, ACCENTS[sr * sf > 0 ? 0 : 1], NP.PULSE)
      out.beams.push({ x: cx, y: top + 28.5, z: cz, phase: (sr + 2 * sf) * 1.3, speed: 0.45, tilt: 0.3, color: BEAM_COLORS[(sr + sf + 2) % 4], h: top + 200 })
    }
  }
  const far = [x + f[0] * (hl + 6), top + 17, z + f[2] * (hl + 6)]
  const n = [-f[0], 0, -f[2]]
  out.holos.push({ art: 'upWeDrive', center: far, right: rightOf(n), up: [0, 1, 0], width: 34, height: 17, chunk: P.chunk })
}

/** The city ground (two big quads north of the harbour) and its lit seawall. */
function groundGeometry(B) {
  const mb = new MeshBuilder()
  const rects = [
    [B.x0, B.z0, -280, -100],
    [-280, B.z0, B.x1, -230],
  ]
  for (const [x0, z0, x1, z1] of rects) face(mb, [[x0, GROUND_Y, z0], [x1, GROUND_Y, z0], [x1, GROUND_Y, z1], [x0, GROUND_Y, z1]], [0, 1, 0], WHITE, NP.STREETS)
  // Seawall faces towards the water, and a cyan strip along the top of each.
  const edges = [
    [[B.x0, -100], [-280, -100], [0, 0, 1]],
    [[-280, -100], [-280, -230], [1, 0, 0]],
    [[-280, -230], [B.x1, -230], [0, 0, 1]],
    [[B.x1, -230], [B.x1, B.z0], [1, 0, 0]],
    [[B.x0, B.z0], [B.x0, -100], [-1, 0, 0]],
    [[B.x0, B.z0], [B.x1, B.z0], [0, 0, -1]],
  ]
  for (const [[ax, az], [bx, bz], n] of edges) {
    face(mb, [[ax, SEA_FLOOR, az], [bx, SEA_FLOOR, bz], [bx, GROUND_Y, bz], [ax, GROUND_Y, az]], n, SEAWALL, NP.PLAIN)
    const o = (x, z, k) => [x + n[0] * k, 0, z + n[2] * k]
    const a = o(ax, az, 0.05)
    const b = o(bx, bz, 0.05)
    face(mb, [[a[0], GROUND_Y - 0.9, a[2]], [b[0], GROUND_Y - 0.9, b[2]], [b[0], GROUND_Y - 0.5, b[2]], [a[0], GROUND_Y - 0.5, a[2]]], n, ACCENTS[0], NP.GLOW)
  }
  return mb.build()
}
