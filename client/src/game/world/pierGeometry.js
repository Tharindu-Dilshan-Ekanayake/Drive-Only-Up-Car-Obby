import { Color } from 'three'

import { BAY, BAY_ROWS, BOARDS, DECK_Y, LOBBY_HALF, lobbyBoxes, PADS, PORTAL, PORTALS, PROMO_BOARDS, promoPoles, PROPS, START_GATE } from '@shared/lobby'

import { PALETTE } from '../palette'
import { MeshBuilder } from '../render/meshBuilder'
import { PATTERN } from '../render/worldMaterial'

/**
 * Pier Zero's look (the colliders are shared/lobby.js): an asphalt boulevard from the
 * spawn to the Start arch with glowing chevrons, car parks with painted bays either
 * side (the parked cars are Lobby.jsx), the Dockside Store, giant promo billboards, a wooden
 * promenade round the edge behind white railings, the "First Climb"
 * statue, a fountain, lamp posts with flags, the Car Spin pavilion with its giant
 * prize wheel, the garage, the leaderboard frames and the Start arch. One geometry.
 */

const col = (hex) => new Color(hex)
const C = {
  concrete: col(PALETTE.plaza),
  asphalt: col(PALETTE.asphalt),
  line: col('#f2f4f7'),
  planks: col('#b98d5f'),
  steel: col(PALETTE.steel),
  dark: col(PALETTE.steelDark),
  hazard: col(PALETTE.hazardYellow),
  white: col('#f4f7fb'),
  rail: col('#2e7383'),
  navy: col(PALETTE.uiNavy),
  orange: col(PALETTE.gateOrange),
  teal: col(PALETTE.uiTeal || '#18c3d6'),
  gold: col('#ffc41f'),
  goldDark: col('#e09a10'),
  stone: col('#c9ced4'),
  soil: col('#6b4f33'),
  trunk: col('#7a5a3a'),
  leaf: col('#3fae5a'),
  leafLight: col('#6ccf63'),
  water: col('#5fd0e8'),
  jet: col('#d8f6ff'),
  lamp: col('#fff1a8'),
  black: col('#24282e'),
  glass: col('#9fe3ff'),
  carPark: col('#5a5f68'),
  green: col('#3fd97a'),
  greenDark: col('#1f9e57'),
  cream: col('#f3ede2'),
  red: col('#e2453b'),
  crate: col('#c98a4b'),
}
const all = (c) => ({ top: c, side: c, end: c, bottom: c })
const T = DECK_Y
const L = LOBBY_HALF

function box(mb, min, max, colors, patterns = {}, opts = {}) {
  const ctr = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const h = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2]
  mb.box(ctr, h, [1, 0, 0], [0, 1, 0], [0, 0, 1], colors.isColor ? all(colors) : colors, patterns, opts)
}

/** Flat upward quad over [x0,x1] x [z0,z1] at height y; pattern coord runs along z (or x). */
function flat(mb, x0, z0, x1, z1, y, color, pattern = 0, alongX = false) {
  const k = (x, z) => (alongX ? x : z)
  mb.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], color, pattern, [k(x0, z0), k(x0, z1), k(x1, z1), k(x1, z0)])
}

/** Two-sided flat triangle fan disc in the plane spanned by unit vectors u, v. */
function disc(mb, c, u, v, r, n, colorAt, pattern = 0) {
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    const p = (a) => [c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r]
    const color = colorAt(i)
    mb.tri(c, p(a0), p(a1), color, pattern)
    mb.tri(c, p(a1), p(a0), color, pattern)
  }
}

function deck(mb) {
  // Slab sides and underside (the top is laid in zones below, so nothing overlaps).
  box(mb, [-L, T - 1.2, -L], [L, T, L], { top: C.concrete, side: C.steel, end: C.steel, bottom: C.dark }, {}, { skip: ['top'] })
  const B = 8 // boulevard half width
  const P = L - 5 // promenade inner edge
  flat(mb, -B, -L, B, L, T, C.asphalt, PATTERN.ASPHALT)
  // Car parks either side (a lighter asphalt), wooden promenade round the edge.
  flat(mb, -P, -P, -B, P, T, C.carPark, PATTERN.ASPHALT)
  flat(mb, B, -P, P, P, T, C.carPark, PATTERN.ASPHALT)
  flat(mb, -L, -P, -P, P, T, C.planks, PATTERN.PLANKS, true)
  flat(mb, P, -P, L, P, T, C.planks, PATTERN.PLANKS, true)
  flat(mb, -L, P, -B, L, T, C.planks, PATTERN.PLANKS)
  flat(mb, B, P, L, L, T, C.planks, PATTERN.PLANKS)
  flat(mb, -L, -L, -B, -P, T, C.planks, PATTERN.PLANKS)
  flat(mb, B, -L, L, -P, T, C.planks, PATTERN.PLANKS)
  // Road markings: edge lines, dashed centre line, a chequered start line, chevrons.
  const y = T + 0.03
  flat(mb, -B + 0.4, -L, -B + 0.7, L - 0.5, y, C.line)
  flat(mb, B - 0.7, -L, B - 0.4, L - 0.5, y, C.line)
  flat(mb, -0.15, -34, 0.15, 14, y, C.line, PATTERN.DASH)
  flat(mb, -B + 0.7, -37.4, B - 0.7, -35.8, y, C.black, PATTERN.STRIPES, true)
  flat(mb, -B + 0.7, -35.8, B - 0.7, -35, y, C.line)
  // Two narrow lanes of scrolling chevrons leading into the Start arch.
  for (const [x0, x1] of [
    [-3.4, -2.2],
    [2.2, 3.4],
  ]) {
    flat(mb, x0, -32, x1, -8, y, C.orange, PATTERN.CHEVRON)
  }
  // Drive-in pads: a glowing bay with a white border.
  for (const pad of PADS) {
    const c = col(pad.color)
    const x0 = pad.x - pad.w / 2
    const x1 = pad.x + pad.w / 2
    const z0 = pad.z - pad.d / 2
    const z1 = pad.z + pad.d / 2
    box(mb, [x0 - 0.5, T, z0 - 0.5], [x1 + 0.5, T + 0.06, z1 + 0.5], C.white, {}, { skip: ['bottom'] })
    box(mb, [x0, T + 0.06, z0], [x1, T + 0.08, z1], c, all(PATTERN.GLOW), { skip: ['bottom'] })
  }
  parkingBays(mb, y)
}

/**
 * White bay lines (shared/lobby.js BAY_ROWS): a back line and a separator between every
 * bay. Separators stop at the back line so no two markings overlap.
 */
function parkingBays(mb, y) {
  const t = 0.14
  const rect = (ax, az, bx, bz) => flat(mb, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), y, C.line)
  for (const row of BAY_ROWS) {
    const [sx, sz] = row.start
    const [ux, uz] = row.u
    const [vx, vz] = row.v
    const len = row.n * BAY.w
    // Back line: across the whole row, t thick, just inside the bays' back edge.
    const bx = sx + vx * BAY.d
    const bz = sz + vz * BAY.d
    rect(bx - ux * t * 0.5, bz - uz * t * 0.5, bx + ux * (len + t * 0.5) - vx * t, bz + uz * (len + t * 0.5) - vz * t)
    for (let i = 0; i <= row.n; i += 1) {
      const px = sx + ux * BAY.w * i
      const pz = sz + uz * BAY.w * i
      rect(px - ux * t * 0.5, pz - uz * t * 0.5, px + ux * t * 0.5 + vx * (BAY.d - t), pz + uz * t * 0.5 + vz * (BAY.d - t))
    }
  }
}

/**
 * The Dockside Store: a mini-mart whose glass front faces its pad (east), under a
 * green-and-white striped awning, with a cooler and crates out front.
 */
function store(mb, p) {
  const x0 = p.x - p.hx
  const x1 = p.x + p.hx
  const z0 = p.z - p.hz
  const z1 = p.z + p.hz
  const top = T + p.h
  box(mb, [x0, T, z0], [x1, T + 0.15, z1], { top: col('#d9d4ca'), side: C.dark, end: C.dark }, { top: PATTERN.TILES }, { skip: ['bottom'] })
  const F = T + 0.15
  // Back and end walls.
  box(mb, [x0, F, z0], [x0 + 0.4, top, z1], C.cream, {}, { skip: ['bottom'] })
  box(mb, [x0 + 0.4, F, z0], [x1 - 0.4, top, z0 + 0.4], C.cream, { end: PATTERN.FACADE }, { skip: ['bottom'] })
  box(mb, [x0 + 0.4, F, z1 - 0.4], [x1 - 0.4, top, z1], C.cream, { end: PATTERN.FACADE }, { skip: ['bottom'] })
  // Glass front with a doorway in the middle and green posts.
  box(mb, [x1 - 0.3, F, z0 + 0.4], [x1 - 0.2, top - 0.95, p.z - 1.8], C.glass, { side: PATTERN.GLASS }, { skip: ['bottom'] })
  box(mb, [x1 - 0.3, F, p.z + 1.8], [x1 - 0.2, top - 0.95, z1 - 0.4], C.glass, { side: PATTERN.GLASS }, { skip: ['bottom'] })
  box(mb, [x1 - 0.5, F, p.z - 1.6], [x1 - 0.4, top - 1.6, p.z + 1.6], col('#2b5a6a'), { side: PATTERN.GLASS }, { skip: ['bottom'] })
  // Corner posts finish the end walls; the door posts stop under the header.
  box(mb, [x1 - 0.4, F, z0], [x1, top, z0 + 0.4], C.greenDark, {}, { skip: ['bottom'] })
  box(mb, [x1 - 0.4, F, z1 - 0.4], [x1, top, z1], C.greenDark, {}, { skip: ['bottom'] })
  for (const z of [p.z - 1.6, p.z + 1.6]) box(mb, [x1 - 0.4, F, z - 0.2], [x1, top - 0.9, z + 0.2], C.greenDark, {}, { skip: ['bottom'] })
  box(mb, [x1 - 0.4, top - 0.9, z0 + 0.4], [x1, top, z1 - 0.4], C.greenDark, {}, { skip: ['bottom'] })
  // Roof, then the awning sloping down over the forecourt.
  box(mb, [x0 - 0.2, top, z0 - 0.2], [x1 + 0.2, top + 0.4, z1 + 0.2], { top: C.dark, side: C.white, end: C.white, bottom: C.white })
  const a = 0.32
  const up = [Math.sin(a), Math.cos(a), 0]
  const out = [Math.cos(a), -Math.sin(a), 0]
  const reach = 2.6
  const ac = [x1 + out[0] * reach * 0.5, top - 0.6 + out[1] * reach * 0.5, p.z]
  mb.box(ac, [reach / 2, 0.08, p.hz + 0.2], out, up, [0, 0, 1], { top: C.green, side: C.white, end: C.green, bottom: C.white }, { top: PATTERN.STRIPES, end: PATTERN.STRIPES }, { along: [0, 0, 1] })
  // A tall sign board on the roof (the lettering is a sign in Lobby.jsx).
  for (const z of [p.z - 3.4, p.z + 3.4]) box(mb, [x1 - 1.4, top + 0.4, z - 0.12], [x1 - 1.16, top + 1.2, z + 0.12], C.dark)
  box(mb, [x1 - 1.5, top + 1.2, p.z - 4.1], [x1 - 1.3, top + 3.2, p.z + 4.1], C.green)
}

/** The store's forecourt props (solid, see shared/lobby.js PROPS). */
function cooler(mb, p) {
  box(mb, [p.x - p.hx, T, p.z - p.hz], [p.x + p.hx, T + p.h, p.z + p.hz], { top: C.white, side: C.white, end: C.white }, {}, { skip: ['bottom'] })
  box(mb, [p.x + p.hx, T + 0.2, p.z - p.hz + 0.15], [p.x + p.hx + 0.02, T + p.h - 0.2, p.z + p.hz - 0.15], col('#5fe3ff'), all(PATTERN.GLOW), { skip: ['bottom'] })
}

function crates(mb, p) {
  const z0 = p.z - p.hz
  const z1 = p.z + p.hz
  const zm = p.z
  const lo = { top: C.crate, side: C.crate, end: C.crate }
  const pat = { side: PATTERN.PLANKS, end: PATTERN.PLANKS }
  box(mb, [p.x - p.hx, T, z0], [p.x + p.hx, T + 0.9, zm - 0.05], lo, pat, { skip: ['bottom'] })
  box(mb, [p.x - p.hx, T, zm + 0.05], [p.x + p.hx, T + 0.9, z1], lo, pat, { skip: ['bottom'] })
  box(mb, [p.x - p.hx + 0.05, T + 0.9, z0 + 0.2], [p.x + p.hx - 0.05, T + p.h, zm - 0.1], C.red, {}, { skip: ['bottom'] })
}

/** The giant promo billboards: poles, a navy frame, a catwalk and two lamps on top. */
function promoFrames(mb) {
  for (const b of PROMO_BOARDS) {
    const f = [b.face[0], 0, b.face[1]]
    const r = [b.face[1], 0, -b.face[0]]
    const cy = T + b.bottom + b.height / 2
    for (const [px, pz] of promoPoles(b)) mb.prism(px, pz, T, T + b.bottom + b.height - 0.5, 0.3, 8, C.dark, C.dark)
    // Frame behind the art (its front face sits 3 cm behind the art's plane).
    const fc = [b.x - f[0] * 0.33, cy, b.z - f[2] * 0.33]
    mb.box(fc, [b.width / 2 + 0.35, b.height / 2 + 0.35, 0.3], r, [0, 1, 0], f, { top: C.gold, side: C.navy, end: C.navy, bottom: C.navy })
    // Catwalk under the board, and lamps on arms above it.
    const wc = [b.x + f[0] * 0.3, T + b.bottom - 0.55, b.z + f[2] * 0.3]
    mb.box(wc, [b.width / 2, 0.06, 0.6], r, [0, 1, 0], f, all(col('#8b929b')), { top: PATTERN.GRATE, bottom: PATTERN.GRATE })
    for (const s of [-1, 1]) {
      const lx = b.x + r[0] * b.width * 0.28 * s
      const lz = b.z + r[2] * b.width * 0.28 * s
      const ly = T + b.bottom + b.height + 0.35
      mb.box([lx + f[0] * 0.5, ly + 0.2, lz + f[2] * 0.5], [0.08, 0.08, 0.7], r, [0, 1, 0], f, all(C.dark))
      mb.box([lx + f[0] * 1.15, ly + 0.05, lz + f[2] * 1.15], [0.5, 0.14, 0.22], r, [0, 1, 0], f, all(C.lamp), all(PATTERN.GLOW))
    }
  }
}

function railings(mb) {
  for (const b of lobbyBoxes()) {
    if (b.kind !== 'rail') continue
    const [cx, , cz] = b.c
    const [hx, , hz] = b.h
    // Hazard kerb along the collider's footprint, white posts and a teal top rail.
    box(mb, [cx - hx, T, cz - hz], [cx + hx, T + 0.35, cz + hz], { top: C.hazard, side: C.hazard, end: C.hazard }, { side: PATTERN.HAZARD, end: PATTERN.HAZARD, top: PATTERN.HAZARD }, { skip: ['bottom'], along: hx > hz ? [1, 0, 0] : [0, 0, 1] })
    const alongX = hx > hz
    const len = alongX ? hx : hz
    for (let a = -len + 0.4; a <= len - 0.3; a += 3) {
      const px = alongX ? cx + a : cx
      const pz = alongX ? cz : cz + a
      box(mb, [px - 0.09, T + 0.35, pz - 0.09], [px + 0.09, T + 1.25, pz + 0.09], C.white)
    }
    const tx = alongX ? hx : 0.12
    const tz = alongX ? 0.12 : hz
    box(mb, [cx - tx, T + 1.2, cz - tz], [cx + tx, T + 1.34, cz + tz], C.rail)
    box(mb, [cx - tx * (alongX ? 1 : 0.6), T + 0.78, cz - tz * (alongX ? 0.6 : 1)], [cx + tx * (alongX ? 1 : 0.6), T + 0.86, cz + tz * (alongX ? 0.6 : 1)], C.rail)
  }
  // Piles down into the water.
  for (let x = -L + 4; x <= L - 4; x += 12) {
    for (let z = -L + 4; z <= L - 4; z += 12) mb.prism(x, z, -2, T - 1.2, 0.8, 8, C.dark, C.dark)
  }
}

/** "The First Climb": a golden car charging up a ramp, on a round pedestal. */
function statue(mb, p) {
  mb.prism(p.x, p.z, T, T + p.h, 3.2, 12, C.navy, C.navy)
  mb.prism(p.x, p.z, T + p.h - 0.2, T + p.h + 0.04, 3.35, 12, C.gold, C.gold)
  // The ramp rises northwards at 28 degrees from the pedestal.
  const a = (28 * Math.PI) / 180
  const up = [0, Math.cos(a), -Math.sin(a)]
  const fwd = [0, Math.sin(a), -Math.cos(a)]
  const base = [p.x, T + p.h + 0.04, p.z + 2.2]
  const len = 6.2
  const mid = [base[0], base[1] + fwd[1] * len * 0.5 + up[1] * 0.3, base[2] + fwd[2] * len * 0.5 + up[2] * 0.3]
  mb.box(mid, [1.6, 0.3, len / 2], [1, 0, 0], up, fwd, { top: C.gold, side: C.goldDark, end: C.goldDark, bottom: C.goldDark }, { top: PATTERN.STRIPES }, { along: fwd })
  // A support under the high end.
  const tip = [base[0], base[1] + fwd[1] * len, base[2] + fwd[2] * len]
  mb.prism(tip[0], tip[2] + 0.6, T + p.h, tip[1] - 0.2, 0.45, 8, C.goldDark, C.goldDark)
  // The car, two thirds of the way up, at the ramp's angle.
  const at = (k, u = 0) => [base[0], base[1] + fwd[1] * k + up[1] * u, base[2] + fwd[2] * k + up[2] * u]
  const carC = at(len * 0.6, 1.05)
  mb.box(carC, [1.05, 0.5, 1.9], [1, 0, 0], up, fwd, all(C.gold))
  mb.box(at(len * 0.55, 1.85), [0.85, 0.35, 0.95], [1, 0, 0], up, fwd, all(C.goldDark))
  mb.box(at(len * 0.6 + 1.95, 1.0), [0.7, 0.2, 0.1], [1, 0, 0], up, fwd, all(col('#fff3a0')))
  for (const sx of [-1, 1]) {
    for (const k of [len * 0.6 - 1.2, len * 0.6 + 1.2]) {
      const w = at(k, 0.75)
      mb.box([w[0] + sx * 1.1, w[1], w[2]], [0.25, 0.45, 0.45], [1, 0, 0], up, fwd, all(C.black))
    }
  }
}

function fountain(mb, p) {
  mb.prism(p.x, p.z, T, T + p.h, 4.2, 14, C.stone, C.stone)
  mb.prism(p.x, p.z, T + p.h - 0.05, T + p.h + 0.02, 3.8, 14, C.water, C.water, PATTERN.GLOW)
  mb.prism(p.x, p.z, T + p.h, T + p.h + 1.6, 0.9, 10, C.stone, C.stone)
  mb.prism(p.x, p.z, T + p.h + 1.6, T + p.h + 1.8, 2, 12, C.stone, C.water)
  mb.prism(p.x, p.z, T + p.h + 1.8, T + p.h + 2.8, 0.4, 8, C.stone, C.stone)
  // Jets (the pulse pattern ripples up them like running water).
  mb.prism(p.x, p.z, T + p.h + 2.8, T + p.h + 5.6, 0.22, 6, C.jet, C.jet, PATTERN.PULSE)
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2
    mb.prism(p.x + Math.cos(a) * 2.8, p.z + Math.sin(a) * 2.8, T + p.h, T + p.h + 1.8, 0.12, 5, C.jet, C.jet, PATTERN.PULSE)
  }
}

function lampPost(mb, p, k) {
  mb.prism(p.x, p.z, T, T + 6.4, 0.16, 6, C.navy)
  const inward = -Math.sign(p.x)
  for (const s of [-1, 1]) {
    const hz = p.z + s * 0.9
    box(mb, [p.x - 0.07, T + 6.1, Math.min(p.z, hz)], [p.x + 0.07, T + 6.24, Math.max(p.z, hz)], C.navy)
    box(mb, [p.x - 0.35, T + 5.75, hz - 0.35], [p.x + 0.35, T + 6.1, hz + 0.35], C.lamp, all(PATTERN.GLOW))
  }
  // A flag hanging off the post towards the deck.
  const fc = k % 2 ? C.orange : C.teal
  const x0 = p.x + inward * 0.18
  const x1 = p.x + inward * 1.4
  for (const [a, b, c] of [
    [
      [x0, T + 5.4, p.z],
      [x1, T + 5.4, p.z],
      [x1, T + 3.2, p.z],
    ],
    [
      [x0, T + 5.4, p.z],
      [x1, T + 3.2, p.z],
      [x0, T + 3.2, p.z],
    ],
  ]) {
    mb.tri(a, b, c, fc)
    mb.tri(a, c, b, fc)
  }
}

/** Car Spin pavilion: a round kiosk with a giant prize wheel on its roof. */
function spinKiosk(mb, p) {
  mb.prism(p.x, p.z, T, T + 3.4, 2.9, 12, C.white, C.white)
  mb.prism(p.x, p.z, T + 1.2, T + 2.8, 2.95, 12, C.glass, C.glass, PATTERN.GLASS)
  mb.prism(p.x, p.z, T + 3.4, T + 3.9, 3.6, 12, C.teal, C.teal)
  mb.prism(p.x, p.z, T + 3.9, T + 5.2, 0.35, 6, C.navy)
  // The wheel faces south-east, towards the spawn.
  const c = [p.x, T + 8.6, p.z]
  const n = [Math.SQRT1_2, 0, Math.SQRT1_2]
  const u = [0, 1, 0]
  const v = [n[2], 0, -n[0]]
  const colors = [C.gold, col('#ff4a3d'), C.teal, col('#7cf25a'), C.orange, col('#8a5cf6')]
  disc(mb, c, u, v, 3.4, 12, (i) => colors[i % colors.length])
  // Rim of bulbs, hub and pointer.
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2
    const bx = c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * 3.55 + n[0] * 0.05
    const by = c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * 3.55
    const bz = c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * 3.55 + n[2] * 0.05
    box(mb, [bx - 0.2, by - 0.2, bz - 0.2], [bx + 0.2, by + 0.2, bz + 0.2], C.lamp, all(PATTERN.PULSE))
  }
  mb.box([c[0] + n[0] * 0.15, c[1], c[2] + n[2] * 0.15], [0.55, 0.55, 0.12], v, u, n, all(C.white))
  mb.box([c[0] + n[0] * 0.15, c[1] + 3.9, c[2] + n[2] * 0.15], [0.35, 0.6, 0.12], v, u, n, all(col('#e2453b')))
}

/**
 * The garage showroom. Opaque back (east) and north walls; the west side (facing its
 * pad) and the south side (facing the spawn) are floor-to-ceiling glass in a navy frame
 * (the panes themselves are buildGarageGlass, a separate see-through mesh), so you can
 * see in: polished floor, two turntables with display cars (Lobby.jsx), a tool wall,
 * a tyre rack, a car lift, a service desk and strip lights under a big canopy roof.
 */
export const SHOWROOM = (() => {
  const g = PROPS.find((p) => p.kind === 'garage')
  return {
    ...g,
    roofY: T + g.h,
    // Turntables (and the display cars on them): x, z, car id.
    turntables: [
      { x: g.x - 0.9, z: g.z - 6.2, car: 'seajet' },
      { x: g.x - 0.9, z: g.z + 4.2, car: 'lighthouse' },
    ],
  }
})()

function garage(mb) {
  const g = SHOWROOM
  const x0 = g.x - g.hx
  const x1 = g.x + g.hx
  const z0 = g.z - g.hz
  const z1 = g.z + g.hz
  const top = g.roofY
  const wall = col('#2f6fe0')
  const frame = C.navy
  // Floor: dark polished tiles, a step up from the deck.
  box(mb, [x0, T, z0], [x1, T + 0.15, z1], { top: col('#3a4250'), side: frame, end: frame }, { top: PATTERN.TILES }, { skip: ['bottom'] })
  const F = T + 0.15
  // Back (east) and north walls, solid; their inner faces are light grey.
  box(mb, [x1 - 0.4, F, z0], [x1, top, z1], { top: wall, side: wall, end: wall }, { side: PATTERN.FACADE }, { skip: ['bottom'] })
  box(mb, [x1 - 0.42, F, z0 + 0.4], [x1 - 0.4, top - 0.4, z1 - 0.4], col('#e4e8ee'), {}, { skip: ['bottom'] })
  box(mb, [x0, F, z0], [x1 - 0.4, top, z0 + 0.4], { top: wall, side: wall, end: wall }, { end: PATTERN.FACADE }, { skip: ['bottom'] })
  // Glass frame: corner posts, mullions every ~3 m, a transom and a sill.
  const post = (px, pz) => box(mb, [px - 0.18, F, pz - 0.18], [px + 0.18, top, pz + 0.18], frame)
  post(x0 + 0.18, z1 - 0.18)
  for (let z = z0 + 0.4 + 3; z < z1 - 1; z += 3) if (Math.abs(z - g.z) > 2.2) post(x0 + 0.18, z)
  for (let x = x0 + 3; x < x1 - 1; x += 3) post(x, z1 - 0.18)
  box(mb, [x0, top - 1.3, z0 + 0.4], [x0 + 0.36, top - 1.1, z1], frame)
  box(mb, [x0 + 0.36, top - 1.3, z1 - 0.36], [x1 - 0.4, top - 1.1, z1], frame)
  box(mb, [x0, F, z0 + 0.4], [x0 + 0.36, F + 0.3, g.z - 2.2], frame)
  box(mb, [x0, F, g.z + 2.2], [x0 + 0.36, F + 0.3, z1], frame)
  box(mb, [x0 + 0.36, F, z1 - 0.36], [x1 - 0.4, F + 0.3, z1], frame)
  // Roof slab with a canopy over the glass and an orange fascia (the signs go on it).
  box(mb, [x0 - 1.6, top, z0 - 0.4], [x1 + 0.3, top + 0.5, z1 + 1.6], { top: C.dark, side: C.white, end: C.white, bottom: C.white })
  box(mb, [x0 - 1.8, top + 0.5, z0 - 0.4], [x0 - 1.6, top + 2.3, z1 + 1.6], C.orange, {}, { skip: ['bottom'] })
  box(mb, [x0 - 1.6, top + 0.5, z1 + 1.6], [x1 + 0.3, top + 2.3, z1 + 1.8], C.orange, {}, { skip: ['bottom'] })
  // Ceiling light strips.
  for (let z = z0 + 2.5; z < z1 - 1; z += 4.5) box(mb, [x0 + 1.2, top - 0.2, z - 0.15], [x1 - 1.2, top - 0.05, z + 0.15], col('#f4fbff'), all(PATTERN.GLOW))
  // Turntables: a dark disc with a glowing rim.
  for (const t of g.turntables) {
    mb.prism(t.x, t.z, F, F + 0.18, 3, 16, col('#2b3038'), col('#2b3038'))
    mb.prism(t.x, t.z, F, F + 0.14, 3.15, 16, C.teal, C.teal, PATTERN.PULSE)
  }
  // Tool wall: red cabinets, a pegboard, a tyre rack.
  const bw = x1 - 0.42
  box(mb, [bw - 0.7, F, g.z - 11], [bw, F + 1.1, g.z - 4.5], col('#e2453b'))
  box(mb, [bw - 0.72, F + 1.1, g.z - 11], [bw, F + 1.18, g.z - 4.5], col('#c9ced4'))
  box(mb, [bw - 0.05, F + 1.6, g.z - 11], [bw, F + 3.6, g.z - 4.5], col('#8b929b'), { side: PATTERN.GRATE, end: PATTERN.GRATE })
  for (let k = 0; k < 4; k += 1) {
    for (let j = 0; j < 2; j += 1) mb.prism(bw - 0.6, g.z + 7 + k * 1.1, F + j * 0.5, F + j * 0.5 + 0.45, 0.5, 8, C.black)
  }
  // Car lift by the north wall: two yellow posts and arms.
  for (const s of [-1, 1]) box(mb, [g.x + s * 2.6 - 0.25, F, z0 + 1.8], [g.x + s * 2.6 + 0.25, top - 1.6, z0 + 2.3], C.hazard, { side: PATTERN.HAZARD, end: PATTERN.HAZARD }, { along: [0, 1, 0] })
  box(mb, [g.x - 2.6, F + 1.6, z0 + 1.9], [g.x + 2.6, F + 1.75, z0 + 2.2], C.dark)
  // Service desk with a glowing screen.
  box(mb, [x1 - 3.6, F, g.z + 7.5], [x1 - 2, F + 1.1, g.z + 10.5], C.white)
  box(mb, [x1 - 3.0, F + 1.1, g.z + 8.5], [x1 - 2.9, F + 1.8, g.z + 9.5], col('#5fe3ff'), all(PATTERN.GLOW))
}

/** The showroom's glass panes (west and south sides), for a see-through material. */
export function buildGarageGlass() {
  const mb = new MeshBuilder()
  const g = SHOWROOM
  const x0 = g.x - g.hx
  const x1 = g.x + g.hx
  const z0 = g.z - g.hz
  const z1 = g.z + g.hz
  const F = T + 0.35
  const top = g.roofY - 1.2
  const pane = col('#cfefff')
  // West: two panes either side of the sliding doors, and the (closed) doors.
  box(mb, [x0 + 0.14, F, z0 + 0.42], [x0 + 0.2, top, g.z - 2.22], pane)
  box(mb, [x0 + 0.14, F, g.z + 2.22], [x0 + 0.2, top, z1 - 0.38], pane)
  box(mb, [x0 + 0.08, F - 0.3, g.z - 2.18], [x0 + 0.12, top, g.z + 2.18], pane)
  // South.
  box(mb, [x0 + 0.42, F, z1 - 0.2], [x1 - 0.46, top, z1 - 0.14], pane)
  // Clerestory strip above the transoms.
  box(mb, [x0 + 0.14, top + 0.3, z0 + 0.42], [x0 + 0.2, g.roofY - 0.03, z1 - 0.38], pane)
  box(mb, [x0 + 0.42, top + 0.3, z1 - 0.2], [x1 - 0.46, g.roofY - 0.03, z1 - 0.14], pane)
  return mb.build()
}

function startArch(mb) {
  const g = START_GATE
  const half = g.width / 2 + 1.2
  for (const s of [-1, 1]) {
    const x = g.x + s * half
    box(mb, [x - 1, T, g.z - 1], [x + 1, T + 10, g.z + 1], { top: C.hazard, side: C.hazard, end: C.hazard }, { side: PATTERN.HAZARD, end: PATTERN.HAZARD }, { along: [0, 1, 0] })
    box(mb, [x - 0.4 * s - 0.12, T + 0.6, g.z + 1], [x - 0.4 * s + 0.12, T + 9.4, g.z + 1.08], col('#ffd84a'), all(PATTERN.PULSE))
    box(mb, [x - 1.25, T, g.z - 1.25], [x + 1.25, T + 0.6, g.z + 1.25], C.navy, {}, { skip: ['bottom'] })
  }
  box(mb, [g.x - half - 1.4, T + 10, g.z - 1.2], [g.x + half + 1.4, T + 12.8, g.z + 1.2], C.orange, {}, {})
  box(mb, [g.x - half - 1.4, T + 12.8, g.z - 1.2], [g.x + half + 1.4, T + 13.4, g.z + 1.2], C.black, { side: PATTERN.STRIPES, end: PATTERN.STRIPES, top: PATTERN.STRIPES }, { along: [1, 0, 0] })
  // A row of bulbs under the beam.
  for (let x = g.x - half + 0.6; x <= g.x + half - 0.6; x += 1.3) box(mb, [x - 0.18, T + 9.6, g.z + 0.9], [x + 0.18, T + 9.95, g.z + 1.25], C.lamp, all(PATTERN.PULSE))
}

/**
 * The map portal's gate (shared/lobby.js PORTALS): a grand arch - two tall navy pylons on
 * stepped plinths with glowing teal edges and gold caps, a deep double lintel with a gold
 * band, a sign board over it (the lettering is Lobby.jsx's sign atlas) between two beacons -
 * and a white frame round the pad. The swirl in the opening and the pad's glow are
 * Lobby.jsx's portal mesh (they change with the map you're on).
 */
export const PORTAL_SIGN_Y = T + PORTAL.height + 2.35
/** Half width (along x) of a portal's glowing pad, inside its frame and clear of the posts. */
export const PORTAL_PAD_HALF = PORTAL.d / 2 - 0.75
/** The portal's sign board (along x, and its height). */
export const PORTAL_SIGN = { width: 9.2, height: 2.1 }
function portalArches(mb) {
  const { w, d, post, height } = PORTAL
  for (const p of PORTALS) {
    for (const s of [-1, 1]) {
      const x = p.x + s * (d / 2 + post)
      box(mb, [x - post, T + 0.9, p.z - post], [x + post, T + height, p.z + post], C.navy, {}, { skip: ['top', 'bottom'] })
      // Light strips down both of the pylon's faces (lobby side south, sea side north) and its inner edge.
      for (const f of [-1, 1]) box(mb, [x - 0.12, T + 1.2, p.z + f * post - (f < 0 ? 0.06 : 0)], [x + 0.12, T + height - 0.5, p.z + f * post + (f > 0 ? 0.06 : 0)], C.teal, all(PATTERN.PULSE), { skip: ['bottom', 'top'] })
      const xi = x - s * post
      box(mb, [Math.min(xi, xi - s * 0.06), T + 1.2, p.z - 0.12], [Math.max(xi, xi - s * 0.06), T + height - 0.5, p.z + 0.12], C.gold, all(PATTERN.GLOW), { skip: ['bottom', 'top'] })
      // Stepped plinth.
      box(mb, [x - post - 0.5, T, p.z - post - 0.5], [x + post + 0.5, T + 0.45, p.z + post + 0.5], C.dark, {}, { skip: ['bottom'] })
      box(mb, [x - post - 0.25, T + 0.45, p.z - post - 0.25], [x + post + 0.25, T + 0.9, p.z + post + 0.25], C.steel, {}, { skip: ['bottom'] })
    }
    const x0 = p.x - d / 2 - post * 2 - 0.4
    const x1 = p.x + d / 2 + post * 2 + 0.4
    box(mb, [x0, T + height, p.z - post - 0.15], [x1, T + height + 0.6, p.z + post + 0.15], C.navy)
    box(mb, [x0 - 0.05, T + height + 0.6, p.z - post - 0.2], [x1 + 0.05, T + height + 0.85, p.z + post + 0.2], C.gold, {}, { skip: ['bottom'] })
    box(mb, [x0 + 0.3, T + height + 0.85, p.z - post - 0.05], [x1 - 0.3, T + height + 1.15, p.z + post + 0.05], C.navy, {}, { skip: ['bottom'] })
    // Beacons on the lintel's ends.
    for (const s of [-1, 1]) box(mb, [p.x + s * (d / 2 + post) - 0.3, T + height + 1.15, p.z - 0.3], [p.x + s * (d / 2 + post) + 0.3, T + height + 1.75, p.z + 0.3], C.lamp, all(PATTERN.PULSE), { skip: ['bottom'] })
    // Sign board on two short stubs (the lettering is on its lobby (south) face, from the atlas).
    for (const s of [-1, 1]) box(mb, [p.x + s * 2.6 - 0.12, T + height + 1.15, p.z - 0.12], [p.x + s * 2.6 + 0.12, PORTAL_SIGN_Y - PORTAL_SIGN.height / 2, p.z + 0.12], C.dark, {}, { skip: ['bottom'] })
    box(mb, [p.x - PORTAL_SIGN.width / 2 - 0.1, PORTAL_SIGN_Y - PORTAL_SIGN.height / 2 - 0.1, p.z - 0.2], [p.x + PORTAL_SIGN.width / 2 + 0.1, PORTAL_SIGN_Y + PORTAL_SIGN.height / 2 + 0.1, p.z - 0.02], C.navy)
    // Pad frame: four white strips round the glowing pad (PORTAL_PAD_HALF), clear of
    // the posts' plinths.
    const px0 = p.x - PORTAL_PAD_HALF
    const px1 = p.x + PORTAL_PAD_HALF
    const z0 = p.z - w / 2
    const z1 = p.z + w / 2
    const k = 0.35
    box(mb, [px0 - k, T, z0 - k], [px1 + k, T + 0.06, z0], C.white, {}, { skip: ['bottom'] })
    box(mb, [px0 - k, T, z1], [px1 + k, T + 0.06, z1 + k], C.white, {}, { skip: ['bottom'] })
    box(mb, [px0 - k, T, z0], [px0, T + 0.06, z1], C.white, {}, { skip: ['bottom'] })
    box(mb, [px1, T, z0], [px1 + k, T + 0.06, z1], C.white, {}, { skip: ['bottom'] })
    // The apron pad in front (Lobby.jsx draws its glow): a white border like the Spin and Garage pads.
    const { from, to, half } = PORTAL.apron
    const ax0 = p.x - half
    const ax1 = p.x + half
    const az0 = p.z + from
    const az1 = p.z + to
    const b = 0.5
    box(mb, [ax0 - b, T, az0 - b], [ax1 + b, T + 0.06, az0], C.white, {}, { skip: ['bottom'] })
    box(mb, [ax0 - b, T, az1], [ax1 + b, T + 0.06, az1 + b], C.white, {}, { skip: ['bottom'] })
    box(mb, [ax0 - b, T, az0], [ax0, T + 0.06, az1], C.white, {}, { skip: ['bottom'] })
    box(mb, [ax1, T, az0], [ax1 + b, T + 0.06, az1], C.white, {}, { skip: ['bottom'] })
  }
}

/**
 * Police marks over the Heat Run gate (Lobby.jsx adds this for whichever portal leads
 * there): a flashing red and blue light bar on the sign board and a gold sheriff's star on a
 * navy disc above it. One small geometry.
 */
export function buildPoliceMarks(portals) {
  const mb = new MeshBuilder()
  const red = col('#ff2a3a')
  const blue = col('#2f6bff')
  const navy = C.navy
  const topY = PORTAL_SIGN_Y + PORTAL_SIGN.height / 2 + 0.1
  const disc = (cx, cy, z, r, color, n = 28) => {
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * Math.PI * 2
      const a1 = ((i + 1) / n) * Math.PI * 2
      const A = [cx, cy, z]
      const B = [cx + Math.sin(a0) * r, cy + Math.cos(a0) * r, z]
      const D = [cx + Math.sin(a1) * r, cy + Math.cos(a1) * r, z]
      mb.tri(A, B, D, color)
      mb.tri(A, D, B, color)
    }
  }
  for (const p of portals) {
    // The bar: a dark base, the red half and the blue half, a post up to the badge.
    box(mb, [p.x - 2.9, topY, p.z - 0.4], [p.x + 2.9, topY + 0.25, p.z + 0.4], C.dark, {}, { skip: ['bottom'] })
    box(mb, [p.x - 2.7, topY + 0.25, p.z - 0.3], [p.x - 0.08, topY + 0.85, p.z + 0.3], red, all(PATTERN.PULSE), { skip: ['bottom'] })
    box(mb, [p.x + 0.08, topY + 0.25, p.z - 0.3], [p.x + 2.7, topY + 0.85, p.z + 0.3], blue, all(PATTERN.PULSE), { skip: ['bottom'] })
    box(mb, [p.x - 0.18, topY + 0.85, p.z - 0.18], [p.x + 0.18, topY + 1.9, p.z + 0.18], C.dark, {}, { skip: ['bottom'] })
    // The badge: a gold rim, a navy disc, a gold five-point star, facing the lobby.
    const cy = topY + 1.9 + 1.7
    const z = p.z + 0.2
    disc(p.x, cy, z - 0.05, 1.75, C.gold)
    disc(p.x, cy, z, 1.52, navy)
    const pts = []
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2
      const r = i % 2 ? 0.58 : 1.3
      pts.push([p.x + Math.sin(a) * r, cy + Math.cos(a) * r, z + 0.05])
    }
    for (let i = 0; i < 10; i += 1) {
      const A = [p.x, cy, z + 0.05]
      mb.tri(A, pts[i], pts[(i + 1) % 10], C.gold, PATTERN.GLOW)
      mb.tri(A, pts[(i + 1) % 10], pts[i], C.gold, PATTERN.GLOW)
    }
    disc(p.x, cy, z + 0.1, 0.22, C.white)
  }
  return mb.build()
}

function boardFrames(mb) {
  for (const b of BOARDS) {
    for (const s of [-1, 1]) mb.prism(b.x + s * 6, b.z + 0.55, T, T + 4, 0.25, 6, C.dark)
    box(mb, [b.x - 7, T + 3.6, b.z + 0.3], [b.x + 7, T + 12.6, b.z + 0.8], C.navy)
    box(mb, [b.x - 7.2, T + 12.6, b.z + 0.2], [b.x + 7.2, T + 13.1, b.z + 0.9], C.gold)
    for (const s of [-1, 1]) box(mb, [b.x + s * 4.5 - 0.3, T + 13.1, b.z + 0.35], [b.x + s * 4.5 + 0.3, T + 13.5, b.z + 0.75], C.lamp, all(PATTERN.GLOW))
  }
}

/** Corner flagpoles. */
function flags(mb) {
  const corners = [
    [-38.2, 38.2, C.orange],
    [38.2, 38.2, C.teal],
    [-38.2, -38.2, C.teal],
    [38.2, -38.2, C.orange],
  ]
  for (const [x, z, fc] of corners) {
    mb.prism(x, z, T, T + 13, 0.14, 6, C.white)
    box(mb, [x - 0.25, T + 13, z - 0.25], [x + 0.25, T + 13.4, z + 0.25], C.gold)
    const a = [x, T + 12.6, z]
    const b = [x + 3, T + 12.2, z + 0.4]
    const c = [x + 3, T + 9.6, z + 0.4]
    const d = [x, T + 10, z]
    for (const [p, q, r] of [
      [a, b, c],
      [a, c, d],
    ]) {
      mb.tri(p, q, r, fc)
      mb.tri(p, r, q, fc)
    }
  }
}

/** The whole pier as one geometry. `detail` adds the lamp flags and garage clutter. */
export function buildPier() {
  const mb = new MeshBuilder()
  deck(mb)
  railings(mb)
  let k = 0
  for (const p of PROPS) {
    if (p.kind === 'statue') statue(mb, p)
    else if (p.kind === 'fountain') fountain(mb, p)
    else if (p.kind === 'lamp') lampPost(mb, p, k++)
    else if (p.kind === 'spinKiosk') spinKiosk(mb, p)
    else if (p.kind === 'garage') garage(mb)
    else if (p.kind === 'store') store(mb, p)
    else if (p.kind === 'cooler') cooler(mb, p)
    else if (p.kind === 'crates') crates(mb, p)
  }
  startArch(mb)
  portalArches(mb)
  boardFrames(mb)
  promoFrames(mb)
  flags(mb)
  return { geometry: mb.build(), triangles: mb.triangles }
}
