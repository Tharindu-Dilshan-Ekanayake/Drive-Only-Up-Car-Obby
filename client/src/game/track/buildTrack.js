import { Color } from 'three'

import { EXIT_PORTAL } from '@shared/chapters'
import { forwardOf, PIT, rightOf, TUBE, tubeFacets, tubePoint } from '@shared/track'

import { PALETTE } from '../palette'
import { MeshBuilder } from '../render/meshBuilder'
import { PATTERN } from '../render/worldMaterial'
import { takePrebuilt } from '../prep/prebuilt'

/**
 * Stage geometry: one merged mesh per section (so off-screen sections are culled
 * whole), drawn with the shared world material. Built once when the stage chunk
 * loads; ~25k triangles for the whole of Stage 1, of which only a few sections are
 * ever on screen.
 */

const C = {
  asphalt: new Color(PALETTE.asphalt),
  line: new Color(PALETTE.asphaltLine),
  steel: new Color(PALETTE.steel),
  steelDark: new Color(PALETTE.steelDark),
  hazard: new Color(PALETTE.hazardYellow),
  /** Road kerbs: pink, striped with white (PATTERN.STRIPES). */
  kerb: new Color(PALETTE.kerb),
  /** The left kerb: the kerb colour unless a map's theme gives it its own (`kerbLeft`). */
  kerbLeft: new Color(PALETTE.kerb),
  plaza: new Color(PALETTE.plaza),
  gate: new Color(PALETTE.gateOrange),
  white: new Color('#ffffff'),
  glowYellow: new Color('#fff1a8'),
  boost: new Color(PALETTE.boost),
  bounce: new Color(PALETTE.bounce),
  oil: new Color(PALETTE.oil),
  safe: new Color('#19a974'),
  lampPost: new Color('#14234f'),
  pitWall: new Color('#2f6fe0'),
  pitFloor: new Color('#3a4250'),
  pitGlass: new Color('#7fc8e8'),
  pitRoof: new Color('#4b5058'),
  pitPillar: new Color('#14234f'),
  pitPanel: new Color('#5fe3ff'),
  ceiling: new Color('#f4fbff'),
  steelLight: new Color('#c9ced4'),
  toolRed: new Color('#e2453b'),
  pegboard: new Color('#8b929b'),
  tyre: new Color('#1c1e22'),
  spinPad: new Color(PALETTE.hazardYellow),
  signPost: new Color('#5b6470'),
  finish: new Color('#ffffff'),
  wind: new Color('#5fe3ff'),
  belt: new Color('#6b7480'),
  loopCyan: new Color('#5fe3ff'),
  loopAmber: new Color('#ffb020'),
  tubeA: new Color('#7d97ab'),
  tubeB: new Color('#6c879b'),
  tubeStrip: new Color('#5fe3ff'),
  tubeRib: new Color('#1f2a36'),
  pane: new Color('#bfe8ff'),
  float: new Color('#1f3570'),
  bowlFloor: new Color('#8c97a3'),
  bowlA: new Color('#3f7fc4'),
  bowlB: new Color('#3672b3'),
  bowlDeck: new Color('#7d8a96'),
  bowlRing: new Color('#ff7a1a'),
  spinFloor: new Color('#58626e'),
  girder: new Color(PALETTE.gateOrange),
  // The exit portal (the lobby portal's colours, whatever the map's road palette).
  portalNavy: new Color(PALETTE.uiNavy),
  portalTeal: new Color(PALETTE.uiTeal || '#18c3d6'),
  portalGold: new Color('#ffc41f'),
  portalDark: new Color(PALETTE.steelDark),
  portalSteel: new Color(PALETTE.steel),
}

const ROAD_COLORS = { top: C.asphalt, side: C.steel, bottom: C.steelDark, end: C.steel }
/** How the road kerbs are drawn (applyTrackPalette: a map's theme may make them light strips). */
const KERB = { pattern: PATTERN.STRIPES }
const CURB_COLORS = { top: C.hazard, side: C.hazard, bottom: C.steelDark, end: C.hazard }
const CURB_PATTERNS = { top: PATTERN.HAZARD, side: PATTERN.HAZARD }
const PLAZA_COLORS = { top: C.plaza, side: C.steel, bottom: C.steelDark, end: C.steel }
const PLAZA_PATTERNS = { top: PATTERN.TILES }

const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]

const SURFACES = {
  asphalt: { top: C.asphalt, pattern: PATTERN.ASPHALT },
  grate: { top: new Color('#7d8a96'), pattern: PATTERN.GRATE },
  planks: { top: new Color('#a87a4f'), pattern: PATTERN.PLANKS },
  // The Grand Tour's Snowy Mountain: glassy ice patches (collider kind 'ice': low grip) and packed-snow kickers.
  ice: { top: new Color('#bfe3f4'), pattern: PATTERN.ICE },
  snow: { top: new Color('#eef4fa'), pattern: PATTERN.SNOW },
  // The Grand Tour's Tropical Island: loose sand bars (collider kind 'sand': a little less grip).
  sand: { top: new Color('#ead7a8'), pattern: PATTERN.SNOW },
}
const CURB_W = 0.6
const THICK = 1.2

/**
 * A road ribbon: top surface, side walls, underside, curbs and line markings as
 * continuous strips between cross-sections. Neighbouring pieces meet edge to edge and
 * nothing overlaps, so there's no z-fighting anywhere along the road. Line markings
 * sit 3 cm proud of the surface (never coplanar with it).
 */
function addRibbon(mb, rib, glass = null) {
  // Loops (`glow`) have a see-through deck: the road surface is a glass panel (into
  // `glass`, the see-through mesh) framed by the walls and light strips, with no dark
  // underside, so you can see the cars going round.
  const glassDeck = rib.glow && glass
  const surface = SURFACES[rib.style] || SURFACES.asphalt
  const cs = rib.cs
  // Point at lateral offset x (from the centre) and height y (along the cross-section's up).
  const at = (c, x, y) => [c.p[0] + c.r[0] * x + c.u[0] * y, c.p[1] + c.r[1] * x + c.u[1] * y, c.p[2] + c.r[2] * x + c.u[2] * y]
  for (let i = 0; i < cs.length - 1; i += 1) {
    const a = cs[i]
    const b = cs[i + 1]
    if (Math.abs(b.s - a.s) < 1e-3 && a.p[0] === b.p[0] && a.p[2] === b.p[2]) continue
    const ha = a.w / 2
    const hb = b.w / 2
    // Per-end offsets (tapers have different widths at each end).
    const quad = (fa0, ya0, fa1, ya1, fb0, yb0, fb1, yb1, color, pattern = 0) =>
      mb.quad(at(a, fa0, ya0), at(b, fb0, yb0), at(b, fb1, yb1), at(a, fa1, ya1), color, pattern, [a.s, b.s, b.s, a.s])
    if (glassDeck) {
      // One glass panel just under the surface (double-sided material), edge to edge.
      glass.quad(at(a, ha, -0.04), at(b, hb, -0.04), at(b, -hb, -0.04), at(a, -ha, -0.04), C.pane, 0, [a.s, b.s, b.s, a.s])
    } else {
      // Road top (left edge to right edge, facing up).
      quad(ha, 0, -ha, 0, hb, 0, -hb, 0, surface.top, surface.pattern)
      // Side walls and underside.
      quad(-ha, 0, -ha, -THICK, -hb, 0, -hb, -THICK, C.steel)
      quad(ha, -THICK, ha, 0, hb, -THICK, hb, 0, C.steel)
      quad(-ha, -THICK, ha, -THICK, -hb, -THICK, hb, -THICK, C.steelDark)
    }
    if (rib.curbs) {
      const h = rib.curbHeight
      for (const side of [-1, 1]) {
        const oa = side * ha
        const ob = side * hb
        const ia = side * (ha - CURB_W)
        const ib = side * (hb - CURB_W)
        // Top, inner face and outer face of the curb, pink-and-white striped along the road.
        if (side > 0) {
          quad(oa, h, ia, h, ob, h, ib, h, C.kerb, KERB.pattern)
          quad(ia, h, ia, 0, ib, h, ib, 0, C.kerb, KERB.pattern)
          quad(oa, 0, oa, h, ob, 0, ob, h, C.kerb, KERB.pattern)
        } else {
          quad(ia, h, oa, h, ib, h, ob, h, C.kerbLeft, KERB.pattern)
          quad(ia, 0, ia, h, ib, 0, ib, h, C.kerbLeft, KERB.pattern)
          quad(oa, h, oa, 0, ob, h, ob, 0, C.kerbLeft, KERB.pattern)
        }
      }
    }
    if (!rib.curbs) {
      // Open edges: a thin hazard lip so the drop reads clearly.
      quad(ha, 0.02, ha - 0.25, 0.02, hb, 0.02, hb - 0.25, 0.02, C.hazard, PATTERN.HAZARD)
      quad(-ha + 0.25, 0.02, -ha, 0.02, -hb + 0.25, 0.02, -hb, 0.02, C.hazard, PATTERN.HAZARD)
    }
    if (rib.glow) {
      // A loop dressed in light: strips down the inner and outer faces of both walls
      // (pulsing in a ripple that runs up the loop), a glowing line along the wall tops,
      // and a chevron light panel scrolling down the middle of the road. Every strip sits
      // 2-3 cm off the surface under it. Segments alternate cyan and amber.
      const h = rib.curbHeight
      const col = i % 2 ? C.loopAmber : C.loopCyan
      const ia = ha - CURB_W - 0.03
      const ib = hb - CURB_W - 0.03
      // Facing +r: lower edge first; facing -r: upper edge first.
      quad(ia, h - 0.3, ia, 0.4, ib, h - 0.3, ib, 0.4, col, PATTERN.PULSE)
      quad(-ia, 0.4, -ia, h - 0.3, -ib, 0.4, -ib, h - 0.3, col, PATTERN.PULSE)
      quad(ha + 0.03, 0.35, ha + 0.03, h - 0.35, hb + 0.03, 0.35, hb + 0.03, h - 0.35, col, PATTERN.PULSE)
      quad(-ha - 0.03, h - 0.35, -ha - 0.03, 0.35, -hb - 0.03, h - 0.35, -hb - 0.03, 0.35, col, PATTERN.PULSE)
      const ma = ha - CURB_W / 2
      const mbb = hb - CURB_W / 2
      for (const sd of [-1, 1]) quad(sd * ma + 0.1, h + 0.02, sd * ma - 0.1, h + 0.02, sd * mbb + 0.1, h + 0.02, sd * mbb - 0.1, h + 0.02, C.glowYellow, PATTERN.GLOW)
      quad(0.6, 0.03, -0.6, 0.03, 0.6, 0.03, -0.6, 0.03, C.loopCyan, PATTERN.CHEVRON)
    } else if (rib.style === 'asphalt' && Math.min(ha, hb) > 2.5) {
      // Dashed centre line and solid edge lines, 3 cm proud of the surface.
      quad(0.14, 0.03, -0.14, 0.03, 0.14, 0.03, -0.14, 0.03, C.line, PATTERN.DASH)
    }
    if (rib.style === 'asphalt' && Math.min(ha, hb) > 2.5) {
      const inA = rib.curbs ? ha - CURB_W - 0.35 : ha - 0.35
      const inB = rib.curbs ? hb - CURB_W - 0.35 : hb - 0.35
      quad(inA + 0.11, 0.03, inA - 0.11, 0.03, inB + 0.11, 0.03, inB - 0.11, 0.03, C.line)
      quad(-inA + 0.11, 0.03, -inA - 0.11, 0.03, -inB + 0.11, 0.03, -inB - 0.11, 0.03, C.line)
    }
  }
  if (rib.pontoon) addFloats(mb, rib)
  if (rib.girder) addGirders(mb, rib)
  // Tall barriers get end caps where they meet an ordinary curb (both windings).
  if (rib.curbs && rib.curbHeight > 0.5 && cs.length > 1) {
    const h = rib.curbHeight
    for (const c of [cs[0], cs[cs.length - 1]]) {
      for (const side of [-1, 1]) {
        const o = side * (c.w / 2)
        const i = side * (c.w / 2 - CURB_W)
        const p = [at(c, o, 0), at(c, i, 0), at(c, i, h), at(c, o, h)]
        mb.quad(p[0], p[1], p[2], p[3], side > 0 ? C.kerb : C.kerbLeft, KERB.pattern, [0, 0, h, h])
        mb.quad(p[0], p[3], p[2], p[1], side > 0 ? C.kerb : C.kerbLeft, KERB.pattern, [0, h, h, 0])
      }
    }
  }
}

/**
 * A single-lane girder bridge (ribbon `girder`): an orange box girder under each edge -
 * outer and inner webs and the bottom flange, 1 m deep - with cross braces between them
 * at every cross-section. All below the deck, so nothing to snag on.
 */
function addGirders(mb, rib) {
  const cs = rib.cs
  const D = 1
  const at = (c, x, y) => [c.p[0] + c.r[0] * x + c.u[0] * y, c.p[1] + c.r[1] * x + c.u[1] * y, c.p[2] + c.r[2] * x + c.u[2] * y]
  for (let i = 0; i < cs.length - 1; i += 1) {
    const a = cs[i]
    const b = cs[i + 1]
    if (Math.abs(b.s - a.s) < 1e-3) continue
    const quad = (pa0, pa1, pb0, pb1, out, color) => facing(mb, [pa0, pb0, pb1, pa1], out, color)
    for (const side of [-1, 1]) {
      const oa = side * (a.w / 2 - 0.05)
      const ob = side * (b.w / 2 - 0.05)
      const ia = side * (a.w / 2 - 0.55)
      const ib = side * (b.w / 2 - 0.55)
      const outward = a.r.map((v) => v * side)
      const y0 = -THICK
      const y1 = -THICK - D
      quad(at(a, oa, y0), at(a, oa, y1), at(b, ob, y0), at(b, ob, y1), outward, C.girder)
      quad(at(a, ia, y0), at(a, ia, y1), at(b, ib, y0), at(b, ib, y1), outward.map((v) => -v), C.girder)
      quad(at(a, oa, y1), at(a, ia, y1), at(b, ob, y1), at(b, ib, y1), a.u.map((v) => -v), C.steelDark)
    }
    // A cross brace under the deck at the start of each segment.
    const hw = a.w / 2 - 0.55
    mb.box(at(a, 0, -THICK - 0.3), [hw, 0.12, 0.12], a.r, a.u, cross3(a.r, a.u), all(C.steelDark))
  }
}

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm3 = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** Quad p0..p3 wound to face `out` (skipped if it has no area). */
function facing(mb, p, out, color, pattern = 0, coords = [0, 0, 0, 0]) {
  const n = cross3(sub3(p[1], p[0]), sub3(p[2], p[0]))
  const n2 = cross3(sub3(p[2], p[0]), sub3(p[3], p[0]))
  if (Math.hypot(...n) + Math.hypot(...n2) < 1e-6) return
  const d = (n[0] + n2[0]) * out[0] + (n[1] + n2[1]) * out[1] + (n[2] + n2[2]) * out[2]
  if (d >= 0) mb.quad(p[0], p[1], p[2], p[3], color, pattern, coords)
  else mb.quad(p[0], p[3], p[2], p[1], color, pattern, [coords[0], coords[3], coords[2], coords[1]])
}

/** An eight-sided float drum from a to b (centre line), `radius`, its sides lit by `right` / `up`. */
function drum(mb, a, b, right, up, radius, color, capColor) {
  const ring = (c, k) => {
    const t = ((k + 0.5) / 8) * Math.PI * 2
    return [0, 1, 2].map((i) => c[i] + (right[i] * Math.cos(t) + up[i] * Math.sin(t)) * radius)
  }
  for (let k = 0; k < 8; k += 1) {
    const t = ((k + 1) / 8) * Math.PI * 2
    const out = [0, 1, 2].map((i) => right[i] * Math.cos(t) + up[i] * Math.sin(t))
    facing(mb, [ring(a, k), ring(b, k), ring(b, k + 1), ring(a, k + 1)], out, color)
  }
  const axis = norm3(sub3(b, a))
  for (const [c, s] of [
    [a, -1],
    [b, 1],
  ]) {
    for (let k = 1; k < 7; k += 1) {
      const p = [ring(c, 0), ring(c, k), ring(c, k + 1)]
      const n = cross3(sub3(p[1], p[0]), sub3(p[2], p[0]))
      const flip = n[0] * axis[0] * s + n[1] * axis[1] * s + n[2] * axis[2] * s < 0
      if (flip) mb.tri(p[0], p[2], p[1], capColor)
      else mb.tri(p[0], p[1], p[2], capColor)
    }
  }
}

/**
 * One fixed plank of a pontoon bridge (a ribbon of two cross-sections): two float drums
 * under its deck, as the moving planks have (propGeometry pontoonGeometry).
 */
function addFloats(mb, rib) {
  const [a, b] = [rib.cs[0], rib.cs[rib.cs.length - 1]]
  const fwd = norm3(sub3(b.p, a.p))
  for (const s of [-1, 1]) {
    const lat = s * a.w * 0.3
    const p = (c, along) => [0, 1, 2].map((i) => c.p[i] + c.r[i] * lat - c.u[i] * (THICK + 0.5) + fwd[i] * along)
    drum(mb, p(a, 0.45), p(b, -0.45), a.r, a.u, 0.6, C.float, C.steelDark)
  }
}

/**
 * A glass tube piece (shared/track.js `tube`): the half-pipe floor and walls as the
 * collision facets (tubeFacets) with a steel outer shell 1.2 m behind them, two racing
 * chevron light strips down each wall, a hazard rim along the wall tops, and - for a
 * glass piece - the glass arch panels (into `glass`, a separate see-through mesh), dark
 * ribs over them every ~7 m, a glowing spine under the apex and orange portal frames
 * where the glass begins and ends. `prev` / `next`: the neighbouring ribbons, to cap the
 * walls' ends where the tube starts and stops.
 */
function addTube(mb, glass, rib, prev, next) {
  const cs = rib.cs
  const F = TUBE.floor / 2
  const T = TUBE.thick
  // World point of profile point q at cross-section c, `off` metres along q's inward normal.
  const W = (c, q, off = 0) => {
    const x = q.x + (q.nx || 0) * off
    const y = q.y + (q.ny ?? 1) * off
    return [c.p[0] + c.r[0] * x + c.u[0] * y, c.p[1] + c.r[1] * x + c.u[1] * y, c.p[2] + c.r[2] * x + c.u[2] * y]
  }
  const dirOf = (c, nx, ny) => [c.r[0] * nx + c.u[0] * ny, c.r[1] * nx + c.u[1] * ny, c.r[2] * nx + c.u[2] * ny]
  const fwdOf = (c) => cross3(c.u, c.r)
  const isGlass = !!rib.tube.glass
  // The wall facets at a cross-section, padded with the top point to `count` entries.
  const walls = (side, c, count) => {
    const f = tubeFacets(side, c.wa ?? TUBE.wall, false)
    const top = f.length ? f[f.length - 1][1] : tubePoint(side, 0)
    while (f.length < count) f.push([top, top, 'tube'])
    return f
  }
  const nFacets = (c) => Math.ceil((c.wa ?? TUBE.wall) / TUBE.facet - 1e-6)
  for (let i = 0; i < cs.length - 1; i += 1) {
    const a = cs[i]
    const b = cs[i + 1]
    if (Math.abs(b.s - a.s) < 1e-3 && a.p[0] === b.p[0] && a.p[2] === b.p[2]) continue
    const S = [a.s, b.s, b.s, a.s]
    const P0 = (x, y) => ({ x, y, nx: 0, ny: 1 })
    // Floor: top, underside, dashed centre line.
    facing(mb, [W(a, P0(F, 0)), W(b, P0(F, 0)), W(b, P0(-F, 0)), W(a, P0(-F, 0))], a.u, C.asphalt, PATTERN.ASPHALT, S)
    facing(mb, [W(a, P0(F, -T)), W(b, P0(F, -T)), W(b, P0(-F, -T)), W(a, P0(-F, -T))], dirOf(a, 0, -1), C.steelDark)
    facing(mb, [W(a, P0(0.14, 0.03)), W(b, P0(0.14, 0.03)), W(b, P0(-0.14, 0.03)), W(a, P0(-0.14, 0.03))], a.u, C.line, PATTERN.DASH, S)
    const count = Math.max(nFacets(a), nFacets(b))
    const full = Math.min(Math.floor((a.wa ?? TUBE.wall) / TUBE.facet + 1e-6), Math.floor((b.wa ?? TUBE.wall) / TUBE.facet + 1e-6))
    for (const side of [-1, 1]) {
      const fa = walls(side, a, count)
      const fb = walls(side, b, count)
      for (let k = 0; k < count; k += 1) {
        const [a0, a1] = fa[k]
        const [b0, b1] = fb[k]
        const inward = dirOf(a, a0.nx + a1.nx, a0.ny + a1.ny)
        // Inner face (two tones, facet by facet), and the outer shell behind it.
        facing(mb, [W(a, a0), W(b, b0), W(b, b1), W(a, a1)], inward, k % 2 ? C.tubeB : C.tubeA)
        facing(mb, [W(a, a0, -T), W(b, b0, -T), W(b, b1, -T), W(a, a1, -T)], inward.map((v) => -v), k % 2 ? C.steel : C.steelDark)
        // Racing light strips on the 30-45 and 60-75 degree facets, 2 cm proud.
        if ((k === 2 || k === 4) && k < full) {
          const n = norm3(inward)
          const strip = (q0, q1, c, t) => lerp3(W(c, q0), W(c, q1), t).map((v, j) => v + n[j] * 0.02)
          const [t0, t1] = k === 2 ? [0.42, 0.68] : [0.5, 0.78]
          facing(mb, [strip(a0, a1, a, t0), strip(b0, b1, b, t0), strip(b0, b1, b, t1), strip(a0, a1, a, t1)], n, C.tubeStrip, PATTERN.CHEVRON, S)
        }
      }
      // Hazard rim along the wall top (between the inner face and the shell).
      const ta = fa[count - 1][1]
      const tb = fb[count - 1][1]
      // (Facing up the wall: its tangent there, from the inward normal.)
      facing(mb, [W(a, ta), W(b, tb), W(b, tb, -T), W(a, ta, -T)], dirOf(a, side * ta.ny, -side * ta.nx), C.hazard, PATTERN.HAZARD, S)
    }
    if (isGlass) {
      for (const side of [-1, 1]) {
        for (const [q0, q1, kind] of tubeFacets(side, TUBE.wall, true)) {
          if (kind !== 'glass') continue
          facing(glass, [W(a, q0), W(b, q0), W(b, q1), W(a, q1)], dirOf(a, q0.nx + q1.nx, q0.ny + q1.ny), C.pane)
        }
      }
      // A glowing spine under the apex.
      const apex = tubePoint(1, 90, true).y - 0.12
      facing(mb, [W(a, P0(0.25, apex)), W(b, P0(0.25, apex)), W(b, P0(-0.25, apex)), W(a, P0(-0.25, apex))], dirOf(a, 0, -1), C.tubeStrip, PATTERN.GLOW)
    }
  }
  // Wall end caps where the tube starts / stops.
  const cap = (c, out) => {
    for (const side of [-1, 1]) {
      for (const [q0, q1] of tubeFacets(side, c.wa ?? TUBE.wall, false)) facing(mb, [W(c, q0), W(c, q1), W(c, q1, -T), W(c, q0, -T)], out, C.steelDark)
    }
  }
  if (!prev?.tube) cap(cs[0], fwdOf(cs[0]).map((v) => -v))
  if (!next?.tube) cap(cs[cs.length - 1], fwdOf(cs[cs.length - 1]))
  if (!isGlass) return
  // Ribs over the glass every ~7 m, portal frames at its two ends.
  const frame = (c, portal) => {
    for (const side of [-1, 1]) {
      for (const [q0, q1, kind] of tubeFacets(side, TUBE.wall, true)) {
        if (kind !== 'glass' && !portal) continue
        const depth = portal ? (kind === 'glass' ? 0.45 : T + 0.35) : 0.24
        const inset = portal ? 0.06 : 0.03
        const p0 = W(c, q0, -inset - depth / 2)
        const p1 = W(c, q1, -inset - depth / 2)
        const ax = norm3(sub3(p1, p0))
        const ay = norm3(dirOf(c, q0.nx + q1.nx, q0.ny + q1.ny))
        const az = cross3(ax, ay)
        const half = Math.hypot(...sub3(p1, p0)) / 2 + (portal ? 0.3 : 0.1)
        const col = portal ? C.gate : C.tubeRib
        mb.box(lerp3(p0, p1, 0.5), [half, depth / 2, portal ? 0.35 : 0.14], ax, ay, az, { top: col, side: col, end: col, bottom: col })
      }
    }
  }
  let lastRib = -Infinity
  for (const c of cs) {
    if (c.s - lastRib < 7) continue
    lastRib = c.s
    frame(c, false)
  }
  if (!prev?.tube?.glass) frame(cs[0], true)
  if (!next?.tube?.glass) frame(cs[cs.length - 1], true)
}

/** Floors of the round platforms are drawn this far under the road (and their colliders), paint half that: the road ribbon across them never z-fights. */
const ROUND_DY = 0.05

/** Triangle a-b-c wound to face `out`. */
function faceTri(mb, a, b, c, out, color, pattern = 0) {
  const n = cross3(sub3(b, a), sub3(c, a))
  if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) mb.tri(a, b, c, color, pattern)
  else mb.tri(a, c, b, color, pattern)
}

/**
 * A round platform (shared/track.js roundPiece, `stage.rounds`): the n-gon floor (under
 * the road ribbon that crosses it), and for the Stunt Bowl the quarter-pipe rim (two-tone
 * facets, a cyan light band, a hazard coping), the deck ring, floodlight masts and the
 * end caps where the rim stops for the road; for the sweeper deck a hazard ring where the
 * bar sweeps. Both: the low hazard walls (from the walls' own spans) and a steel skirt
 * down to the water.
 */
function addRound(mb, r) {
  const n = r.n
  const half = Math.PI / n
  const tanH = Math.tan(half)
  const fwd = forwardOf(r.yaw)
  const right = rightOf(r.yaw)
  const [cx, cy, cz] = r.c
  const UP = [0, 1, 0]
  const water = -0.5 - cy
  const ang = (i) => (i * 2 * Math.PI) / n
  const dirA = (a) => [fwd[0] * Math.cos(a) + right[0] * Math.sin(a), 0, fwd[2] * Math.cos(a) + right[2] * Math.sin(a)]
  const tanA = (a) => [-fwd[0] * Math.sin(a) + right[0] * Math.cos(a), 0, -fwd[2] * Math.sin(a) + right[2] * Math.cos(a)]
  // Point of sector i: apothem d, tangential offset q, height y above the deck.
  const P = (i, d, q, y) => {
    const dd = dirA(ang(i))
    const t = tanA(ang(i))
    return [cx + dd[0] * d + t[0] * q, cy + y, cz + dd[2] * d + t[2] * q]
  }
  // Polygon vertex of sector i at apothem d on `side` (-1 / +1).
  const V = (i, d, y, side) => P(i, d, side * d * tanH, y)
  const lateral = (p) => (p[0] - cx) * right[0] + (p[2] - cz) * right[2]
  const rim = r.rim
  const arena = r.kind === 'arena'
  const profile = []
  if (rim) {
    for (let a = 0; a <= rim.deg + 1e-6; a += rim.facet) {
      const t = (Math.min(a, rim.deg) * Math.PI) / 180
      profile.push([r.R + rim.Rq * Math.sin(t), a === 0 ? -ROUND_DY : rim.Rq * (1 - Math.cos(t))])
    }
  }
  const floorCol = arena ? C.bowlFloor : C.spinFloor
  const floorPat = arena ? PATTERN.TILES : PATTERN.GRATE
  for (let i = 0; i < n; i += 1) {
    const open = r.open[i]
    const A = open && rim ? r.Ro : r.R
    const d = dirA(ang(i))
    // Floor wedge.
    faceTri(mb, [cx, cy - ROUND_DY, cz], V(i, A, -ROUND_DY, -1), V(i, A, -ROUND_DY, 1), UP, floorCol, floorPat)
    if (rim && !open) {
      // Quarter-pipe facets, inward and up.
      for (let k = 0; k < profile.length - 1; k += 1) {
        const [d0, y0] = profile[k]
        const [d1, y1] = profile[k + 1]
        const inward = [-d[0] * (y1 - y0), d1 - d0, -d[2] * (y1 - y0)]
        facing(mb, [V(i, d0, y0, -1), V(i, d0, y0, 1), V(i, d1, y1, 1), V(i, d1, y1, -1)], inward, k % 2 ? C.bowlB : C.bowlA)
        // A cyan light band across the middle facet, 2 cm proud.
        if (k === 2) {
          const nn = norm3(inward)
          const lift = (p) => [p[0] + nn[0] * 0.02, p[1] + nn[1] * 0.02, p[2] + nn[2] * 0.02]
          const m0 = [d0 + (d1 - d0) * 0.35, y0 + (y1 - y0) * 0.35]
          const m1 = [d0 + (d1 - d0) * 0.65, y0 + (y1 - y0) * 0.65]
          facing(mb, [V(i, m0[0], m0[1], -1), V(i, m0[0], m0[1], 1), V(i, m1[0], m1[1], 1), V(i, m1[0], m1[1], -1)].map(lift), inward, C.loopCyan, PATTERN.PULSE)
        }
      }
      // Deck ring and its hazard coping along the lip (2 cm proud).
      const top = profile[profile.length - 1]
      facing(mb, [V(i, top[0], r.H, -1), V(i, top[0], r.H, 1), V(i, r.Ro, r.H, 1), V(i, r.Ro, r.H, -1)], UP, C.bowlDeck, PATTERN.GRATE)
      const cop = top[0] + 0.45
      const pts = [V(i, top[0], r.H + 0.02, -1), V(i, top[0], r.H + 0.02, 1), V(i, cop, r.H + 0.02, 1), V(i, cop, r.H + 0.02, -1)]
      facing(mb, pts, UP, C.hazard, PATTERN.HAZARD, [0, 2 * top[0] * tanH, 2 * top[0] * tanH, 0])
      // Steel skirt from the wall top down to the water.
      const wt = r.H + r.wall.h
      facing(mb, [V(i, r.Ro, wt, -1), V(i, r.Ro, wt, 1), V(i, r.Ro, water, 1), V(i, r.Ro, water, -1)], d, C.steelDark)
      // End caps where the rim stops beside an open sector.
      for (const side of [-1, 1]) {
        if (!r.open[(i + side + n) % n]) continue
        const out = tanA(ang(i) + side * half).map((v) => v * side)
        const base = V(i, r.Ro, -ROUND_DY, side)
        const ring = [...profile.map(([dd, yy]) => V(i, dd, yy, side)), V(i, r.Ro, r.H, side)]
        for (let k = 0; k < ring.length - 1; k += 1) faceTri(mb, base, ring[k], ring[k + 1], out, C.steel)
      }
    } else {
      // Floor edge (the apron's, or the sweeper deck's): a skirt down to the water.
      facing(mb, [V(i, A, -ROUND_DY, -1), V(i, A, -ROUND_DY, 1), V(i, A, water, 1), V(i, A, water, -1)], d, C.steelDark)
    }
  }
  // Low walls, mitred where they meet round the ring, capped where they stop.
  const lim = (d) => d * tanH
  const t = r.wall.t
  for (const w of r.walls) {
    const i = w.i
    const d = dirA(ang(i))
    const tg = tanA(ang(i))
    const outer = r.Ro
    const inner = r.Ro - t
    const atVertex = (q) => Math.abs(Math.abs(q) - lim(outer)) < 0.05
    const qi = (q) => (atVertex(q) ? Math.sign(q) * lim(inner) : q)
    const y0 = w.base
    const y1 = w.base + r.wall.h
    const p = (dd, q, y) => P(i, dd, q, y)
    facing(mb, [p(inner, qi(w.q0), y1), p(inner, qi(w.q1), y1), p(outer, w.q1, y1), p(outer, w.q0, y1)], UP, C.hazard, PATTERN.HAZARD)
    facing(mb, [p(inner, qi(w.q0), y0), p(inner, qi(w.q1), y0), p(inner, qi(w.q1), y1), p(inner, qi(w.q0), y1)], d.map((v) => -v), C.hazard, PATTERN.HAZARD)
    // (The outer face of a rim wall is the skirt's; an apron / deck-edge wall has its own.)
    if (!rim || r.open[i]) facing(mb, [p(outer, w.q0, y0), p(outer, w.q1, y0), p(outer, w.q1, y1), p(outer, w.q0, y1)], d, C.hazard, PATTERN.HAZARD)
    for (const q of [w.q0, w.q1]) {
      const sgn = Math.sign(q - (w.q0 + w.q1) / 2)
      if (atVertex(q)) {
        // At a ring corner: capped only where the next sector has no wall at this height.
        const j = (i + sgn + n) % n
        if (r.walls.some((o) => o.i === j && o.base === w.base)) continue
        // An apron wall's end inside the rim's end cap is hidden: skip it.
        if (rim && r.open[i]) continue
        const out = tanA(ang(i) + sgn * half).map((v) => v * sgn)
        facing(mb, [p(inner, qi(q), y0), p(outer, q, y0), p(outer, q, y1), p(inner, qi(q), y1)], out, C.hazard, PATTERN.HAZARD)
      } else {
        const out = tg.map((v) => v * sgn)
        facing(mb, [p(inner, q, y0), p(outer, q, y0), p(outer, q, y1), p(inner, q, y1)], out, C.hazard, PATTERN.HAZARD)
      }
    }
  }
  // Painted rings on the floor (between it and the road): skipped where the road crosses.
  const paint = (radius, width, color, pattern) => {
    const steps = 72
    for (let k = 0; k < steps; k += 1) {
      const a0 = (k / steps) * Math.PI * 2
      const a1 = ((k + 1) / steps) * Math.PI * 2
      const pt = (a, rr) => {
        const dd = dirA(a)
        return [cx + dd[0] * rr, cy - ROUND_DY / 2, cz + dd[2] * rr]
      }
      const q = [pt(a0, radius - width / 2), pt(a1, radius - width / 2), pt(a1, radius + width / 2), pt(a0, radius + width / 2)]
      if (q.some((pp) => Math.abs(lateral(pp)) < r.roadW / 2 + 0.15)) continue
      facing(mb, q, UP, color, pattern, [0, 1.2, 1.2, 0])
    }
  }
  if (arena) {
    paint(r.R - 1.1, 0.5, C.bowlRing, 0)
    paint(9, 0.4, C.loopCyan, PATTERN.GLOW)
    // Floodlight masts on the deck ring, on the diagonals.
    for (let i = 0; i < n; i += 1) {
      const a = ang(i)
      if (r.open[i] || Math.abs(Math.abs(Math.sin(2 * a)) - 1) > 0.02) continue
      const [x, , z] = P(i, r.Ro - 1.4, 0, 0)
      mb.prism(x, z, cy + r.H, cy + r.H + 10, 0.22, 6, C.lampPost)
      const d = dirA(a)
      const head = P(i, r.Ro - 1.9, 0, r.H + 10.2)
      mb.box(head, [1.3, 0.45, 0.25], tanA(a), UP, d.map((v) => -v), { top: C.lampPost, side: C.lampPost, bottom: C.lampPost, end: C.glowYellow }, { end: PATTERN.GLOW })
    }
  } else {
    // Where the bar's tips sweep.
    paint(13.6, 0.5, C.hazard, PATTERN.HAZARD)
  }
}

/** Checkpoint gate: two pillars and a beam across the road, with light strips. */
function addGate(mb, cp, finish) {
  const fwd = forwardOf(cp.yaw)
  const right = rightOf(cp.yaw)
  const up = [0, 1, 0]
  const back = [-fwd[0], -fwd[1], -fwd[2]]
  const half = cp.width / 2 + 0.8
  const height = 8
  const color = finish ? C.finish : C.gate
  for (const side of [-1, 1]) {
    const base = add3([cp.x, cp.y, cp.z], right, side * half)
    mb.box(add3(base, up, height / 2), [0.7, height / 2, 0.7], right, up, back, { top: color, side: color, end: color, bottom: color })
    // Light strip down the inner face.
    mb.box(add3(add3(base, up, height / 2), right, -side * 0.72), [0.04, height / 2 - 0.5, 0.35], right, up, back, { side: C.glowYellow, top: C.glowYellow, end: C.glowYellow }, { side: PATTERN.PULSE, top: PATTERN.PULSE, end: PATTERN.PULSE })
  }
  const beamC = add3([cp.x, cp.y, cp.z], up, height + 0.9)
  mb.box(beamC, [half + 0.76, 1.1, 0.8], right, up, back, finish ? { top: C.hazard, side: C.hazard, end: C.hazard, bottom: C.hazard } : { top: color, side: color, end: color, bottom: color }, finish ? { top: PATTERN.HAZARD, side: PATTERN.HAZARD, end: PATTERN.HAZARD } : {}, { along: right })
}

/**
 * A checkpoint plaza's furniture, in the plaza's own frame: `a` metres along the road
 * from the gate, `o` metres in from the plaza's left edge, `y` up from the deck.
 */
function plazaFrame(cp) {
  const fwd = forwardOf(cp.yaw)
  const right = rightOf(cp.yaw)
  const back = [-fwd[0], -fwd[1], -fwd[2]]
  const up = [0, 1, 0]
  const w = cp.width
  const P = (a, o, y = 0) => [cp.x + fwd[0] * a + right[0] * (o - w / 2), cp.y + y, cp.z + fwd[2] * a + right[2] * (o - w / 2)]
  /** Box spanning a0..a1, o0..o1, y0..y1. Faces: side = across the road, end = along it. */
  const box = (mb, a0, a1, o0, o1, y0, y1, colors, patterns = {}, opts = {}) => {
    const c = P((a0 + a1) / 2, (o0 + o1) / 2, (y0 + y1) / 2)
    mb.box(c, [(o1 - o0) / 2, (y1 - y0) / 2, (a1 - a0) / 2], right, up, back, colors.isColor ? all(colors) : colors, patterns, { skip: ['bottom'], ...opts })
  }
  /** Flat paint on the deck, `y` up; pattern coordinate runs along the road. */
  const flat = (mb, a0, a1, o0, o1, y, color, pattern = 0) =>
    mb.quad(P(a1, o0, y), P(a0, o0, y), P(a0, o1, y), P(a1, o1, y), color, pattern, [a1, a0, a0, a1])
  return { fwd, right, back, up, w, P, box, flat }
}

const all = (c) => ({ top: c, side: c, end: c, bottom: c })

/**
 * The safe zone and the pit garage on a checkpoint plaza:
 * - green-and-white safe-zone bands painted along the sides and across the entry,
 * - lamp posts on the rails,
 * - the pit garage on the left: an open-fronted workshop (blue walls, glass side
 *   windows, tool cabinets, tyre stacks, a glowing back panel, ceiling lights) under a
 *   deep canopy on two pillars, with the round car-spin pad in front of it.
 * The garage's walls and pillars are colliders from shared/track.js (PIT).
 */
function addPlaza(mb, cp) {
  const F = plazaFrame(cp)
  const { w, box, flat, P } = F
  const L = cp.length
  const mid = L * 0.5
  const half = PIT.length / 2
  // --- Safe zone paint (2 cm proud of the deck) -------------------------------------------
  const band = C.safe
  const y = 0.02
  flat(mb, 1.2, 2.2, 1, w - 1, y, band, PATTERN.STRIPES)
  flat(mb, 2.2, mid - half - 0.6, 1, 1.9, y, band, PATTERN.STRIPES)
  flat(mb, mid + half + 0.6, L - 1, 1, 1.9, y, band, PATTERN.STRIPES)
  flat(mb, 2.2, L - 1, w - 1.9, w - 1, y, band, PATTERN.STRIPES)
  // --- Lamp posts on the rails ----------------------------------------------------------
  const lamp = (a, o, dir) => {
    const [x, , z] = P(a, o)
    mb.prism(x, z, cp.y + 0.9, cp.y + 7, 0.14, 6, C.lampPost)
    const head = P(a, o + dir * 0.9, 6.8)
    mb.box(head, [0.42, 0.14, 0.42], F.right, F.up, F.back, all(C.glowYellow), all(PATTERN.GLOW))
    const arm = P(a, o + dir * 0.45, 7)
    mb.box(arm, [0.48, 0.06, 0.06], F.right, F.up, F.back, all(C.lampPost))
  }
  for (const a of [6, L - 6]) lamp(a, 0.3, 1)
  for (const a of [6, mid, L - 6]) lamp(a, w - 0.3, -1)
  if (cp.finish) return
  // --- The pit garage ---------------------------------------------------------------------
  const o0 = PIT.back
  const o1 = PIT.back + PIT.depth
  const H = PIT.height
  const a0 = mid - half
  const a1 = mid + half
  const wall = C.pitWall
  // Floor (dark tiles) inside the walls.
  flat(mb, a0 + 0.5, a1 - 0.5, o0 + 0.5, o1, 0.03, C.pitFloor, PATTERN.TILES)
  // Back wall and the two end walls (with a band of glass in each).
  box(mb, a0, a1, o0, o0 + 0.5, 0, H, { top: wall, side: wall, end: wall })
  for (const e of [a0, a1 - 0.5]) {
    box(mb, e, e + 0.5, o0 + 0.5, o1, 0, H, { top: wall, side: wall, end: wall })
    box(mb, e - 0.05, e + 0.55, o0 + 1.4, o1 - 0.8, 1.5, 4.2, all(C.pitGlass), all(PATTERN.GLASS))
  }
  // White trim band round the top of the walls.
  box(mb, a0 - 0.08, a1 + 0.08, o0 - 0.08, o0 + 0.58, H - 0.7, H - 0.35, C.white)
  // Roof and canopy, its orange fascia and lights underneath.
  box(mb, a0 - 0.4, a1 + 0.4, o0 - 0.3, o1 + 2.4, H, H + 0.5, { top: C.pitRoof, side: C.white, end: C.white, bottom: C.white }, {}, { skip: [] })
  box(mb, a0 - 0.4, a1 + 0.4, o1 + 2.4, o1 + 2.6, H - 0.4, H + 1.4, C.gate)
  box(mb, a0 + 1, a1 - 1, o1 + 0.8, o1 + 1.2, H - 0.08, H - 0.01, C.ceiling, all(PATTERN.GLOW))
  box(mb, a0 + 1, a1 - 1, o0 + 2.5, o0 + 2.9, H - 0.08, H - 0.01, C.ceiling, all(PATTERN.GLOW))
  // Canopy pillars.
  for (const a of [a0 + 0.3, a1 - 0.3]) box(mb, a - 0.3, a + 0.3, o1 + 1.3, o1 + 1.9, 0, H, C.pitPillar)
  // Inside: a glowing panel on the back wall, red tool cabinets, tyre stacks.
  box(mb, mid - 2.4, mid + 2.4, o0 + 0.5, o0 + 0.58, 2.4, 4.3, C.pitPanel, all(PATTERN.GLOW))
  box(mb, a0 + 0.9, a0 + 4.2, o0 + 0.5, o0 + 1.2, 0, 1.1, { top: C.steelLight, side: C.toolRed, end: C.toolRed })
  box(mb, a0 + 0.9, a0 + 3.9, o0 + 0.5, o0 + 0.56, 1.5, 3.6, C.pegboard, all(PATTERN.GRATE))
  for (const [a, o] of [
    [a1 - 1.6, o0 + 1.3],
    [a1 - 1.6, o0 + 2.5],
  ]) {
    const [x, , z] = P(a, o)
    for (let k = 0; k < 3; k += 1) mb.prism(x, z, cp.y + 0.03 + k * 0.42, cp.y + 0.03 + k * 0.42 + 0.4, 0.5, 8, C.tyre)
  }
  // --- The car-spin pad: a round glowing turntable with a white ring ----------------------
  const k = cp.kiosk
  mb.prism(k.x, k.z, k.y, k.y + 0.02, 3.4, 20, C.white)
  mb.prism(k.x, k.z, k.y, k.y + 0.06, 3, 20, C.spinPad, C.spinPad, PATTERN.PULSE)
}

/** Height of the exit portal's sign board centre above the plaza, and its size (Stage.jsx letters it). */
export const EXIT_SIGN = { y: EXIT_PORTAL.height + 2.35, width: 9.2, height: 2.1 }

/**
 * The exit portal on a finish plaza (shared/chapters.js addExitPortal): the lobby
 * portal's grand arch (world/pierGeometry.js portalArches) in the portal's own frame -
 * navy pylons on stepped plinths with teal light strips and gold inner edges (their
 * cores are the 'portalPost' colliders), a double lintel with a gold band and two
 * beacons, a sign board on stubs (lettered by Stage.jsx's sign atlas) and a white frame
 * round the pad. The swirl and the pad's glow are track/ExitPortal.jsx.
 */
function addExitPortal(mb, p) {
  const { w, d, post, height, padHalf } = EXIT_PORTAL
  const n = p.normal
  const c = p.across
  const up = [0, 1, 0]
  // n x up = -c: boxes take (n, up, -c) as their axes so their faces wind outwards.
  const back = [-c[0], -c[1], -c[2]]
  /** Box spanning n0..n1 (along the facing), y0..y1 (up from the plaza), c0..c1 (along the opening). */
  const B = ([n0, y0, c0], [n1, y1, c1], colors, patterns = {}, opts = {}) => {
    const nm = (n0 + n1) / 2
    const cm = (c0 + c1) / 2
    const ctr = [p.x + n[0] * nm + c[0] * cm, p.y + (y0 + y1) / 2, p.z + n[2] * nm + c[2] * cm]
    mb.box(ctr, [(n1 - n0) / 2, (y1 - y0) / 2, (c1 - c0) / 2], n, up, back, colors.isColor ? all(colors) : colors, patterns, opts)
  }
  const skipEnds = { skip: ['top', 'bottom'] }
  const skipBottom = { skip: ['bottom'] }
  for (const s of [-1, 1]) {
    const z = s * (d / 2 + post)
    B([-post, 0.9, z - post], [post, height, z + post], C.portalNavy, {}, skipEnds)
    for (const f of [-1, 1]) B([f * post - (f < 0 ? 0.06 : 0), 1.2, z - 0.12], [f * post + (f > 0 ? 0.06 : 0), height - 0.5, z + 0.12], C.portalTeal, all(PATTERN.PULSE), skipEnds)
    const zi = z - s * post
    B([-0.12, 1.2, Math.min(zi, zi - s * 0.06)], [0.12, height - 0.5, Math.max(zi, zi - s * 0.06)], C.portalGold, all(PATTERN.GLOW), skipEnds)
    B([-post - 0.5, 0, z - post - 0.5], [post + 0.5, 0.45, z + post + 0.5], C.portalDark, {}, skipBottom)
    B([-post - 0.25, 0.45, z - post - 0.25], [post + 0.25, 0.9, z + post + 0.25], C.portalSteel, {}, skipBottom)
    // Beacon on the lintel's end, and a stub holding the sign board.
    B([-0.3, height + 1.15, z - 0.3], [0.3, height + 1.75, z + 0.3], C.glowYellow, all(PATTERN.PULSE), skipBottom)
    B([-0.12, height + 1.15, s * 2.6 - 0.12], [0.12, EXIT_SIGN.y - EXIT_SIGN.height / 2, s * 2.6 + 0.12], C.portalDark, {}, skipBottom)
  }
  const z1 = d / 2 + post * 2 + 0.4
  B([-post - 0.15, height, -z1], [post + 0.15, height + 0.6, z1], C.portalNavy)
  B([-post - 0.2, height + 0.6, -z1 - 0.05], [post + 0.2, height + 0.85, z1 + 0.05], C.portalGold, {}, skipBottom)
  B([-post - 0.05, height + 0.85, -z1 + 0.3], [post + 0.05, height + 1.15, z1 - 0.3], C.portalNavy, {}, skipBottom)
  // The sign board, just behind its lettered face (which faces along `normal`).
  B([-0.2, EXIT_SIGN.y - EXIT_SIGN.height / 2 - 0.1, -EXIT_SIGN.width / 2 - 0.1], [-0.02, EXIT_SIGN.y + EXIT_SIGN.height / 2 + 0.1, EXIT_SIGN.width / 2 + 0.1], C.portalNavy)
  // Pad frame: four white strips round the glowing pad, clear of the plinths.
  const k = 0.35
  const x0 = -w / 2
  const x1 = w / 2
  B([x0 - k, 0, -padHalf - k], [x1 + k, 0.06, -padHalf], C.white, {}, skipBottom)
  B([x0 - k, 0, padHalf], [x1 + k, 0.06, padHalf + k], C.white, {}, skipBottom)
  B([x0 - k, 0, -padHalf], [x0, 0.06, padHalf], C.white, {}, skipBottom)
  B([x1, 0, -padHalf], [x1 + k, 0.06, padHalf], C.white, {}, skipBottom)
}

/**
 * A stunt ramp (shared/adventure.js): its collider is a tilted slab, drawn as is - the
 * part below the road is hidden by it - with scrolling chevrons up the top, hazard
 * stripes down the sides and two struts under the lip.
 */
function addRamp(mb, b) {
  const down = [-b.az[0], -b.az[1], -b.az[2]]
  mb.box(b.c, b.h, b.ax, b.ay, b.az, { top: C.gate, side: C.hazard, end: C.hazard, bottom: C.steelDark }, { top: PATTERN.CHEVRON, side: PATTERN.HAZARD, end: PATTERN.HAZARD }, { along: down })
  // Struts from the road up to the underside of the high end.
  const lip = [b.c[0] + down[0] * b.h[2] * 0.85 - b.ay[0] * b.h[1], b.c[1] + down[1] * b.h[2] * 0.85 - b.ay[1] * b.h[1], b.c[2] + down[2] * b.h[2] * 0.85 - b.ay[2] * b.h[1]]
  const ground = lip[1] - (b.h[2] * 2 * Math.abs(down[1])) * 0.85
  for (const side of [-1, 1]) {
    const x = lip[0] + b.ax[0] * side * (b.h[0] - 0.4)
    const z = lip[2] + b.ax[2] * side * (b.h[0] - 0.4)
    mb.prism(x, z, ground - 0.2, lip[1] - 0.05, 0.16, 6, C.steelDark)
  }
}

/**
 * A lighthouse in the middle of a spiral (stage.beacons): a slim concrete shaft from the
 * sea, red and white bands up past the road's turns, a gallery, a glowing lantern room and a
 * red cap. Drawn only (the road is 26 m off its axis).
 */
function addBeacon(mb, b) {
  const top = b.y1 + 16
  const first = b.y0 - 14
  mb.prism(b.x, b.z, -3, first, 2.6, 12, C.steelLight)
  const band = 12
  for (let y = first, k = 0; y < top; y += band, k += 1) mb.prism(b.x, b.z, y, Math.min(top, y + band), 3.1, 12, k % 2 ? C.toolRed : C.white)
  mb.prism(b.x, b.z, top, top + 0.8, 5.4, 12, C.steelDark)
  mb.prism(b.x, b.z, top + 0.8, top + 6.8, 2.7, 12, C.glowYellow, C.glowYellow, PATTERN.GLOW)
  mb.prism(b.x, b.z, top + 6.8, top + 9.6, 3.6, 12, C.toolRed)
}

/** Signpost at a section's start: pole and board (the text is in the sign atlas). */
function addSignPost(mb, s) {
  const fwd = forwardOf(s.yaw)
  const right = rightOf(s.yaw)
  const up = [0, 1, 0]
  const back = [-fwd[0], -fwd[1], -fwd[2]]
  const base = [s.x, s.y, s.z]
  mb.box(add3(base, up, 2.6), [0.15, 2.6, 0.15], right, up, back, { side: C.signPost, top: C.signPost, end: C.signPost })
  mb.box(add3(add3(base, up, 5.2), right, -2.4), [2.7, 0.95, 0.12], right, up, back, { side: C.gate, top: C.gate, end: C.gate, bottom: C.gate })
}

const TOOTH = new Color('#e3e9f0')
const TOOTH_SHADE = new Color('#9aa4b0')
const CORAL = [new Color('#ff6f8f'), new Color('#ff9a4a'), new Color('#c77dff'), new Color('#ffd166')]
const CORAL_SHADE = new Color('#d9506e')
const CORAL_SLAB = new Color('#d8c49a')
const BAMBOO = new Color('#d9b46a')
// The Desert Canyon's looks: cactus caltrops (green spines on a sandy slab), the timber
// trampoline over the gorge, sand-coloured dust-storm chevrons.
const CACTUS = [new Color('#4f8f3a'), new Color('#6aa84a'), new Color('#3d7a30')]
const CACTUS_SLAB = new Color('#c99a68')
const CACTUS_FLOWER = new Color('#ff5a7a')
const TIMBER = new Color('#9a6a3e')
const DUST = new Color('#ffcf8a')

/**
 * A spike strip (trigger `spikes`, shared/track.js SPIKES): a low dark slab against one
 * kerb with rows of upright metal teeth (small four-sided pyramids), a glowing orange
 * warning edge on the side facing the open lane and hazard stripes across both ends.
 */
function addSpikes(mb, tr) {
  const { ax, ay, az } = tr
  const surface = add3(tr.c, ay, -0.8)
  const [hu, , hv] = tr.h
  const at = (u, v, y) => add3(add3(add3(surface, ax, u), az, v), ay, y)
  // (`look: 'coral'`, the Tropical Island's: a sandy reef slab, the teeth in coral colours.)
  const coral = tr.look === 'coral'
  const cactus = tr.look === 'cactus'
  const slab = coral ? CORAL_SLAB : cactus ? CACTUS_SLAB : new Color('#262a31')
  const edge = coral ? CORAL[0] : cactus ? CACTUS_FLOWER : C.gate
  mb.box(at(0, 0, 0.07), [hu, 0.07, hv], ax, ay, az, { top: slab, side: slab, end: slab }, {}, { skip: ['bottom'] })
  // The open lane is on the other side of the strip's middle from the kerb it sits against.
  const open = tr.lane > 0 ? -1 : 1
  mb.box(at(open * (hu - 0.09), 0, 0.17), [0.09, 0.03, hv - 0.18], ax, ay, az, { top: edge, side: edge, end: edge }, { top: PATTERN.GLOW, side: PATTERN.GLOW, end: PATTERN.GLOW }, { skip: ['bottom'] })
  for (const s of [-1, 1]) mb.box(at(0, s * (hv - 0.09), 0.16), [hu, 0.02, 0.09], ax, ay, az, { top: C.hazard, side: C.hazard, end: C.hazard }, { top: PATTERN.HAZARD, end: PATTERN.HAZARD }, { skip: ['bottom'] })
  // Teeth: a grid, each a pyramid 0.34 m across and 0.55 m tall on the slab.
  const cols = Math.max(2, Math.floor((hu * 2 - 0.4) / 0.85))
  const rows = 4
  const r = 0.17
  const corners = [[r, 0], [0, r], [-r, 0], [0, -r]]
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const u = -hu + 0.3 + ((hu * 2 - 0.6) * (cols === 1 ? 0.5 : i)) / Math.max(1, cols - 1) + (j % 2 ? 0.2 : 0)
      const v = -hv + 0.55 + ((hv * 2 - 1.1) * j) / (rows - 1)
      if (Math.abs(u) > hu - 0.25) continue
      const base = corners.map(([du, dv]) => at(u + du, v + dv, 0.14))
      const tip = at(u, v, 0.7)
      const tooth = coral ? CORAL[(i + j * 2) % CORAL.length] : cactus ? CACTUS[(i + j) % CACTUS.length] : TOOTH
      const shade = coral ? CORAL_SHADE : cactus ? CACTUS[2] : TOOTH_SHADE
      for (let k = 0; k < 4; k += 1) mb.tri(base[(k + 1) % 4], base[k], tip, k % 2 ? shade : tooth)
    }
  }
}

function addTrigger(mb, tr) {
  if (tr.type === 'spikes') return addSpikes(mb, tr)
  const ax = tr.ax
  const ay = tr.ay
  const az = tr.az
  // Trigger centres sit 0.8 m above the road; every pad is lifted to its own height
  // above the 3 cm line markings, so no two surfaces are ever coplanar.
  const surface = add3(tr.c, ay, -0.8)
  // A flat strip beside the pad: `u`/`v` the offsets (m) along ax/az of its centre,
  // half sizes hu/hv, from the road up to `top`.
  const strip = (u, v, hu, hv, top, colors, patterns = {}, along = ax) =>
    mb.box(add3(add3(add3(surface, ax, u), az, v), ay, top / 2), [hu, top / 2, hv], ax, ay, az, colors, patterns, { skip: ['bottom'], along })
  if (tr.type === 'boost') {
    mb.box(add3(surface, ay, 0.045), [tr.h[0], 0.02, tr.h[2]], ax, ay, az, { top: C.boost, side: C.boost, end: C.boost }, { top: PATTERN.CHEVRON, side: PATTERN.GLOW, end: PATTERN.GLOW }, { skip: ['bottom'] })
    // Dark bezel round the pad, a little lower than it so the glowing edge shows.
    const b = 0.18
    const bezel = new Color('#2b3038')
    const frame = { top: bezel, side: bezel, end: bezel }
    for (const s of [-1, 1]) {
      strip(0, s * (tr.h[2] + b / 2), tr.h[0] + b, b / 2, 0.05, frame)
      strip(s * (tr.h[0] + b / 2), 0, b / 2, tr.h[2], 0.05, frame)
    }
  } else if (tr.type === 'bounce') {
    // (`look: 'spring'`, the Tropical Island's palm springs: bamboo sides and kick plates.)
    const spring = tr.look === 'spring' || tr.look === 'timber'
    const rim = tr.look === 'timber' ? TIMBER : spring ? BAMBOO : C.white
    mb.box(add3(surface, ay, 0.12), [tr.h[0], 0.12, tr.h[2]], ax, ay, az, { top: C.bounce, side: rim, end: rim }, { top: PATTERN.GLOW, ...(spring ? { side: PATTERN.PLANKS, end: PATTERN.PLANKS } : {}) })
    // Hazard-striped kick plates before and after it (the pad runs curb to curb).
    const plate = spring ? { top: rim, side: rim, end: rim } : { top: C.hazard, side: C.hazard, end: C.hazard }
    for (const s of [-1, 1]) strip(0, s * (tr.h[2] + 0.15), tr.h[0], 0.15, 0.16, plate, spring ? { top: PATTERN.PLANKS } : { top: PATTERN.HAZARD, end: PATTERN.HAZARD })
  } else if (tr.type === 'wind') {
    // Teal chevrons across the road, scrolling the way the wind blows.
    const along = [ax[0] * tr.dir, ax[1] * tr.dir, ax[2] * tr.dir]
    for (const dz of [-0.6, 0, 0.6]) {
      const c = add3(add3(surface, az, dz * tr.h[2]), ay, 0.05)
      const wind = tr.look === 'dust' ? DUST : C.wind
      mb.box(c, [tr.h[0] - 0.4, 0.01, 0.9], ax, ay, az, { top: wind, side: wind, end: wind }, { top: PATTERN.CHEVRON }, { along })
    }
  } else if (tr.type === 'conveyor') {
    // A dark belt with rollers, stripes scrolling the way it runs.
    const along = [-az[0] * tr.dir, -az[1] * tr.dir, -az[2] * tr.dir]
    mb.box(add3(surface, ay, 0.05), [tr.h[0], 0.035, tr.h[2]], ax, ay, az, { top: C.belt, side: C.steelDark, end: C.steelDark }, { top: PATTERN.CHEVRON }, { along })
    // Striped comb plates where the belt starts and ends.
    for (const s of [-1, 1]) strip(0, s * (tr.h[2] + 0.18), tr.h[0], 0.18, 0.07, { top: C.hazard, side: C.hazard, end: C.hazard }, { top: PATTERN.HAZARD, end: PATTERN.HAZARD })
  } else if (tr.type === 'oil') {
    // An irregular spill: a few overlapping flat slabs.
    // Overlapping blobs, each a few millimetres higher than the last (never coplanar).
    ;[[0, 0, 1, 1], [0.35, 0.3, 0.6, 0.7], [-0.3, -0.35, 0.7, 0.55]].forEach(([dx, dz, sx, sz], k) => {
      const c = add3(add3(add3(surface, ax, dx * tr.h[0]), az, dz * tr.h[2]), ay, 0.03 + k * 0.012)
      mb.box(c, [tr.h[0] * sx, 0.01, tr.h[2] * sz], ax, ay, az, { top: C.oil, side: C.oil, end: C.oil }, {}, { skip: ['bottom'] })
    })
    // A blue-violet streak of sheen across the slick, catching the sky.
    const sheen = new Color('#33375a')
    const r = Math.SQRT1_2
    const dx = [(ax[0] + az[0]) * r, (ax[1] + az[1]) * r, (ax[2] + az[2]) * r]
    const dz = [(az[0] - ax[0]) * r, (az[1] - ax[1]) * r, (az[2] - ax[2]) * r]
    const sc = add3(add3(add3(surface, ax, -0.1 * tr.h[0]), az, 0.1 * tr.h[2]), ay, 0.09)
    mb.box(sc, [Math.min(tr.h[0], tr.h[2]) * 0.6, 0.005, 0.22], dx, ay, dz, { top: sheen, side: C.oil, end: C.oil }, {}, { skip: ['bottom'] })
  }
}

/** Box kinds drawn some other way (ribbons, tubes, the plaza furniture): collision only. */
/**
 * A map's road colours (shared/stages/<map>.meta.js `theme.track`, PALETTE keys): set on
 * the shared colour objects before a build, every key back to the Sky Docks palette
 * when the map doesn't override it.
 */
const TRACK_PALETTE_KEYS = { asphalt: 'asphalt', kerb: 'kerb', steel: 'steel', steelDark: 'steelDark', plaza: 'plaza', hazardYellow: 'hazard', gateOrange: 'gate', asphaltLine: 'line' }
function applyTrackPalette(palette) {
  for (const [key, c] of Object.entries(TRACK_PALETTE_KEYS)) C[c].set(palette[key] || PALETTE[key])
  // Kerbs: a map may give the left kerb its own colour and make both light strips
  // (`kerbGlow: 'glow'` steady, 'pulse' rippling) instead of the striped kerbs.
  C.kerbLeft.set(palette.kerbLeft || palette.kerb || PALETTE.kerb)
  KERB.pattern = palette.kerbGlow === 'pulse' ? PATTERN.PULSE : palette.kerbGlow === 'glow' ? PATTERN.GLOW : PATTERN.STRIPES
}

const UNDRAWN = new Set(['road', 'ice', 'sand', 'loop', 'curb', 'loopwall', 'garage', 'tube', 'glass', 'disc', 'bowl', 'arenawall', 'portalPost'])

/**
 * @param palette the map's road colours (`theme.track`).
 * @param zones a zoned map's zones (registry `zones`: `{ id, track }` each): every section is
 *   drawn in its own zone's road colours (`section.zone`), sections without one in `palette`.
 * @returns {{ sections: { index, geometry, triangles }[], glass: { index, geometry, triangles }[], triangles: number }}
 * `glass`: the glass tube panels of the sections that have any, for a see-through material.
 */
export function buildStageGeometry(stage, palette = {}, zones = null) {
  // Built ahead of time in the prep worker (game/prep), when it was.
  const pre = takePrebuilt('stage', stage, {})
  if (pre) return pre
  const byZone = new Map((zones || []).map((z) => [z.id, z.track || palette]))
  let painted = null
  /** Sets the shared colours to section `i`'s palette (only when it changes). */
  const paint = (i) => {
    const p = byZone.get(stage.sections[i]?.zone) || palette
    if (p === painted) return
    applyTrackPalette(p)
    painted = p
  }
  paint(0)
  const builders = stage.sections.map(() => new MeshBuilder())
  const glassBuilders = stage.sections.map(() => new MeshBuilder())
  // Roads, curbs, loops and tubes are drawn from the ribbons; their boxes are collision only.
  stage.ribbons.forEach((rib, i) => {
    paint(rib.section)
    if (rib.tube) addTube(builders[rib.section], glassBuilders[rib.section], rib, stage.ribbons[i - 1], stage.ribbons[i + 1])
    else addRibbon(builders[rib.section], rib, glassBuilders[rib.section])
  })
  for (const b of stage.boxes) {
    const mb = builders[b.section]
    if (UNDRAWN.has(b.kind)) continue
    paint(b.section)
    if (b.kind === 'rail') mb.box(b.c, b.h, b.ax, b.ay, b.az, CURB_COLORS, CURB_PATTERNS)
    else if (b.kind === 'plaza') mb.box(b.c, b.h, b.ax, b.ay, b.az, PLAZA_COLORS, PLAZA_PATTERNS)
    else if (b.kind === 'ramp' || b.kind === 'kicker') addRamp(mb, b)
    else mb.box(b.c, b.h, b.ax, b.ay, b.az, ROAD_COLORS)
  }
  for (const cp of stage.checkpoints) {
    if (cp.index === 0) continue
    // A checkpoint's gate and plaza belong to the section that starts there.
    const sec = Math.min(cp.index, builders.length - 1)
    paint(sec)
    addGate(builders[sec], cp, cp.finish)
    addPlaza(builders[sec], cp)
  }
  // The finish plaza's exit portal to the next chapter (shared/chapters.js).
  const exit = stage.exitPortal
  if (exit && builders[exit.section]) {
    paint(exit.section)
    addExitPortal(builders[exit.section], exit)
  }
  for (const r of stage.rounds || []) {
    paint(r.section)
    addRound(builders[r.section], r)
  }
  for (const b of stage.beacons || []) {
    paint(b.section)
    addBeacon(builders[b.section], b)
  }
  for (const s of stage.signs) {
    paint(s.section)
    addSignPost(builders[s.section], s)
  }
  for (const tr of stage.triggers) {
    paint(tr.section)
    addTrigger(builders[tr.section], tr)
  }

  let triangles = 0
  const sections = builders.map((mb, index) => {
    triangles += mb.triangles
    return { index, geometry: mb.build(), triangles: mb.triangles }
  })
  const glass = []
  glassBuilders.forEach((mb, index) => {
    if (mb.triangles) glass.push({ index, geometry: mb.build(), triangles: mb.triangles })
  })
  return { sections, glass, triangles }
}

/** Support pillars as instance transforms: `{ x, z, top, width }` from the stage. */
export function supportInstances(stage) {
  return stage.supports.map((s) => ({ x: s.x, z: s.z, top: s.top, width: s.width, section: s.section }))
}

