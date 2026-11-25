import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three'

import { PALETTE } from '../palette'
import { PATTERN } from '../render/worldMaterial'

/**
 * The car modelling kit (cars/carModels.js builds every car with it; Heat Run's police
 * fleet too). Parts are baked with vertex colours + `aPattern` and merged into ONE
 * geometry per car (one draw call, no textures).
 *
 * Primitives: chamfered / tapered boxes, cylinders, gems, fans (the original chunky kit),
 * plus the sculpting tools that make bodies read as real cars:
 * - `shell(spec)`: a smooth lofted body - cross-sections (rounded rectangles with
 *   tumblehome, tuck-under and a crowned / dished top) swept along Z through monotone
 *   profile curves (top line, bottom line, half-width), with wheel-arch cut-outs, shut-line
 *   grooves and per-panel colours (glass, pillars, two-tone). Smooth normals.
 * - `decal(shell, face, ...)`: a thin patch that follows a shell's surface (lamps, light
 *   bars, grilles, intakes, window trims, door handles, stripes, skirts, diffusers).
 * - `extrude(outline, ...)`: a 2D outline extruded along X (aerofoil wings, splitters, fins).
 * - `lathe(profile, ...)`: a profile revolved round an axis (exhaust tips, domes, hulls, tyres).
 *
 * `kit.lo` builds the level-of-detail version of the same car: coarser shells and decals,
 * small details skipped (helpers check it). Local frame: the car faces -Z, +X is its
 * right, the origin sits at wheel-centre height in the middle of the wheelbase.
 */

// --- palette shared by all models ---------------------------------------------------

export const DARK = '#24282e'
export const INK = '#121418'
export const RUBBER = '#1c1e22'
export const CHROME = '#d7dde3'
export const STEEL = '#8f99a4'
export const HEADLIGHT = '#fff6c8'
export const TAILLIGHT = '#ff3b3b'
export const AMBER = '#ffb020'
export const FLAME = '#ffb35a'
export const NAV_RED = '#ff3b4e'
export const NAV_GREEN = '#3dff8a'
export const WOOD = '#8b6b45'
export const WHITE = '#f4f7fb'
export const BLACK = '#16181c'
export const SMOKE = '#3a1f22'
export const HAZARD = PALETTE.hazardYellow

/** Diagonal hazard stripes (~0.14 m wide) for PATTERN.HAZARD. */
export const DIAG = [6, 6, 0]

// --- part helpers ------------------------------------------------------------------

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _s = new Vector3(1, 1, 1)
const _p = new Vector3()
const _c = new Color()
const NO_ROT = [0, 0, 0]

/** `hex` darkened (k < 1) or lightened (k > 1), as an sRGB hex string. */
export function shade(hex, k) {
  _c.set(hex).multiplyScalar(k)
  _c.r = Math.min(1, _c.r)
  _c.g = Math.min(1, _c.g)
  _c.b = Math.min(1, _c.b)
  return `#${_c.getHexString()}`
}

/** `a` blended towards `b` by t (sRGB hex strings). */
export function mix(a, b, t) {
  const ca = new Color(a)
  ca.lerp(new Color(b), t)
  return `#${ca.getHexString()}`
}

/** Bakes colour + a blank aPattern, strips uvs and flattens a part so all parts merge. */
function finish(geo, color, recomputeNormals = false) {
  let g = geo.index ? geo.toNonIndexed() : geo
  if (g !== geo) geo.dispose()
  g.deleteAttribute('uv')
  if (recomputeNormals || !g.attributes.normal) g.computeVertexNormals()
  _c.set(color)
  const n = g.attributes.position.count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i += 1) {
    colors[i * 3] = _c.r
    colors[i * 3 + 1] = _c.g
    colors[i * 3 + 2] = _c.b
  }
  g.setAttribute('color', new BufferAttribute(colors, 3))
  g.setAttribute('aPattern', new BufferAttribute(new Float32Array(n * 2), 2))
  return g
}

function place(g, x, y, z, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz)
  _q.setFromEuler(_e)
  _p.set(x, y, z)
  _m.compose(_p, _q, _s)
  g.applyMatrix4(_m)
  return g
}

/**
 * Sets a placed part's pattern: `glow` -> self-lit; `stripe: [ax, ay, az]` -> hazard
 * stripes along that car-local direction (its length sets the stripe density).
 */
function paint(g, glow, stripe) {
  if (!glow && !stripe) return
  const pat = g.attributes.aPattern.array
  const pos = g.attributes.position.array
  for (let i = 0, n = pat.length / 2; i < n; i += 1) {
    if (glow) {
      pat[i * 2] = PATTERN.GLOW
    } else {
      pat[i * 2] = PATTERN.HAZARD
      pat[i * 2 + 1] = pos[i * 3] * stripe[0] + pos[i * 3 + 1] * stripe[1] + pos[i * 3 + 2] * stripe[2]
    }
  }
}

/** A finished part from raw non-indexed arrays (positions, normals, per-vertex sRGB colours). */
export function rawPart(pos, nrm, cols, glow = false) {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3))
  g.setAttribute('aPattern', new BufferAttribute(new Float32Array((pos.length / 3) * 2), 2))
  if (glow) paint(g, true, null)
  return g
}

/** Linear colour of a hex, cached (raw parts write colours directly). */
const linCache = new Map()
export function lin(hex) {
  let c = linCache.get(hex)
  if (!c) {
    _c.set(hex)
    c = [_c.r, _c.g, _c.b]
    linCache.set(hex, c)
  }
  return c
}

/**
 * A box with every edge chamfered by `b` (44 triangles): 6 faces, 12 edge bevels and 8
 * corner facets. Non-indexed positions only; normals come from finish().
 */
function chamferBox(w, h, d, b) {
  const W = w / 2
  const H = h / 2
  const D = d / 2
  const bx = Math.min(b, W * 0.45)
  const by = Math.min(b, H * 0.45)
  const bz = Math.min(b, D * 0.45)
  const pt = (sx, sy, sz, axis) => [sx * (axis === 0 ? W : W - bx), sy * (axis === 1 ? H : H - by), sz * (axis === 2 ? D : D - bz)]
  const out = []
  const poly = (pts) => {
    const [a, b1, c] = pts
    const ux = b1[0] - a[0]
    const uy = b1[1] - a[1]
    const uz = b1[2] - a[2]
    const vx = c[0] - a[0]
    const vy = c[1] - a[1]
    const vz = c[2] - a[2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    let cx = 0
    let cy = 0
    let cz = 0
    for (const p of pts) {
      cx += p[0]
      cy += p[1]
      cz += p[2]
    }
    if (nx * cx + ny * cy + nz * cz < 0) pts.reverse()
    for (let i = 1; i < pts.length - 1; i += 1) out.push(...pts[0], ...pts[i], ...pts[i + 1])
  }
  const S = [-1, 1]
  for (const s of S) {
    poly([pt(s, -1, -1, 0), pt(s, 1, -1, 0), pt(s, 1, 1, 0), pt(s, -1, 1, 0)])
    poly([pt(-1, s, -1, 1), pt(1, s, -1, 1), pt(1, s, 1, 1), pt(-1, s, 1, 1)])
    poly([pt(-1, -1, s, 2), pt(1, -1, s, 2), pt(1, 1, s, 2), pt(-1, 1, s, 2)])
  }
  for (const s of S) {
    for (const t of S) {
      poly([pt(s, t, -1, 0), pt(s, t, 1, 0), pt(s, t, 1, 1), pt(s, t, -1, 1)])
      poly([pt(-1, s, t, 1), pt(1, s, t, 1), pt(1, s, t, 2), pt(-1, s, t, 2)])
      poly([pt(s, -1, t, 0), pt(s, 1, t, 0), pt(s, 1, t, 2), pt(s, -1, t, 2)])
      for (const u of S) poly([pt(s, t, u, 0), pt(s, t, u, 1), pt(s, t, u, 2)])
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(out), 3))
  return g
}

/**
 * Tapers a box-like part: x/z scale blends from `bottom` (at -h/2) to `top` (at +h/2),
 * and the top slides `shift` along Z.
 */
function taper(g, h, top, bottom, shift) {
  const pos = g.attributes.position
  const t0 = bottom || [1, 1]
  const t1 = top || [1, 1]
  for (let i = 0; i < pos.count; i += 1) {
    const f = Math.min(1, Math.max(0, pos.getY(i) / h + 0.5))
    const sx = t0[0] + (t1[0] - t0[0]) * f
    const sz = t0[1] + (t1[1] - t0[1]) * f
    pos.setX(i, pos.getX(i) * sx)
    pos.setZ(i, pos.getZ(i) * sz + shift * f)
  }
}

/** A flat fan in the YZ plane at `x`, facing +X (`facing` 1) or -X (-1). */
function fanGeometry(points, x, facing) {
  const out = []
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (facing > 0) out.push(x, 0, 0, x, a[0], a[1], x, b[0], b[1])
    else out.push(x, 0, 0, x, b[0], b[1], x, a[0], a[1])
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(out), 3))
  return g
}

/** Points of a regular polygon (or a star, with an inner radius) in the YZ plane. */
export function ring(count, outer, inner = outer, phase = 0) {
  const pts = []
  const n = inner === outer ? count : count * 2
  for (let i = 0; i < n; i += 1) {
    const a = phase + (i / n) * Math.PI * 2
    const r = inner !== outer && i % 2 ? inner : outer
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return pts
}

// --- curves ------------------------------------------------------------------------

/**
 * A smooth monotone curve through control points given flat: [t0, v0, t1, v1, ...]
 * (Fritsch-Carlson cubic: no overshoot between points), clamped at both ends. A plain
 * number is a constant curve. Returns f(t) with `f.knots` (the control point t's).
 */
export function curve(spec) {
  if (typeof spec === 'number') {
    const f = () => spec
    f.knots = []
    return f
  }
  if (typeof spec === 'function') return spec
  const n = spec.length / 2
  const t = []
  const v = []
  for (let i = 0; i < n; i += 1) {
    t.push(spec[i * 2])
    v.push(spec[i * 2 + 1])
  }
  const d = []
  for (let i = 0; i < n - 1; i += 1) d.push((v[i + 1] - v[i]) / Math.max(1e-6, t[i + 1] - t[i]))
  const m = new Array(n).fill(0)
  if (n > 1) {
    m[0] = d[0]
    m[n - 1] = d[n - 2]
    for (let i = 1; i < n - 1; i += 1) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
    for (let i = 0; i < n - 1; i += 1) {
      if (d[i] === 0) {
        m[i] = 0
        m[i + 1] = 0
        continue
      }
      const a = m[i] / d[i]
      const b = m[i + 1] / d[i]
      const h = a * a + b * b
      if (h > 9) {
        const k = 3 / Math.sqrt(h)
        m[i] = k * a * d[i]
        m[i + 1] = k * b * d[i]
      }
    }
  }
  const f = (x) => {
    if (n === 1 || x <= t[0]) return v[0]
    if (x >= t[n - 1]) return v[n - 1]
    let i = 0
    while (i < n - 2 && x > t[i + 1]) i += 1
    const h = t[i + 1] - t[i]
    const s = (x - t[i]) / h
    const s2 = s * s
    const s3 = s2 * s
    return (2 * s3 - 3 * s2 + 1) * v[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * v[i + 1] + (s3 - s2) * h * m[i + 1]
  }
  f.knots = t
  return f
}

// --- the lofted shell ----------------------------------------------------------------

const lerp = (a, b, t) => a + (b - a) * t

/**
 * A smooth body shell (see the module doc). Built by `kit.shell(spec)`:
 * - `top`, `bottom`, `width`: curves along Z (flat [z, v, ...] arrays or numbers): the
 *   top line (at the shoulders), the underside line and the half-width;
 * - `rt` / `rb`: corner radii top / bottom (m or curves), `tumble` (top width factor:
 *   sides lean in), `belly` (bottom width factor: tuck-under), `crown` (the top's centre
 *   raised (+) or dished (-) relative to its shoulders, m or curve);
 * - `arches: [{ z, r, y = 0 }]`: wheel cut-outs, the underside raised round each wheel;
 * - `grooves: [z, ...]`: shut lines - a thin dark band on the sides; `cuts: [z, ...]`
 *   extra stations (sharp features, colour boundaries);
 * - `color`, `under` (underside colour), `paint(q)`: per-panel colour override, `q` =
 *   { z, y, a (ring angle, degrees: 0 side, 90 top, 270 bottom), kind ('top' | 'side' |
 *   'bottom'), groove } -> colour or null;
 * - `step`: station spacing (m), `M`: corner subdivisions, `caps` (default both).
 */
export class Shell {
  constructor(spec, lo) {
    this.spec = spec
    this.lo = lo
    const top = curve(spec.top)
    const bottom = curve(spec.bottom)
    const width = curve(spec.width)
    const rt = curve(spec.rt ?? 0.14)
    const rb = curve(spec.rb ?? 0.1)
    const tumble = curve(spec.tumble ?? 0.92)
    const belly = curve(spec.belly ?? 0.94)
    const crown = curve(spec.crown ?? 0)
    const arches = spec.arches || []
    const [z0, z1] = spec.z
    this.z0 = z0
    this.z1 = z1
    this.M = lo ? 1 : (spec.M ?? 3)
    const archY = (z) => {
      let y = -Infinity
      for (const a of arches) {
        const dz = z - a.z
        if (Math.abs(dz) < a.r) y = Math.max(y, (a.y || 0) + Math.sqrt(a.r * a.r - dz * dz))
      }
      return y
    }
    this.section = (z) => {
      const y1 = top(z)
      const y0 = Math.min(y1 - 0.05, Math.max(bottom(z), archY(z)))
      return { z, hw: Math.max(0.02, width(z)), y0, y1, rt: rt(z), rb: rb(z), tumble: tumble(z), belly: belly(z), crown: crown(z) }
    }
    // Stations: uniform steps, finer at the ends, every control point, the arches and the grooves.
    const step = lo ? Math.max(0.45, (spec.step ?? 0.3) * 1.8) : (spec.step ?? 0.3)
    const zs = []
    const locked = []
    const L = z1 - z0
    for (let z = z0; z < z1 - 1e-6; z += step) zs.push(z)
    zs.push(z1)
    const ends = lo ? [0.12, 0.35] : [0.04, 0.12, 0.24, 0.4]
    for (const e of ends) {
      if (e < L / 2) {
        zs.push(z0 + e)
        zs.push(z1 - e)
      }
    }
    for (const c of [top, bottom, width, rt, rb, tumble, crown]) for (const k of c.knots) if (k > z0 && k < z1) zs.push(k)
    for (const k of spec.cuts || []) if (k > z0 && k < z1) locked.push(k)
    const angles = lo ? [-90, -35, 35, 90] : [-90, -60, -30, 0, 30, 60, 90]
    for (const a of arches) {
      for (let i = zs.length - 1; i >= 0; i -= 1) if (Math.abs(zs[i] - a.z) < a.r + 0.02) zs.splice(i, 1)
      for (const ang of angles) {
        const s = Math.sin((ang * Math.PI) / 180)
        if (Math.abs(ang) === 90) {
          locked.push(a.z + s * (a.r + 0.004))
          locked.push(a.z + s * (a.r - 0.006))
        } else {
          locked.push(a.z + s * a.r)
        }
      }
    }
    const grooveBands = []
    if (!lo) {
      for (const g of spec.grooves || []) {
        locked.push(g - 0.011, g + 0.011)
        grooveBands.push(g)
      }
    }
    const all = [...zs.map((z) => ({ z, lock: false })), ...locked.map((z) => ({ z, lock: true }))]
      .filter((s) => s.z >= z0 - 1e-6 && s.z <= z1 + 1e-6)
      .sort((a, b) => a.z - b.z)
    const minGap = lo ? 0.15 : 0.04
    const keep = []
    for (const s of all) {
      const last = keep[keep.length - 1]
      if (!last || s.z - last.z > (s.lock && last.lock ? 0.003 : minGap)) keep.push(s)
      else if (s.lock && !last.lock && last.z !== z0) keep[keep.length - 1] = s
    }
    if (keep[keep.length - 1].z < z1 - 1e-6) keep.push({ z: z1, lock: true })
    this.secs = keep.map((s) => this.section(s.z))
    this.grooves = grooveBands
  }

  /** The cross-section at z, interpolated between stations exactly as the mesh is. */
  sec(z) {
    const s = this.secs
    if (z <= s[0].z) return s[0]
    if (z >= s[s.length - 1].z) return s[s.length - 1]
    let lo = 0
    let hi = s.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (s[mid].z <= z) lo = mid
      else hi = mid
    }
    const a = s[lo]
    const b = s[hi]
    const t = (z - a.z) / Math.max(1e-6, b.z - a.z)
    return {
      z,
      hw: lerp(a.hw, b.hw, t),
      y0: lerp(a.y0, b.y0, t),
      y1: lerp(a.y1, b.y1, t),
      rt: lerp(a.rt, b.rt, t),
      rb: lerp(a.rb, b.rb, t),
      tumble: lerp(a.tumble, b.tumble, t),
      belly: lerp(a.belly, b.belly, t),
      crown: lerp(a.crown, b.crown, t),
    }
  }

  /** Radii and mid height of a section, clamped to fit. */
  static dims(s) {
    const h = s.y1 - s.y0
    let rt = Math.min(s.rt, s.hw * 0.98, h * 0.98)
    let rb = Math.min(s.rb, s.hw * 0.98, h * 0.98)
    if (rt + rb > h * 0.98) {
      const k = (h * 0.98) / (rt + rb)
      rt *= k
      rb *= k
    }
    const ym = (s.y0 + rb + s.y1 - rt) / 2
    return { rt, rb, ym }
  }

  /** Width factor (tumblehome above the middle, tuck-under below) at height y. */
  static lean(s, ym, y) {
    if (y > ym) return 1 - (1 - s.tumble) * Math.min(1, (y - ym) / Math.max(1e-3, s.y1 - ym))
    return 1 - (1 - s.belly) * Math.min(1, (ym - y) / Math.max(1e-3, ym - s.y0))
  }

  /** The ring of points [x, y, angle] for a section. */
  ring(s) {
    const M = this.M
    const { rt, rb, ym } = Shell.dims(s)
    const pts = []
    const arc = (cx, cy, r, a0) => {
      for (let i = 0; i <= M; i += 1) {
        const a = a0 + (90 * i) / M
        const ar = (a * Math.PI) / 180
        pts.push([cx + r * Math.cos(ar), cy + r * Math.sin(ar), a])
      }
    }
    arc(s.hw - rt, s.y1 - rt, rt, 0)
    pts.push([0, s.y1 + s.crown, 90])
    arc(-(s.hw - rt), s.y1 - rt, rt, 90)
    arc(-(s.hw - rb), s.y0 + rb, rb, 180)
    pts.push([0, s.y0, 270])
    arc(s.hw - rb, s.y0 + rb, rb, 270)
    for (const p of pts) p[0] *= Shell.lean(s, ym, p[1])
    return pts
  }

  /** Half-width of the surface at (z, y), or null where there is no body. */
  xAt(z, y) {
    const s = this.sec(z)
    if (y < s.y0 - 1e-4 || y > s.y1 + 1e-4) return null
    const { rt, rb, ym } = Shell.dims(s)
    let x = s.hw
    if (y > s.y1 - rt) {
      const dy = y - (s.y1 - rt)
      x = s.hw - rt + Math.sqrt(Math.max(0, rt * rt - dy * dy))
    } else if (y < s.y0 + rb) {
      const dy = s.y0 + rb - y
      x = s.hw - rb + Math.sqrt(Math.max(0, rb * rb - dy * dy))
    }
    return x * Shell.lean(s, ym, y)
  }

  /** Height of the top surface at (z, x). */
  topAt(z, x) {
    const s = this.sec(z)
    const { rt, ym } = Shell.dims(s)
    const f = Shell.lean(s, ym, s.y1)
    const xa = (s.hw - rt) * f
    const ax = Math.abs(x)
    if (ax <= xa) return s.y1 + s.crown * (1 - ax / Math.max(1e-3, xa))
    const dx = Math.min(rt, ax / f - (s.hw - rt))
    return s.y1 - rt + Math.sqrt(Math.max(0, rt * rt - dx * dx))
  }

  /** Z of the nose (dir -1) or tail (dir 1) surface at (x, y): scans in from the tip. */
  endZ(x, y, dir) {
    const ax = Math.abs(x)
    const inside = (z) => {
      const w = this.xAt(z, y)
      return w !== null && w >= ax
    }
    const start = dir < 0 ? this.z0 : this.z1
    const L = this.z1 - this.z0
    let prev = start
    for (let d = 0; d <= L * 0.6; d += 0.04) {
      const z = start - dir * d
      if (inside(z)) {
        let a = prev
        let b = z
        for (let i = 0; i < 8; i += 1) {
          const m = (a + b) / 2
          if (inside(m)) b = m
          else a = m
        }
        return b
      }
      prev = z
    }
    return null
  }

  frontZ(x, y) {
    return this.endZ(x, y, -1)
  }

  rearZ(x, y) {
    return this.endZ(x, y, 1)
  }

  /** The mesh: rings joined by quads (smooth normals, per-quad colours) and end caps. */
  build() {
    const spec = this.spec
    const secs = this.secs
    const rings = secs.map((s) => this.ring(s))
    const N = rings[0].length
    const S = rings.length
    const P = new Float32Array(S * N * 3)
    for (let i = 0; i < S; i += 1) {
      for (let j = 0; j < N; j += 1) {
        const o = (i * N + j) * 3
        P[o] = rings[i][j][0] + (this.cx || 0)
        P[o + 1] = rings[i][j][1]
        P[o + 2] = secs[i].z
      }
    }
    // Area-weighted vertex normals over the quad grid.
    const Nn = new Float32Array(S * N * 3)
    const tris = []
    const addTri = (a, b, c) => {
      const ax = P[a * 3]
      const ay = P[a * 3 + 1]
      const az = P[a * 3 + 2]
      const ux = P[b * 3] - ax
      const uy = P[b * 3 + 1] - ay
      const uz = P[b * 3 + 2] - az
      const vx = P[c * 3] - ax
      const vy = P[c * 3 + 1] - ay
      const vz = P[c * 3 + 2] - az
      const nx = uy * vz - uz * vy
      const ny = uz * vx - ux * vz
      const nz = ux * vy - uy * vx
      for (const v of [a, b, c]) {
        Nn[v * 3] += nx
        Nn[v * 3 + 1] += ny
        Nn[v * 3 + 2] += nz
      }
    }
    const color = spec.color
    const under = spec.under ?? INK
    const grooveColor = spec.groove ?? shade(color, 0.42)
    const isGroove = (za, zb) => this.grooves.some((g) => Math.abs((za + zb) / 2 - g) < 0.013 && zb - za < 0.03)
    for (let i = 0; i < S - 1; i += 1) {
      const groove = isGroove(secs[i].z, secs[i + 1].z)
      for (let j = 0; j < N; j += 1) {
        const j1 = (j + 1) % N
        const a = i * N + j
        const b = (i + 1) * N + j1
        const c = (i + 1) * N + j
        const d = i * N + j1
        addTri(a, b, c)
        addTri(a, d, b)
        let a0 = rings[i][j][2]
        let a1 = rings[i][j1][2]
        if (a1 < a0) a1 += 360
        const ang = ((a0 + a1) / 2) % 360
        const sn = Math.sin((ang * Math.PI) / 180)
        const kind = sn > 0.8 ? 'top' : sn < -0.8 ? 'bottom' : 'side'
        const y = (rings[i][j][1] + rings[i][j1][1] + rings[i + 1][j][1] + rings[i + 1][j1][1]) / 4
        const z = (secs[i].z + secs[i + 1].z) / 2
        const q = { z, y, a: ang, kind, groove, i, j, x: (rings[i][j][0] + rings[i][j1][0]) / 2 }
        let col = spec.paint ? spec.paint(q) : null
        if (!col) {
          if (kind === 'bottom') col = under
          else if (groove && kind === 'side' && y > secs[i].y0 + 0.06 && y < secs[i].y1 - 0.05) col = grooveColor
          else col = color
        }
        tris.push([a, b, c, col], [a, d, b, col])
      }
    }
    for (let v = 0; v < S * N; v += 1) {
      const l = Math.hypot(Nn[v * 3], Nn[v * 3 + 1], Nn[v * 3 + 2]) || 1
      Nn[v * 3] /= l
      Nn[v * 3 + 1] /= l
      Nn[v * 3 + 2] /= l
    }
    const pos = []
    const nrm = []
    const col = []
    for (const [a, b, c, hex] of tris) {
      const cc = lin(hex)
      for (const v of [a, b, c]) {
        pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2])
        nrm.push(Nn[v * 3], Nn[v * 3 + 1], Nn[v * 3 + 2])
        col.push(cc[0], cc[1], cc[2])
      }
    }
    // End caps: fans round each end ring's centre.
    const caps = spec.caps ?? [true, true]
    for (const [i, dir] of [
      [0, -1],
      [S - 1, 1],
    ]) {
      if (!caps[dir < 0 ? 0 : 1]) continue
      const r = rings[i]
      let cy = 0
      for (const p of r) cy += p[1] / N
      const z = secs[i].z
      const cc = lin(dir < 0 ? (spec.noseColor ?? color) : (spec.tailColor ?? color))
      for (let j = 0; j < N; j += 1) {
        const p = r[j]
        const q = r[(j + 1) % N]
        const tri = dir < 0 ? [[0, cy], q, p] : [[0, cy], p, q]
        for (const t of tri) {
          pos.push(t[0] + (this.cx || 0), t[1], z)
          nrm.push(0, 0, dir)
          col.push(cc[0], cc[1], cc[2])
        }
      }
    }
    return rawPart(pos, nrm, col)
  }
}

// --- the kit -----------------------------------------------------------------------

/** Orients a decal / patch triangle (a, b, c as [x, y, z]) to face `out`; pushes it. */
export function pushTri(pos, nrm, col, a, b, c, na, nb, nc, out, cc) {
  const ux = b[0] - a[0]
  const uy = b[1] - a[1]
  const uz = b[2] - a[2]
  const vx = c[0] - a[0]
  const vy = c[1] - a[1]
  const vz = c[2] - a[2]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const flip = nx * out[0] + ny * out[1] + nz * out[2] < 0
  const vs = flip ? [a, c, b] : [a, b, c]
  const ns = flip ? [na, nc, nb] : [na, nb, nc]
  for (let i = 0; i < 3; i += 1) {
    pos.push(vs[i][0], vs[i][1], vs[i][2])
    nrm.push(ns[i][0], ns[i][1], ns[i][2])
    col.push(cc[0], cc[1], cc[2])
  }
}

const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/**
 * Collects the parts of one model. Every helper takes a size, a centre, a colour and
 * options: rotation `r: [rx, ry, rz]`, `glow` (self-lit lamp), `stripe` (hazard bars).
 * `lo`: build the level-of-detail version (coarser, fewer details).
 */
export function createKit(lo = false) {
  const parts = []
  const push = (g, color, recompute, at, r, glow, stripe) => {
    const part = place(finish(g, color, recompute), at[0], at[1], at[2], ...r)
    paint(part, glow, stripe)
    parts.push(part)
  }
  const kit = {
    parts,
    lo,
    /**
     * A box. `top: [sx, sz]` scales the top face, `shift` slides the top face along Z,
     * `bottom` scales the bottom face, `bevel` chamfers every edge by that many metres.
     */
    box(w, h, d, x, y, z, color, { r = NO_ROT, top = null, shift = 0, bottom = null, bevel = 0, glow = false, stripe = null } = {}) {
      const g = bevel > 0 && !(lo && bevel < 0.05) ? chamferBox(w, h, d, bevel) : new BoxGeometry(w, h, d)
      const tapered = Boolean(top || shift || bottom)
      if (tapered) taper(g, h, top, bottom, shift)
      push(g, color, tapered || bevel > 0, [x, y, z], r, glow, stripe)
      return kit
    },
    /** A cylinder along `axis` ('x' | 'y' | 'z'). */
    cyl(radius, length, x, y, z, color, { axis = 'y', segs = 8, radiusTop = radius, r = null, open = false, glow = false, stripe = null } = {}) {
      const g = new CylinderGeometry(radiusTop, radius, length, lo ? Math.max(5, Math.round(segs * 0.6)) : segs, 1, open)
      let rot = r || NO_ROT
      if (!r && axis === 'x') rot = [0, 0, Math.PI / 2]
      if (!r && axis === 'z') rot = [Math.PI / 2, 0, 0]
      push(g, color, true, [x, y, z], rot, glow, stripe)
      return kit
    },
    /** A faceted gem: lamps, eyes, rivets, knobs. */
    gem(radius, x, y, z, color, scale = [1, 1, 1], { glow = false, detail = 0 } = {}) {
      const g = new IcosahedronGeometry(radius, lo ? 0 : detail)
      g.scale(...scale)
      push(g, color, true, [x, y, z], NO_ROT, glow, null)
      return kit
    },
    /** A flat polygon fan facing along X (rim faces, decals). */
    fan(points, x, facing, color) {
      push(fanGeometry(points, x, facing), color, true, [0, 0, 0], NO_ROT, false, null)
      return kit
    },
    /** The same part on both sides (mirrored in X): fn(-1) then fn(1). */
    pair(fn) {
      fn(-1)
      fn(1)
      return kit
    },
    /** Runs `fn` only for the full-detail model (small details the LOD drops). */
    fine(fn) {
      if (!lo) fn()
      return kit
    },
    /** A smooth lofted shell (see Shell); returns it for surface queries (decals, placement). */
    shell(spec) {
      const sh = new Shell(spec, lo)
      // An off-centre shell (`cx`), or a mirrored pair of them (`pair`): fenders, pods.
      for (const cx of spec.pair ? [spec.cx, -spec.cx] : [spec.cx || 0]) {
        sh.cx = cx
        parts.push(sh.build())
      }
      sh.cx = 0
      return sh
    },
    /**
     * A thin patch following a shell's surface: `face` 'front' | 'rear' (u = x, v = y),
     * 'side' (u = z, v = y; both sides unless `side` is 1 / -1) or 'top' (u = x, v = z).
     * `mirror` repeats a front / rear / top patch at -x. `off` lifts it off the surface,
     * `skew` slides v along u (slanted lamps), `taper` narrows it towards u1, `inset`
     * shrinks the v range at both u ends (rounded lamp corners), `glow` self-lit.
     * Returns the patch centre(s).
     */
    decal(sh, face, u0, u1, v0, v1, color, { off = 0.01, nu = 4, nv = 1, glow = false, side = 0, mirror = false, skew = 0, taper = 0, inset = 0 } = {}) {
      const NU = lo ? Math.max(1, Math.ceil(nu / 3)) : nu
      const NV = lo ? 1 : nv
      const cc = lin(color)
      const centres = []
      const sides = face === 'side' ? (side ? [side] : [-1, 1]) : mirror ? [1, -1] : [1]
      for (const sg of sides) {
        const grid = []
        let ok = true
        for (let iu = 0; iu <= NU && ok; iu += 1) {
          const t = iu / NU
          const u = lerp(u0, u1, t)
          const edge = Math.sin(t * Math.PI)
          const vc = (v0 + v1) / 2 + skew * t
          const vh = ((v1 - v0) / 2) * (1 - taper * t) * (inset ? 1 - inset + inset * Math.sqrt(edge) : 1)
          const row = []
          for (let iv = 0; iv <= NV; iv += 1) {
            const v = vc - vh + (2 * vh * iv) / NV
            let p = null
            // On the surface; lifted off it along the normal below.
            if (face === 'front' || face === 'rear') {
              const x = u * sg
              const z = face === 'front' ? sh.frontZ(x, v) : sh.rearZ(x, v)
              if (z !== null) p = [x, v, z]
            } else if (face === 'side') {
              const x = sh.xAt(u, v)
              if (x !== null) p = [sg * x, v, u]
            } else {
              p = [u * sg, sh.topAt(v, u * sg), v]
            }
            if (!p) {
              ok = false
              break
            }
            row.push(p)
          }
          grid.push(row)
        }
        if (!ok) continue
        const out = face === 'front' ? [0, 0, -1] : face === 'rear' ? [0, 0, 1] : face === 'side' ? [sg, 0, 0] : [0, 1, 0]
        // Vertex normals from the grid's tangents, facing out.
        const nAt = (iu, iv) => {
          const a = grid[Math.min(NU, iu + 1)][iv]
          const b = grid[Math.max(0, iu - 1)][iv]
          const c = grid[iu][Math.min(NV, iv + 1)]
          const d = grid[iu][Math.max(0, iv - 1)]
          const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
          const dv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]]
          let n = norm3([du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]])
          if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]]
          return norm3([n[0] + out[0] * 0.15, n[1] + out[1] * 0.15, n[2] + out[2] * 0.15])
        }
        const normals = grid.map((row, iu) => row.map((_, iv) => nAt(iu, iv)))
        for (let iu = 0; iu <= NU; iu += 1) {
          for (let iv = 0; iv <= NV; iv += 1) {
            const p = grid[iu][iv]
            const n = normals[iu][iv]
            grid[iu][iv] = [p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off]
          }
        }
        const pos = []
        const nrm = []
        const col = []
        for (let iu = 0; iu < NU; iu += 1) {
          for (let iv = 0; iv < NV; iv += 1) {
            const a = grid[iu][iv]
            const b = grid[iu + 1][iv]
            const c = grid[iu + 1][iv + 1]
            const d = grid[iu][iv + 1]
            const na = normals[iu][iv]
            const nb = normals[iu + 1][iv]
            const nc = normals[iu + 1][iv + 1]
            const nd = normals[iu][iv + 1]
            pushTri(pos, nrm, col, a, b, c, na, nb, nc, out, cc)
            pushTri(pos, nrm, col, a, c, d, na, nc, nd, out, cc)
          }
        }
        parts.push(rawPart(pos, nrm, col, glow))
        const ma = grid[Math.round(NU / 2)][0]
        const mb = grid[Math.round(NU / 2)][NV]
        centres.push([(ma[0] + mb[0]) / 2, (ma[1] + mb[1]) / 2, (ma[2] + mb[2]) / 2])
      }
      return centres
    },
    /**
     * A 2D outline [[z, y], ...] (convex or not, counter-clockwise or not) extruded
     * along X from x0 to x1: aerofoil wings, splitters, fins, mudguards. `r` rotates it
     * about its own centre... no: about `at`. `smooth` shades the sides smoothly.
     */
    extrude(outline, x0, x1, color, { at = [0, 0, 0], r = NO_ROT, smooth = true, glow = false, caps = true } = {}) {
      const n = outline.length
      let area = 0
      for (let i = 0; i < n; i += 1) {
        const a = outline[i]
        const b = outline[(i + 1) % n]
        area += a[0] * b[1] - b[0] * a[1]
      }
      const pts = area < 0 ? outline : [...outline].reverse()
      const pos = []
      const nrm = []
      const col = []
      const cc = lin(color)
      const en = []
      for (let i = 0; i < n; i += 1) {
        const a = pts[i]
        const b = pts[(i + 1) % n]
        // Outward normal of edge a->b in the (z, y) plane (clockwise outline: right-hand side).
        const dz = b[0] - a[0]
        const dy = b[1] - a[1]
        const l = Math.hypot(dz, dy) || 1
        en.push([-dy / l, dz / l])
      }
      const vn = pts.map((_, i) => {
        const e0 = en[(i - 1 + n) % n]
        const e1 = en[i]
        const d = e0[0] * e1[0] + e0[1] * e1[1]
        return smooth && d > 0.5 ? norm3([0, e0[1] + e1[1], e0[0] + e1[0]]) : null
      })
      for (let i = 0; i < n; i += 1) {
        const a = pts[i]
        const b = pts[(i + 1) % n]
        const fn = [0, en[i][1], en[i][0]]
        const na = vn[i] || fn
        const nb = vn[(i + 1) % n] || fn
        const A0 = [x0, a[1], a[0]]
        const A1 = [x1, a[1], a[0]]
        const B0 = [x0, b[1], b[0]]
        const B1 = [x1, b[1], b[0]]
        pushTri(pos, nrm, col, A0, B0, B1, na, nb, nb, fn, cc)
        pushTri(pos, nrm, col, A0, B1, A1, na, nb, na, fn, cc)
      }
      if (caps) {
        // Fan from the centroid (fine for the near-convex outlines used here).
        let cz = 0
        let cy = 0
        for (const p of pts) {
          cz += p[0] / n
          cy += p[1] / n
        }
        for (const [x, s] of [
          [x0, -1],
          [x1, 1],
        ]) {
          for (let i = 0; i < n; i += 1) {
            const a = pts[i]
            const b = pts[(i + 1) % n]
            pushTri(pos, nrm, col, [x, cy, cz], [x, a[1], a[0]], [x, b[1], b[0]], [s, 0, 0], [s, 0, 0], [s, 0, 0], [s, 0, 0], cc)
          }
        }
      }
      const g = rawPart(pos, nrm, col, glow)
      place(g, at[0], at[1], at[2], ...r)
      parts.push(g)
      return kit
    },
    /**
     * A profile [[radius, h], ...] revolved round `axis` through (x, y, z): smooth where
     * neighbouring segments meet at under ~60 degrees. `colors` is one colour or one per
     * segment. `segs` around.
     */
    lathe(profile, x, y, z, colors, { axis = 'y', segs = 12, glow = false, r = NO_ROT } = {}) {
      const S = lo ? Math.max(5, Math.round(segs * 0.45)) : segs
      const n = profile.length
      const pos = []
      const nrm = []
      const col = []
      // Segment normals in the (radius, h) plane.
      const sn = []
      for (let i = 0; i < n - 1; i += 1) {
        const dr = profile[i + 1][0] - profile[i][0]
        const dh = profile[i + 1][1] - profile[i][1]
        const l = Math.hypot(dr, dh) || 1
        sn.push([dh / l, -dr / l])
      }
      const vnorm = (i, seg) => {
        const own = sn[seg]
        const other = sn[i === seg ? seg - 1 : seg + 1]
        if (other && own[0] * other[0] + own[1] * other[1] > 0.5) {
          const l = Math.hypot(own[0] + other[0], own[1] + other[1]) || 1
          return [(own[0] + other[0]) / l, (own[1] + other[1]) / l]
        }
        return own
      }
      const map = (rad, h, a) => {
        const c = Math.cos(a)
        const s = Math.sin(a)
        if (axis === 'y') return [rad * c, h, rad * s]
        if (axis === 'x') return [h, rad * c, rad * s]
        return [rad * c, rad * s, h]
      }
      const mapN = (nr, nh, a) => map(nr, nh, a)
      for (let i = 0; i < n - 1; i += 1) {
        const cc = lin(Array.isArray(colors) ? colors[Math.min(i, colors.length - 1)] : colors)
        const [r0, h0] = profile[i]
        const [r1, h1] = profile[i + 1]
        const n0 = vnorm(i, i)
        const n1 = vnorm(i + 1, i)
        for (let k = 0; k < S; k += 1) {
          const a0 = (k / S) * Math.PI * 2
          const a1 = ((k + 1) / S) * Math.PI * 2
          const A = map(r0, h0, a0)
          const B = map(r0, h0, a1)
          const C = map(r1, h1, a1)
          const D = map(r1, h1, a0)
          const nA = mapN(n0[0], n0[1], a0)
          const nB = mapN(n0[0], n0[1], a1)
          const nC = mapN(n1[0], n1[1], a1)
          const nD = mapN(n1[0], n1[1], a0)
          const am = (a0 + a1) / 2
          const fo = mapN((n0[0] + n1[0]) / 2, (n0[1] + n1[1]) / 2, am)
          if (r0 > 1e-5) pushTri(pos, nrm, col, A, B, C, nA, nB, nC, fo, cc)
          if (r1 > 1e-5) pushTri(pos, nrm, col, A, C, D, nA, nC, nD, fo, cc)
        }
      }
      const g = rawPart(pos, nrm, col, glow)
      place(g, x, y, z, ...r)
      parts.push(g)
      return kit
    },
  }
  return kit
}

// --- classic details (the original kit's helpers; the police fleet uses them) --------

/**
 * Head and tail lamps in bezels at half-width `hw`: `front` / `rear` are the body's end
 * faces. Returns the lens centres { head, tail }.
 */
export function lamps(k, { hw, front, rear, y, ly = y, w = 0.28, h = 0.16, tw = 0.26, th = 0.13, bezel = DARK }) {
  const head = []
  const tail = []
  k.pair((s) => {
    k.box(w + 0.06, h + 0.06, 0.05, s * hw, y, front + 0.01, bezel)
    k.box(w, h, 0.05, s * hw, y, front - 0.015, HEADLIGHT, { glow: true })
    head.push([s * hw, y, front - 0.04])
    k.box(tw + 0.05, th + 0.05, 0.05, s * hw, ly, rear - 0.01, bezel)
    k.box(tw, th, 0.05, s * hw, ly, rear + 0.015, TAILLIGHT, { glow: true })
    tail.push([s * hw, ly, rear + 0.04])
  })
  return { head, tail }
}

/** A glowing lens in a dark bezel, facing -Z (dir -1) or +Z (dir 1). Returns its centre. */
export function lens(k, x, y, z, w, h, color, dir = -1, bezel = DARK) {
  k.box(w + 0.05, h + 0.05, 0.05, x, y, z - dir * 0.01, bezel)
  k.box(w, h, 0.05, x, y, z + dir * 0.015, color, { glow: true })
  return [x, y, z + dir * 0.04]
}

/** A grille on a face at `z` (facing -Z): frame, dark mesh and horizontal slats. */
export function grille(k, w, h, x, y, z, { slats = 3, frame = CHROME, slat = CHROME } = {}) {
  k.box(w + 0.07, h + 0.07, 0.05, x, y, z + 0.01, frame)
  k.box(w, h, 0.05, x, y, z - 0.005, INK)
  if (k.lo) return
  for (let i = 0; i < slats; i += 1) {
    const sy = y - h / 2 + ((i + 1) * h) / (slats + 1)
    k.box(w * 0.94, 0.03, 0.04, x, sy, z - 0.025, slat)
  }
}

/** Wing mirrors on stalks at half-width `x`, glass facing back. */
export function mirrors(k, x, y, z, color) {
  k.pair((s) => {
    k.box(0.12, 0.035, 0.05, s * (x - 0.06), y - 0.02, z, DARK)
    k.box(0.09, 0.11, 0.17, s * x, y, z, color, { bevel: 0.02 })
    if (!k.lo) k.box(0.07, 0.08, 0.02, s * x, y, z + 0.09, CHROME)
  })
}

/** An exhaust pipe whose open end is at `tip`, pointing along +Z (or +Y with axis 'y'). */
export function pipe(k, tip, { r = 0.07, len = 0.32, axis = 'z', color = CHROME } = {}) {
  const [x, y, z] = tip
  if (axis === 'y') {
    k.cyl(r, len, x, y - len / 2, z, color, { segs: 8 })
    k.cyl(r * 0.68, 0.03, x, y + 0.005, z, INK, { segs: 6 })
  } else {
    k.cyl(r, len, x, y, z - len / 2, color, { axis: 'z', segs: 8 })
    k.cyl(r * 0.68, 0.03, x, y, z + 0.005, INK, { axis: 'z', segs: 6 })
  }
}

/** A door seam / shut line on the side at half-width `x`: a thin, darker strip. */
export function seam(k, x, y, z, h, color, { d = 0.025, r = NO_ROT } = {}) {
  if (k.lo) return
  k.pair((s) => k.box(0.03, h, d, s * x, y, z, color, { r }))
}

/** Fenders over every wheel, so wheels sit in arches. */
export function arches(k, { x, zf, zr, y, color, w = 0.5, d = 1.05, h = 0.14 }) {
  for (const z of [zf, zr]) k.pair((s) => k.box(w, h, d, s * x, y, z, color, { top: [0.85, 0.8], bevel: 0.03 }))
}

export function bumper(k, { w, y, z, color = DARK, d = 0.22, h = 0.2, stripe = null }) {
  k.box(w, h, d, 0, y, z, color, { bevel: 0.05, stripe })
}

/** A blank number plate (no text) on the face at `z`. */
export function plate(k, y, z, dir = 1) {
  k.box(0.42, 0.13, 0.03, 0, y, z + dir * 0.01, WHITE)
}

// --- sculpted details (for shells) ---------------------------------------------------

/**
 * A greenhouse (cabin) shell: glass all round, the roof panel between `roof: [zf, zr]`
 * in `roofColor`, A / C pillars (the corners ahead of / behind the roof) and extra
 * `pillars: [z, ...]` (B pillars) in `pillar` colour, the band below `belt` in the body
 * colour. Other keys as a Shell.
 */
export function greenhouse(k, spec) {
  const { glass, roofColor, pillar = BLACK, belt = -Infinity, roof = [-Infinity, Infinity], pillars = [], bodyColor } = spec
  const pw = spec.pillarWidth ?? 0.07
  const cuts = [...(spec.cuts || []), roof[0], roof[1]]
  for (const z of pillars) cuts.push(z - pw / 2, z + pw / 2)
  const inPillar = (z) => pillars.some((p) => Math.abs(z - p) < pw / 2 + 0.002)
  return k.shell({
    ...spec,
    color: glass,
    cuts,
    paint: (q) => {
      if (q.kind === 'bottom') return INK
      if (q.y < belt) return bodyColor ?? roofColor
      const inRoof = q.z > roof[0] && q.z < roof[1]
      // The roof panel with its rounded edges; ahead of / behind it the corner strips are the A / C pillars.
      if (q.a > 38 && q.a < 142) return inRoof ? roofColor : q.kind === 'top' ? glass : (spec.aPillar ?? pillar)
      if (inPillar(q.z)) return pillar
      if (q.z < (spec.sideStart ?? -Infinity) || q.z > (spec.sideEnd ?? Infinity)) return spec.sail ?? roofColor
      return glass
    },
  })
}

/**
 * Lamps on a shell's nose (`face` 'front') or tail ('rear'), mirrored: a dark bezel and a
 * glowing lens (HEADLIGHT / TAILLIGHT turn into the night-lit lamp patterns), optional
 * `inner` (a second, dimmer lens / projector colour) and `drl` (a thin light strip under
 * or over it). `x0..x1` on the right side, `y0..y1`. Returns the lens centres.
 */
export function lampPair(k, sh, face, x0, x1, y0, y1, { color, bezel = INK, skew = 0, taper = 0, inset = 0.25, drl = null, inner = null, nu = 4, off = 0.012 } = {}) {
  const lit = color || (face === 'front' ? HEADLIGHT : TAILLIGHT)
  k.decal(sh, face, x0 - 0.025, x1 + 0.025, y0 - 0.022, y1 + 0.022, bezel, { mirror: true, skew, taper: taper * 0.8, inset, nu, off: off * 0.5 })
  const centres = k.decal(sh, face, x0, x1, y0, y1, lit, { mirror: true, skew, taper, inset, nu, off, glow: true })
  if (inner && !k.lo) {
    const w = x1 - x0
    k.decal(sh, face, x0 + w * inner.from, x0 + w * inner.to, y0 + (y1 - y0) * 0.2 + skew * inner.from, y1 - (y1 - y0) * 0.2 + skew * inner.from, inner.color, { mirror: true, nu: 2, off: off + 0.006, glow: inner.glow ?? false })
  }
  if (drl) k.decal(sh, face, drl[0], drl[1], drl[2], drl[3], lit, { mirror: true, skew: drl[4] || 0, nu, off: off + 0.002, glow: true })
  return centres.map((c) => [c[0], c[1], c[2] + (face === 'front' ? -0.03 : 0.03)])
}

/** A grille on a shell's nose: dark mesh, optional frame and horizontal bars. */
export function noseGrille(k, sh, w, y0, y1, { frame = null, bars = 0, bar = CHROME, mesh = INK, x = 0, skew = 0, inset = 0, nu = 4, mirror = false } = {}) {
  const u0 = x - w / 2
  const u1 = x + w / 2
  if (frame) k.decal(sh, 'front', u0 - 0.03, u1 + 0.03, y0 - 0.03, y1 + 0.03, frame, { nu, off: 0.006, inset, skew, mirror })
  k.decal(sh, 'front', u0, u1, y0, y1, mesh, { nu, off: 0.011, inset, skew, mirror })
  if (k.lo) return
  for (let i = 0; i < bars; i += 1) {
    const y = y0 + ((i + 1) * (y1 - y0)) / (bars + 1)
    k.decal(sh, 'front', u0 + 0.02, u1 - 0.02, y - 0.012, y + 0.012, bar, { nu, off: 0.016, skew, mirror })
  }
}

/**
 * Wing mirrors on the doors: a smooth housing on an arm, the glass facing back. `x` the
 * door surface half-width at (z, y).
 */
export function sideMirrors(k, x, y, z, color, { cap = BLACK, size = 1 } = {}) {
  const q = size
  k.pair((s) => {
    k.box(0.1 * q, 0.035, 0.07, s * (x + 0.04 * q), y - 0.035, z + 0.02, BLACK)
    k.box(0.19 * q, 0.105 * q, 0.13 * q, s * (x + 0.15 * q), y + 0.01, z, color, { bevel: 0.035 * q, top: [0.9, 0.75], bottom: [0.95, 0.9] })
    if (!k.lo) k.box(0.16 * q, 0.075 * q, 0.012, s * (x + 0.15 * q), y + 0.008, z + 0.066 * q, cap === BLACK ? '#8fa3b5' : cap)
  })
}

/**
 * A tube along a path of points [[x, y, z], ...] with radius `r` (number or one per
 * point), `segs` round, smooth; `caps` closes the ends. Roll cages, rails, tentacles.
 */
export function sweep(k, path, r, color, { segs = 6, caps = true, glow = false } = {}) {
  const S = k.lo ? Math.max(4, segs - 2) : segs
  const n = path.length
  const rad = (i) => (Array.isArray(r) ? r[i] : r)
  const tan = path.map((p, i) => {
    const a = path[Math.max(0, i - 1)]
    const b = path[Math.min(n - 1, i + 1)]
    return norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]])
  })
  // Parallel-transported frames.
  let nrm0 = Math.abs(tan[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const frames = []
  for (let i = 0; i < n; i += 1) {
    const t = tan[i]
    const d = nrm0[0] * t[0] + nrm0[1] * t[1] + nrm0[2] * t[2]
    const nn = norm3([nrm0[0] - t[0] * d, nrm0[1] - t[1] * d, nrm0[2] - t[2] * d])
    const bn = [t[1] * nn[2] - t[2] * nn[1], t[2] * nn[0] - t[0] * nn[2], t[0] * nn[1] - t[1] * nn[0]]
    frames.push([nn, bn])
    nrm0 = nn
  }
  const ringAt = (i) => {
    const [nn, bn] = frames[i]
    const p = path[i]
    const out = []
    for (let j = 0; j < S; j += 1) {
      const a = (j / S) * Math.PI * 2
      const c = Math.cos(a)
      const sn = Math.sin(a)
      const dir = [nn[0] * c + bn[0] * sn, nn[1] * c + bn[1] * sn, nn[2] * c + bn[2] * sn]
      out.push([[p[0] + dir[0] * rad(i), p[1] + dir[1] * rad(i), p[2] + dir[2] * rad(i)], dir])
    }
    return out
  }
  const rings = path.map((_, i) => ringAt(i))
  const pos = []
  const nr = []
  const col = []
  const cc = lin(color)
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = 0; j < S; j += 1) {
      const j1 = (j + 1) % S
      const a = rings[i][j]
      const b = rings[i][j1]
      const c = rings[i + 1][j1]
      const d = rings[i + 1][j]
      const out = norm3([a[1][0] + c[1][0], a[1][1] + c[1][1], a[1][2] + c[1][2]])
      pushTri(pos, nr, col, a[0], b[0], c[0], a[1], b[1], c[1], out, cc)
      pushTri(pos, nr, col, a[0], c[0], d[0], a[1], c[1], d[1], out, cc)
    }
  }
  if (caps) {
    for (const [i, sgn] of [
      [0, -1],
      [n - 1, 1],
    ]) {
      const t = tan[i]
      const o = [t[0] * sgn, t[1] * sgn, t[2] * sgn]
      for (let j = 0; j < S; j += 1) pushTri(pos, nr, col, path[i], rings[i][j][0], rings[i][(j + 1) % S][0], o, o, o, o, cc)
    }
  }
  k.parts.push(rawPart(pos, nr, col, glow))
}

/** A straight tube from a to b. */
export function tube(k, a, b, r, color, opts) {
  sweep(k, [a, b], r, color, opts)
}

/**
 * A paint() rule for a band of `color` round each wheel arch's edge (cladding / flares),
 * `w` wide, on the sides below `maxY`.
 */
export function archBand(wheels, ar, color, { w = 0.1, archY = 0 } = {}) {
  return (q) => {
    if (q.kind !== 'side') return null
    for (const z of [wheels.zf, wheels.zr]) {
      const dz = Math.abs(q.z - z)
      if (dz > ar + w) continue
      const edge = dz < ar ? archY + Math.sqrt(ar * ar - dz * dz) : -Infinity
      if (q.y < Math.max(edge, archY - 0.4) + w) return color
    }
    return null
  }
}

/** A flat disc (roundel, badge-less hub, porthole) on a shell's side at (z, y). */
export function roundel(k, sh, z, y, r, color, { off = 0.01, side = 0 } = {}) {
  for (const s of side ? [side] : [-1, 1]) {
    const x = sh.xAt(z, y)
    if (x === null) continue
    k.cyl(r, 0.012, s * (x + off), y, z, color, { axis: 'x', segs: 16 })
  }
}

/** Exhaust tips at `tips` (open ends facing +Z): chrome / dark lathe with a sooty inside. */
export function tailpipes(k, tips, { r = 0.055, len = 0.16, color = CHROME } = {}) {
  for (const [x, y, z] of tips) {
    k.lathe(
      [
        [r * 0.75, -len],
        [r, -len * 0.6],
        [r, 0],
        [r * 0.78, 0],
        [r * 0.7, -len * 0.5],
      ],
      x,
      y,
      z,
      [color, color, color, INK],
      { axis: 'z', segs: 9, r: [0, 0, 0] },
    )
  }
  return tips
}

/**
 * A rear wing: an aerofoil (chord along Z, `span` across) at height `y` over `z`, on two
 * stands down to the deck at `deckY`, with end plates. `angle` pitches the blade.
 */
export function rearWing(k, { span, chord, y, z, deckY, color, stand = BLACK, plates = BLACK, angle = 0.12, thick = 0.06, standX = 0.45, swan = false }) {
  const c = chord
  const t = thick
  const foil = [
    [-c / 2, 0],
    [-c * 0.35, t * 0.7],
    [0, t],
    [c * 0.35, t * 0.75],
    [c / 2, t * 0.25],
    [c / 2, 0],
    [0, -t * 0.12],
  ]
  k.extrude(k.lo ? [foil[0], foil[2], foil[4], foil[5]] : foil, -span / 2, span / 2, color, { at: [0, y, z], r: [angle, 0, 0] })
  k.pair((s) => {
    if (swan) {
      // Swan-neck stands hang the blade from above.
      k.box(0.04, y - deckY + 0.08, 0.16, s * standX, (y + deckY) / 2 + 0.06, z - c * 0.05, stand, { r: [-0.25, 0, 0], bevel: 0.012 })
    } else {
      k.box(0.04, y - deckY, 0.16, s * standX, (y + deckY) / 2, z + c * 0.05, stand, { bevel: 0.012 })
    }
    k.extrude(
      [
        [-c * 0.62, -0.1],
        [c * 0.55, -0.12],
        [c * 0.6, t + 0.08],
        [-c * 0.45, t + 0.1],
      ],
      s * (span / 2) - 0.012,
      s * (span / 2) + 0.012,
      plates,
      { at: [0, y, z], r: [angle * 0.5, 0, 0], smooth: false },
    )
  })
}

/** Dark wheel houses between the wheels (nothing to see through an arch); `tops` per axle. */
export function wheelWells(k, w, { depth = 0.9, tops = null } = {}) {
  const inner = Math.max(0.2, w.x - w.width / 2 - 0.02)
  ;[w.zf, w.zr].forEach((z, i) => {
    const t = tops ? tops[i] : w.radius + 0.06
    const b = -w.radius * 0.55
    k.box(inner * 2, t - b, Math.min(depth, w.radius * 2.1), 0, (t + b) / 2, z, INK)
  })
}

/**
 * A road car's body: the lower shell (wheel arches cut round `wheels`, `gap` over the
 * tyre), dark wheel wells and, with `cabin`, a greenhouse (see greenhouse()). `P` takes
 * the Shell keys (z, top, bottom, width, rt, rb, tumble, belly, crown, grooves, cuts,
 * paint, step) plus `wheels`, `gap`, `archY`. Returns { sh, gh }.
 */
export function roadBody(k, c, P) {
  const w = P.wheels
  const ar = w.radius + (P.gap ?? 0.07)
  const sh = k.shell({
    ...P,
    color: P.color ?? c.body,
    arches: P.arches ?? [
      { z: w.zf, r: ar, y: P.archY ?? 0 },
      { z: w.zr, r: ar, y: P.archY ?? 0 },
    ],
  })
  if (P.wells !== false) {
    // Dark wheel houses inside the body, clipped to it (top under the bonnet, bottom at the sills, ends inside the shell).
    const inner = Math.max(0.2, w.x - w.width / 2 - 0.02)
    for (const z of [w.zf, w.zr]) {
      const z0 = Math.max(z - w.radius * 1.05, sh.z0 + 0.12)
      const z1 = Math.min(z + w.radius * 1.05, sh.z1 - 0.12)
      // Under the lowest point of the bonnet / deck over the whole box (crowned or dished).
      let top = ar + (P.archY ?? 0) - 0.02
      for (let i = 0; i <= 4; i += 1) {
        const sc = sh.sec(z0 + ((z1 - z0) * i) / 4)
        top = Math.min(top, sc.y1 + Math.min(0, sc.crown) - 0.07)
      }
      const bot = Math.max(sh.sec(z - ar - 0.04).y0, sh.sec(z + ar + 0.04).y0) + 0.03
      if (top - bot > 0.05 && z1 - z0 > 0.1) k.box(inner * 2, top - bot, z1 - z0, 0, (top + bot) / 2, (z0 + z1) / 2, INK)
    }
  }
  let gh = null
  if (P.cabin) gh = greenhouse(k, { glass: c.glass, roofColor: c.body, bodyColor: c.body, ...P.cabin })
  return { sh, gh }
}

/** Door handles: small dark / chrome patches on both sides at each z. */
export function handles(k, sh, zs, y, color = CHROME) {
  if (k.lo) return
  for (const z of zs) k.decal(sh, 'side', z - 0.07, z + 0.07, y - 0.018, y + 0.018, color, { nu: 1, off: 0.012 })
}

/** A blank number plate on a shell's nose / tail: white with a dark border. */
export function plateOn(k, sh, face, y, w = 0.46, h = 0.12) {
  if (k.lo) return
  k.decal(sh, face, -w / 2 - 0.015, w / 2 + 0.015, y - h / 2 - 0.015, y + h / 2 + 0.015, INK, { nu: 2, off: 0.008 })
  k.decal(sh, face, -w / 2, w / 2, y - h / 2, y + h / 2, WHITE, { nu: 2, off: 0.013 })
}

/** A torus (life rings, rope coils, rails): ring radius R, tube radius r, round `axis`. */
export function torus(k, R, r, x, y, z, color, { axis = 'y', segs = 10, tubeSegs = 5, rot } = {}) {
  const prof = []
  const n = k.lo ? 4 : tubeSegs
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * Math.PI * 2
    prof.push([R + Math.cos(a) * r, Math.sin(a) * r])
  }
  k.lathe(prof, x, y, z, color, { axis, segs, r: rot })
}

/** A spare / show tyre: dark tyre with a hub in `hub` colour, round `axis`. */
export function tyre(k, R, w, x, y, z, hub, { axis = 'z', rot } = {}) {
  const h = w / 2
  k.lathe(
    [
      [R * 0.6, -h * 0.9],
      [R * 0.95, -h],
      [R, -h * 0.6],
      [R, h * 0.6],
      [R * 0.95, h],
      [R * 0.6, h * 0.9],
      [R * 0.6, -h * 0.9],
    ],
    x,
    y,
    z,
    [SIDEWALL_K, RUBBER, RUBBER, RUBBER, SIDEWALL_K, hub],
    { axis, segs: 14, r: rot },
  )
  k.lathe(
    [
      [R * 0.6, h * 0.9],
      [R * 0.3, h * 0.95],
      [0, h],
    ],
    x,
    y,
    z,
    hub,
    { axis, segs: 10, r: rot },
  )
}
const SIDEWALL_K = '#2a2d33'

/**
 * A round lamp in a housing facing -Z (dir -1) or +Z (1): lathed bullet / cup with a
 * glowing lens. Returns the lens centre.
 */
export function roundLamp(k, x, y, z, r, color, { dir = -1, housing = CHROME, depth = 0.12, cup = false } = {}) {
  const d = depth
  const prof = cup
    ? [
        [r * 1.15, 0],
        [r * 1.12, d * 0.4],
        [r * 0.7, d],
        [0, d * 1.05],
      ]
    : [
        [r * 1.12, 0],
        [r * 1.1, d * 0.35],
        [r * 0.75, d * 0.85],
        [0, d * 1.1],
      ]
  // Profile h runs backwards from the lens plane (h = 0) along -dir (reversed for +Z so it faces out).
  const pts = prof.map(([rr, h]) => [rr, -dir * h])
  if (dir > 0) pts.reverse()
  k.lathe(
    pts,
    x,
    y,
    z,
    housing,
    { axis: 'z', segs: 10 },
  )
  k.lathe(dir < 0 ? [[0, 0], [r, 0]] : [[r, 0], [0, 0]], x, y, z + dir * 0.006, color, { axis: 'z', segs: 12, glow: true })
  return [x, y, z + dir * 0.03]
}

/** A rounded bar across X (bumpers, nerf bars): `d` deep, `h` tall, centred at (z, y). */
export function bar(k, x0, x1, z, y, d, h, color, { r = [0, 0, 0] } = {}) {
  const a = d / 2
  const b = h / 2
  const c = Math.min(a, b) * 0.55
  k.extrude(
    [
      [-a, -b + c],
      [-a + c, -b],
      [a - c, -b],
      [a, -b + c],
      [a, b - c],
      [a - c, b],
      [-a + c, b],
      [-a, b - c],
    ],
    x0,
    x1,
    color,
    { at: [0, y, z], r },
  )
}

/** First non-null of several paint() rules. */
export const paints =
  (...fns) =>
  (q) => {
    for (const f of fns) {
      const c = f && f(q)
      if (c) return c
    }
    return null
  }
