import { Matrix4, Quaternion, Vector3, Color } from 'three'

import { footprintDistance, stageFootprints } from '@shared/track'

import { MeshBuilder } from '../../render/meshBuilder'
import { PATTERN as P } from '../../render/worldMaterial'
import { rng } from '../harbourGeometry'
import { takePrebuilt } from '../../prep/prebuilt'

/**
 * The Grand Tour's Snowy Mountain as plain geometry (no React, no GPU), laid out from the
 * stage's snow zone (a zoneView: the whole stage plus `zone` and `decor`), deterministic:
 *
 * - The mountain: a low-poly heightfield (GRID m cells) round the zone's roads. Its shape:
 *   the roads' own heights spread out (inverse-distance weighted), so every road runs along
 *   a mountainside, with ridged peaks rising away from the roads and the whole range
 *   falling to the sea at its edges and towards the other zones (no mountain under the
 *   city). Then it is CAPPED under every road of the map (CLEAR m under the surface out to
 *   EDGE m past the road's edge, rising at most SLOPE beyond: cuts and embankments), under
 *   plazas, round platforms and the frozen lake, and checked again triangle by triangle
 *   along every road so no triangle pokes through a road. Snow on the gentle slopes, rock
 *   on the steep ones and low down.
 * - Pines: snow-capped low-poly firs scattered on the gentle slopes, clear of every road
 *   (instance matrices in 120 m tiles: the scenery draws only the ones near the car).
 * - Set pieces: the ski village (timber chalets round the zone's first plaza, more along
 *   the way), the cable car (pylons, cables; the gondolas are instanced and move), frozen
 *   waterfalls in the Icicle Gorge, the arch of the ice cave, the frozen lake round the
 *   lake crossing, and the observatory on the summit (the zone's last plaza).
 *
 * All on the shared world material, one geometry per TILE x TILE cells of terrain (with the
 * set pieces in it), culled by distance. `heightAt(x, z)` gives the drawn terrain height.
 */

const GRID = 18
const TILE = 12
const MARGIN = 460
const CLEAR = 2.6
const EDGE = 2.5
const SLOPE = 1.0
const SEA = -18

const col = (hex) => new Color(hex)
const C = {
  snow: col('#e8eef5'),
  snowShade: col('#dce5ef'),
  rock: col('#6a7079'),
  rockLight: col('#7d838c'),
  rockDark: col('#4f545c'),
  ice: col('#cdeefc'),
  iceDeep: col('#8fd0f0'),
  iceGlow: col('#a8ecff'),
  lake: col('#bfe2f2'),
  needle: col('#2f5a45'),
  needleLight: col('#3c6d53'),
  trunk: col('#5b3f29'),
  timber: col('#8b5a36'),
  timberDark: col('#5e3b22'),
  stone: col('#8a8f96'),
  roofEdge: col('#6e2b26'),
  steel: col('#9aa4ad'),
  steelDark: col('#59626b'),
  yellow: col('#ffc41f'),
  white: col('#f4f7fb'),
  dome: col('#cfd6dd'),
  slit: col('#2a3038'),
  red: col('#e2453b'),
  lamp: col('#ffd890'),
  gondola: col('#d8322b'),
  glass: col('#26323e'),
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
  for (const p of points) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`
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
          const l = g.get(`${cx + i},${cz + j}`)
          if (l) for (const p of l) fn(p)
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

/** An oriented box between two points, `t` thick (beams, cables, struts). */
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
function cone(mb, x, z, y0, y1, r0, r1, n, color, pattern = 0, phase = 0) {
  for (let i = 0; i < n; i += 1) {
    const a0 = phase + (i / n) * Math.PI * 2
    const a1 = phase + ((i + 1) / n) * Math.PI * 2
    const am = (a0 + a1) / 2
    const out = [Math.cos(am), 0.3, Math.sin(am)]
    const p0 = [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0]
    const p1 = [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0]
    if (r1 <= 0.001) face(mb, [p0, p1, [x, y1, z]], out, color, pattern)
    else face(mb, [p0, p1, [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1], [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1]], out, color, pattern)
  }
}

// ---- The mountain ----------------------------------------------------------------------

const layouts = new WeakMap()

/**
 * Where everything goes (cached per zone view): the terrain heights (capped and checked),
 * `heightAt`, the pines, the set pieces' placements.
 */
export function snowLayout(view) {
  if (layouts.has(view)) return layouts.get(view)
  const { zone } = view
  const path = view.path
  const inZone = (p) => p.section >= zone.from && p.section <= zone.to
  const zs = path.filter(inZone)
  const decor = view.decor || {}
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
  x0 = Math.floor((x0 - MARGIN) / GRID) * GRID
  z0 = Math.floor((z0 - MARGIN) / GRID) * GRID
  const nx = Math.ceil((x1 + MARGIN - x0) / GRID) + 1
  const nz = Math.ceil((z1 + MARGIN - z0) / GRID) + 1
  x1 = x0 + (nx - 1) * GRID
  z1 = z0 + (nz - 1) * GRID

  const zsub = zs.filter((p, i) => i % 3 === 0)
  const osub = path.filter((p, i) => !inZone(p) && i % 3 === 0 && p.x > x0 - 700 && p.x < x1 + 700 && p.z > z0 - 700 && p.z < z1 + 700)
  const zGrid = grid(zsub, 100)
  const oGrid = grid(osub, 120)
  const all = grid(path.filter((p) => p.x > x0 - 200 && p.x < x1 + 200 && p.z > z0 - 200 && p.z < z1 + 200), 40)

  // Path index ranges with their own cap slope: the cave's walls hug its arch, the gorge's are steep.
  const steep = new Map()
  for (const rg of decor.caves || []) for (let i = rg.from - 6; i <= rg.to + 6; i += 1) steep.set(i, 2.6)
  for (const rg of decor.falls || []) for (let i = rg.from; i <= rg.to; i += 1) if (!steep.has(i)) steep.set(i, 1.8)
  const fps = stageFootprints(view)
  // The frozen lake: an ellipse round the lake crossing, at its own level.
  const lakes = (decor.lakes || []).map((rg) => {
    const a = path[rg.from]
    const b = path[rg.to]
    const f = [b.x - a.x, b.z - a.z]
    const L = Math.hypot(f[0], f[1]) || 1
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y: Math.min(a.y, b.y) - 0.45, fx: f[0] / L, fz: f[1] / L, ra: L / 2 + 46, rb: 64 }
  })
  const lakeDist = (lk, x, z) => {
    const dx = x - lk.x
    const dz = z - lk.z
    const u = (dx * lk.fx + dz * lk.fz) / lk.ra
    const v = (dx * -lk.fz + dz * lk.fx) / lk.rb
    return (Math.hypot(u, v) - 1) * Math.min(lk.ra, lk.rb)
  }

  const H = new Float32Array(nx * nz)
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
      oGrid.near(x, z, 600, (p) => {
        dO = Math.min(dO, (p.x - x) ** 2 + (p.z - z) ** 2)
      })
      dO = Math.sqrt(dO)
      let h = SEA
      if (ws > 0) {
        const ridge = 1 - Math.abs(2 * fbm(x / 430, z / 430) - 1)
        const peaks = ridge * ridge * 300 * smooth(30, 320, dS)
        const bumps = (fbm(x / 70, z / 70) - 0.5) * 14 * smooth(10, 60, dS)
        const nat = wy / ws - 9 + peaks + bumps
        const f = (1 - smooth(140, MARGIN - 20, dS)) * smooth(40, 280, dO - dS)
        h = SEA + (nat - SEA) * f
      }
      // Caps: under every road of the map (cuts and embankments), plazas, platforms, the lake.
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
      for (const lk of lakes) cap = Math.min(cap, lk.y - 1.6 + Math.max(0, lakeDist(lk, x, z) + 4) * 0.7)
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
    // u >= v: triangle (a, b, d); else (a, d, c).
    return c.u >= c.v ? [a, b, d, 1 - c.u, c.u - c.v, c.v] : [a, d, cc, 1 - c.v, c.u, c.v - c.u]
  }
  const heightAt = (x, z) => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return SEA
    const [a, b, d, wa, wb, wd] = tri(cellOf(x, z))
    return H[a] * wa + H[b] * wb + H[d] * wd
  }
  /** Lowers the triangle under (x, z) until it is at most `top` there. */
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
  // The triangle-by-triangle check: across every road (and a little past its edges), every
  // plaza and platform, and the lake.
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
  for (const lk of lakes) for (let dx = -lk.ra - 6; dx <= lk.ra + 6; dx += 6) for (let dz = -lk.ra - 6; dz <= lk.ra + 6; dz += 6) if (lakeDist(lk, lk.x + dx, lk.z + dz) < 3) probes.push([lk.x + dx, lk.z + dz, lk.y - 0.35])
  for (let pass = 0; pass < 6; pass += 1) {
    let n = 0
    for (const [x, z, top] of probes) if (press(x, z, top)) n += 1
    if (!n) break
  }

  const out = { x0, z0, x1, z1, nx, nz, H, heightAt, lakes, zs, all, fps }
  out.trees = placeTrees(view, out)
  layouts.set(view, out)
  return out
}

/** Pines on the gentle snow slopes, clear of every road, plaza and the lake: `{ x, y, z, s, rot }`. */
function placeTrees(view, L) {
  const rand = rng(4242)
  const trees = []
  const { x0, z0, x1, z1, heightAt, all, fps, lakes } = L
  const STEP = 13
  for (let z = z0 + STEP; z < z1 - STEP; z += STEP) {
    for (let x = x0 + STEP; x < x1 - STEP; x += STEP) {
      const tx = x + (rand() - 0.5) * STEP * 0.9
      const tz = z + (rand() - 0.5) * STEP * 0.9
      const keep = rand()
      const s = 0.75 + rand() * 0.6
      const rot = rand() * Math.PI * 2
      // Clumps: forest where a low-frequency noise says so.
      if (fbm(tx / 160 + 40, tz / 160 - 13) < 0.47 || keep < 0.25) continue
      const h = heightAt(tx, tz)
      if (h < 25) continue
      const gx = heightAt(tx + 4, tz) - heightAt(tx - 4, tz)
      const gz = heightAt(tx, tz + 4) - heightAt(tx, tz - 4)
      if (Math.hypot(gx, gz) / 8 > 0.62) continue
      const top = h + 10 * s
      let ok = true
      all.near(tx, tz, 40, (p) => {
        if (!ok) return
        const d = Math.hypot(p.x - tx, p.z - tz) - p.w / 2
        if (d < 6 || (d < 16 && p.y > h - 4 && p.y - 1.5 < top + 1)) ok = false
      })
      if (!ok) continue
      if (fps.some((fp) => Math.abs(fp.x - tx) < 120 && Math.abs(fp.z - tz) < 120 && footprintDistance(fp, tx, tz) < 8)) continue
      if (lakes.some((lk) => Math.hypot(lk.x - tx, lk.z - tz) < lk.ra + 12)) continue
      trees.push({ x: tx, y: h - 0.3, z: tz, s, rot, keep })
    }
  }
  return trees
}

// ---- Pines -------------------------------------------------------------------------------

/** A snow-capped fir, ~10 m tall at scale 1 (three tiers, green below, snow on top; ~53 triangles). */
export function treeGeometry() {
  const mb = new MeshBuilder()
  const n = 5
  obox(mb, 0, 0, [1, 0, 0], [0, 0, 1], 0.32, 0.32, -0.3, 1.8, C.trunk, {}, ['bottom', 'top'])
  for (let k = 0; k < 3; k += 1) {
    const y0 = 1.3 + k * 2.5
    const r0 = 3.1 - k * 0.8
    const yS = y0 + 2.0
    const rS = r0 * 0.42
    cone(mb, 0, 0, y0, yS, r0, rS, n, k % 2 ? C.needleLight : C.needle, 0, k * 0.6)
    cone(mb, 0, 0, yS, y0 + 3.6, rS, 0, n, C.snow, P.SNOW, k * 0.6)
  }
  return mb.build()
}

/** Instance matrices of `trees`, grouped in 120 m tiles: `[{ x, z, matrices: Float32Array, count }]`. */
export function treeTiles(trees, density) {
  const tiles = new Map()
  const m = new Matrix4()
  const q = new Quaternion()
  const p = new Vector3()
  const s = new Vector3()
  const up = new Vector3(0, 1, 0)
  for (const t of trees) {
    if (t.keep > 0.25 + 0.75 * Math.min(1, density)) continue
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

/** A timber chalet on a stone footing (gable roof under snow, chimney), base at y, facing `f`. */
function chalet(mb, x, y, z, f, w, d, h) {
  const r = [-f[2], 0, f[0]]
  obox(mb, x, z, r, f, w / 2 + 0.3, d / 2 + 0.3, y - 7, y + 0.8, C.stone, {}, ['bottom'])
  obox(mb, x, z, r, f, w / 2, d / 2, y + 0.8, y + h, { top: C.timber, side: C.timber, end: C.timber, bottom: C.timber }, { side: P.FACADE, end: P.FACADE }, ['bottom', 'top'])
  // Gable roof along f: ridge h + w * 0.42 up, eaves out 0.8 m.
  const ey = y + h
  const ry = ey + w * 0.42
  const P4 = (sr, sf, yy) => [x + r[0] * sr + f[0] * sf, yy, z + r[2] * sr + f[2] * sf]
  const W = w / 2 + 0.8
  const D = d / 2 + 0.6
  for (const s of [-1, 1]) {
    const slope = [r[0] * s * 0.42, 1, r[2] * s * 0.42]
    face(mb, [P4(s * W, -D, ey - 0.3), P4(s * W, D, ey - 0.3), P4(0, D, ry), P4(0, -D, ry)], slope, C.snow, P.SNOW)
    face(mb, [P4(s * W, -D, ey - 0.3), P4(s * W, D, ey - 0.3), P4(s * W, D, ey - 0.65), P4(s * W, -D, ey - 0.65)], [r[0] * s, 0, r[2] * s], C.roofEdge)
    // Gable ends (timber triangles) and the roof's undersides.
    face(mb, [P4(-w / 2, s * (d / 2), ey), P4(w / 2, s * (d / 2), ey), P4(0, s * (d / 2), ry - 0.35)], [f[0] * s, 0, f[2] * s], C.timberDark)
    face(mb, [P4(s * W, -D, ey - 0.65), P4(s * W, D, ey - 0.65), P4(0, D, ry - 0.4), P4(0, -D, ry - 0.4)], [-r[0] * s * 0.4, -1, -r[2] * s * 0.4], C.timberDark)
  }
  // Chimney.
  const cx = x + r[0] * w * 0.22 + f[0] * d * 0.2
  const cz = z + r[2] * w * 0.22 + f[2] * d * 0.2
  obox(mb, cx, cz, r, f, 0.55, 0.55, ey + w * 0.2, ry + 1.4, C.stone, {}, ['bottom'])
}

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

/** The ski village round the zone's first plaza, and a chalet now and then along the roads. */
function village(view, L, place) {
  const rand = rng(909)
  const cp = view.checkpoints[view.zone.from]
  const spots = []
  if (cp && cp.length) {
    const f = [-Math.sin(cp.yaw), 0, -Math.cos(cp.yaw)]
    const r = [-f[2], 0, f[0]]
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k += 1) {
        for (const row of [0, 1]) {
          const along = 6 + k * 15 + rand() * 4
          const out = cp.width / 2 + 9 + row * 16 + rand() * 4
          spots.push({ x: cp.x + f[0] * along + r[0] * out * side, z: cp.z + f[2] * along + r[2] * out * side, f: [r[0] * -side, 0, r[2] * -side] })
        }
      }
    }
  }
  // Along the way: now and then a chalet a little off the road.
  let next = 300
  for (const p of L.zs) {
    if (p.s < next || p.air) continue
    next = p.s + 260 + rand() * 200
    const r = rightOfSample(p)
    const side = rand() < 0.5 ? -1 : 1
    const off = p.w / 2 + 18 + rand() * 14
    spots.push({ x: p.x + r[0] * off * side, z: p.z + r[2] * off * side, f: [-r[0] * side, 0, -r[2] * side] })
  }
  for (const s of spots) {
    const w = 7 + rand() * 3
    const d = 8 + rand() * 4
    const h = 4.5 + rand() * 2
    const y = L.heightAt(s.x, s.z)
    if (y < 20 || !clearOfRoads(L, s.x, s.z, Math.hypot(w, d) / 2 + 1, y - 2, y + h + w * 0.42 + 2)) continue
    chalet(place(s.x, s.z), s.x, y, s.z, s.f, w, d, h)
  }
}

/** A cable-car pylon: four steel legs tapering to a head with a cross-arm for two cables. */
function pylon(mb, x, y0, z, top, a) {
  const r = [Math.cos(a), 0, Math.sin(a)]
  const f = [-r[2], 0, r[0]]
  const at = (sr, sf, y, k) => [x + (r[0] * sr + f[0] * sf) * k, y, z + (r[2] * sr + f[2] * sf) * k]
  const legs = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
  for (const [sr, sf] of legs) beam(mb, at(sr, sf, y0 - 4, 2.6), at(sr, sf, top, 0.9), 0.45, C.steel)
  for (const yy of [0.33, 0.66]) {
    const y = y0 + (top - y0) * yy
    const k = 2.6 + (0.9 - 2.6) * yy
    for (let e = 0; e < 4; e += 1) beam(mb, at(legs[e][0], legs[e][1], y, k), at(legs[(e + 1) % 4][0], legs[(e + 1) % 4][1], y, k), 0.25, C.steelDark)
  }
  obox(mb, x, z, r, f, 4.2, 0.6, top, top + 0.8, { top: C.yellow, side: C.yellow, end: C.steelDark, bottom: C.steelDark })
  for (const s of [-1, 1]) obox(mb, x + r[0] * 3.6 * s, z + r[2] * 3.6 * s, r, f, 0.45, 0.9, top + 0.8, top + 1.6, C.steelDark, {}, ['bottom'])
  obox(mb, x, z, r, f, 0.25, 0.25, top + 0.8, top + 2.4, C.red, { top: P.PULSE, side: P.PULSE, end: P.PULSE }, ['bottom'])
}

/**
 * The cable car: a line of pylons beside the roads from the village up the mountain (every
 * ~300 m of road, off to whichever side is clear), pylon tops raised until each span clears
 * the ground and the roads by 12 m. Returns the cable line (for the gondolas).
 */
function cableCar(view, L, place) {
  const pts = []
  let next = 120
  for (const p of L.zs) {
    if (p.s < next || p.air) continue
    const r = rightOfSample(p)
    for (const side of [1, -1]) {
      const off = p.w / 2 + 34
      const x = p.x + r[0] * off * side
      const z = p.z + r[2] * off * side
      const y = L.heightAt(x, z)
      if (y < 10 || !clearOfRoads(L, x, z, 4, y - 2, y + 40, 12)) continue
      pts.push({ x, z, y, top: Math.max(y + 24, p.y + 16) })
      next = p.s + 300
      break
    }
    if (pts.length >= 12) break
  }
  if (pts.length < 3) return null
  // Raise tops so the straight cable between neighbours clears ground and roads.
  for (let pass = 0; pass < 4; pass += 1) {
    for (let k = 0; k < pts.length - 1; k += 1) {
      const a = pts[k]
      const b = pts[k + 1]
      let need = 0
      for (let t = 0.05; t < 1; t += 0.05) {
        const x = a.x + (b.x - a.x) * t
        const z = a.z + (b.z - a.z) * t
        const y = a.top + (b.top - a.top) * t
        let floor = L.heightAt(x, z) + 12
        L.all.near(x, z, 30, (p) => {
          if (Math.hypot(p.x - x, p.z - z) < p.w / 2 + 6) floor = Math.max(floor, p.y + 12)
        })
        need = Math.max(need, floor - y)
      }
      if (need > 0) {
        a.top += need
        b.top += need
      }
    }
  }
  const line = []
  pts.forEach((p, k) => {
    const n = pts[Math.min(pts.length - 1, k + 1)]
    const prev = pts[Math.max(0, k - 1)]
    const a = Math.atan2(n.z - prev.z, n.x - prev.x) + Math.PI / 2
    pylon(place(p.x, p.z), p.x, p.y, p.z, p.top, a)
    line.push([p.x, p.top + 1.6, p.z, a])
  })
  // Two cables (up and down lines) 3.6 m either side of the pylon heads.
  for (let k = 0; k < line.length - 1; k += 1) {
    const [ax, ay, az, aa] = line[k]
    const [bx, by, bz, ba] = line[k + 1]
    for (const s of [-1, 1]) {
      const pa = [ax + Math.cos(aa) * 3.6 * s, ay, az + Math.sin(aa) * 3.6 * s]
      const pb = [bx + Math.cos(ba) * 3.6 * s, by, bz + Math.sin(ba) * 3.6 * s]
      beam(place((ax + bx) / 2, (az + bz) / 2), pa, pb, 0.14, C.steelDark)
    }
  }
  return line
}

/** A gondola cabin (instanced), origin at the cable: hanger arm and a red cabin with windows. */
export function gondolaGeometry() {
  const mb = new MeshBuilder()
  const r = [1, 0, 0]
  const f = [0, 0, 1]
  obox(mb, 0, 0, r, f, 0.12, 0.12, -2.6, 0, C.steelDark, {}, ['bottom', 'top'])
  obox(mb, 0, 0, r, f, 0.6, 0.35, -0.2, 0.2, C.steelDark)
  obox(mb, 0, 0, r, f, 1.2, 1.1, -4.9, -3.6, { top: C.white, side: C.glass, end: C.glass, bottom: C.gondola })
  obox(mb, 0, 0, r, f, 1.25, 1.15, -5.7, -4.9, C.gondola)
  obox(mb, 0, 0, r, f, 1.25, 1.15, -3.6, -2.6, { top: C.gondola, side: C.gondola, end: C.gondola, bottom: C.gondola })
  return mb.build()
}

/** Frozen waterfalls on the gorge walls: curtains of ice columns down the slopes beside the road. */
function waterfalls(view, L, place) {
  const rand = rng(31337)
  const path = view.path
  for (const rg of view.decor.falls || []) {
    let side = 1
    for (let i = rg.from; i <= rg.to; i += 9) {
      const p = path[i]
      const r = rightOfSample(p)
      side = -side
      const off = p.w / 2 + 9 + rand() * 4
      const cx = p.x + r[0] * off * side
      const cz = p.z + r[2] * off * side
      const yb = Math.max(L.heightAt(cx, cz) - 1, p.y - 4)
      const yt = p.y + 22 + rand() * 12
      const mb = place(cx, cz)
      // Along the wall (the road's direction), 4-6 columns of ice, tapering to points low down.
      const f = [p.fx, 0, p.fz]
      const n = 4 + Math.floor(rand() * 3)
      for (let k = 0; k < n; k += 1) {
        const a = (k - (n - 1) / 2) * 1.9 + (rand() - 0.5)
        const x = cx + f[0] * a
        const z = cz + f[2] * a
        const rad = 0.7 + rand() * 0.9
        const bottom = yb + rand() * 5
        const top = yt - rand() * 6
        cone(mb, x, z, bottom + 3, top, rad * 0.6, rad, 6, k % 2 ? C.ice : C.iceDeep, P.ICE, k)
        cone(mb, x, z, bottom + 3, bottom, rad * 0.6, 0, 6, C.ice, P.ICE, k)
      }
      // A frosted lip at the top.
      cone(mb, cx, cz, yt - 1, yt + 1.2, 6, 4.5, 7, C.snow, P.SNOW)
    }
  }
}

/** The ice cave: a rock arch over the road along each cave range, ice inside, icicles, glowing crystals. */
function iceCave(view, L, place) {
  const path = view.path
  const rand = rng(777)
  for (const rg of view.decor.caves || []) {
    // Cross-section profile (lateral x, height y) inside, from the left wall over to the right.
    const prof = (w) => {
      const half = w / 2 + 0.6
      return [
        [-half, -1.2],
        [-half, 3.2],
        [-half * 0.8, 6.6],
        [-half * 0.42, 8.9],
        [0, 9.6],
        [half * 0.42, 8.9],
        [half * 0.8, 6.6],
        [half, 3.2],
        [half, -1.2],
      ]
    }
    const T = 1.6
    const step = 2
    const ring = (p) => {
      const r = rightOfSample(p)
      const pr = prof(p.w)
      const inner = pr.map(([x, y]) => [p.x + r[0] * x, p.y + y, p.z + r[2] * x])
      const outer = pr.map(([x, y]) => {
        const k = (Math.abs(x) + T) / Math.max(0.01, Math.abs(x))
        return [p.x + r[0] * x * (x === 0 ? 1 : k), p.y + y + (y > 3 ? T : 0), p.z + r[2] * x * (x === 0 ? 1 : k)]
      })
      return { inner, outer, p }
    }
    const rings = []
    for (let i = rg.from; i <= rg.to; i += step) rings.push(ring(path[i]))
    if ((rg.to - rg.from) % step) rings.push(ring(path[rg.to]))
    for (let k = 0; k < rings.length - 1; k += 1) {
      const A = rings[k]
      const B = rings[k + 1]
      const mb = place(A.p.x, A.p.z)
      for (let e = 0; e < A.inner.length - 1; e += 1) {
        // Inside faces point at the road's centre line; outside faces away from it.
        const mid = [(A.inner[e][0] + A.inner[e + 1][0]) / 2, (A.inner[e][1] + A.inner[e + 1][1]) / 2, (A.inner[e][2] + A.inner[e + 1][2]) / 2]
        const toAxis = [A.p.x - mid[0], A.p.y + 4 - mid[1], A.p.z - mid[2]]
        face(mb, [A.inner[e], A.inner[e + 1], B.inner[e + 1], B.inner[e]], toAxis, e % 2 ? C.ice : C.iceDeep, P.ICE)
        face(mb, [A.outer[e], A.outer[e + 1], B.outer[e + 1], B.outer[e]], [-toAxis[0], -toAxis[1], -toAxis[2]], e > 1 && e < 6 ? C.snow : C.rock, e > 1 && e < 6 ? P.SNOW : 0)
      }
      // Icicles from the ceiling and glowing crystals low on the walls, every few metres.
      if (k % 3 === 1) {
        const c = A.inner[4]
        const r = rightOfSample(A.p)
        for (const o of [-2.6, 0.4, 2.8]) {
          const x = c[0] + r[0] * (o + (rand() - 0.5))
          const z = c[2] + r[2] * (o + (rand() - 0.5))
          const y = c[1] - 0.5 - Math.abs(o) * 0.25
          cone(mb, x, z, y + 0.2, y - 1.2 - rand() * 1.4, 0.35, 0, 5, C.ice, P.ICE)
        }
        for (const s of [-1, 1]) {
          const w = A.inner[s < 0 ? 1 : 7]
          const x = w[0] - r[0] * s * 0.3
          const z = w[2] - r[2] * s * 0.3
          cone(mb, x, z, A.p.y + 0.2, A.p.y + 1.6 + rand(), 0.55, 0, 5, C.iceGlow, P.GLOW)
        }
      }
    }
    // Rock portals round both mouths, a little proud of the arch.
    for (const R of [rings[0], rings[rings.length - 1]]) {
      const mb = place(R.p.x, R.p.z)
      const f = [R.p.fx, 0, R.p.fz]
      for (let e = 0; e < R.outer.length - 1; e += 1) {
        const a = R.outer[e]
        const b = R.outer[e + 1]
        const ai = R.inner[e]
        const bi = R.inner[e + 1]
        for (const s of [-1, 1]) {
          const off = (q, k) => [q[0] + f[0] * 0.8 * s + (q[0] - R.p.x) * k, q[1] + (q[1] - R.p.y) * k, q[2] + f[2] * 0.8 * s + (q[2] - R.p.z) * k]
          face(mb, [off(ai, 0), off(bi, 0), off(b, 0.12), off(a, 0.12)], [f[0] * s, 0, f[2] * s], C.rockDark)
        }
      }
    }
  }
}

/** The frozen lake round the lake crossing: an ice disc at its level, a snowy shore ring. */
function frozenLake(L, place) {
  for (const lk of L.lakes) {
    const mb = place(lk.x, lk.z)
    const n = 28
    const at = (a, k) => {
      const u = Math.cos(a) * lk.ra * k
      const v = Math.sin(a) * lk.rb * k
      return [lk.x + lk.fx * u - lk.fz * v, lk.y, lk.z + lk.fz * u + lk.fx * v]
    }
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * Math.PI * 2
      const a1 = ((i + 1) / n) * Math.PI * 2
      face(mb, [[lk.x, lk.y, lk.z], at(a0, 1), at(a1, 1)], [0, 1, 0], i % 2 ? C.lake : C.ice, P.ICE)
      // (No shore where the road comes in and goes out: it would stand up through the road.)
      if (Math.abs(Math.sin((a0 + a1) / 2)) * lk.rb < 20) continue
      const o0 = at(a0, 1.12)
      const o1 = at(a1, 1.12)
      o0[1] += 1.2
      o1[1] += 1.2
      face(mb, [at(a0, 1), o0, o1, at(a1, 1)], [0, 1, 0], C.snow, P.SNOW)
    }
  }
}

/** The observatory on the summit: beside the zone's last plaza (where the next zone starts). */
function observatory(view, L, place) {
  const cp = view.checkpoints[view.zone.to + 1]
  if (!cp || !cp.length) return
  const f = [-Math.sin(cp.yaw), 0, -Math.cos(cp.yaw)]
  const r = [-f[2], 0, f[0]]
  const x = cp.x + f[0] * cp.length * 0.5 + r[0] * (cp.width / 2 + 15)
  const z = cp.z + f[2] * cp.length * 0.5 + r[2] * (cp.width / 2 + 15)
  if (!clearOfRoads(L, x, z, 11, cp.y - 2, cp.y + 24, 3)) return
  const y = cp.y
  const mb = place(x, z)
  // Footing down the summit, the drum, the dome with its slit, an annex and a mast.
  cone(mb, x, z, y - 30, y + 0.6, 13, 11.5, 12, C.rock)
  cone(mb, x, z, y + 0.6, y + 8, 9, 9, 16, C.white, P.FACADE)
  cone(mb, x, z, y + 8, y + 8.6, 9.6, 9.6, 16, C.steelDark)
  const n = 16
  const rings = [0, 0.3, 0.6, 0.85, 1]
  for (let k = 0; k < rings.length - 1; k += 1) {
    const a0 = (rings[k] * Math.PI) / 2
    const a1 = (rings[k + 1] * Math.PI) / 2
    for (let i = 0; i < n; i += 1) {
      const b0 = (i / n) * Math.PI * 2
      const b1 = ((i + 1) / n) * Math.PI * 2
      const pt = (a, b) => [x + Math.cos(b) * Math.cos(a) * 9.2, y + 8.6 + Math.sin(a) * 9.2, z + Math.sin(b) * Math.cos(a) * 9.2]
      const slit = i === 3 || i === 4
      const bm = (b0 + b1) / 2
      const am = (a0 + a1) / 2
      face(mb, [pt(a0, b0), pt(a0, b1), pt(a1, b1), pt(a1, b0)], [Math.cos(bm) * Math.cos(am), Math.sin(am), Math.sin(bm) * Math.cos(am)], slit ? C.slit : C.dome)
    }
  }
  obox(mb, x + f[0] * 11, z + f[2] * 11, r, f, 4, 3.5, y - 6, y + 4.5, { top: C.snow, side: C.white, end: C.white, bottom: C.white }, { side: P.FACADE, end: P.FACADE, top: P.SNOW }, ['bottom'])
  const mx = x - f[0] * 10
  const mz = z - f[2] * 10
  beam(mb, [mx, y - 2, mz], [mx, y + 24, mz], 0.5, C.steel)
  obox(mb, mx, mz, r, f, 0.4, 0.4, y + 24, y + 25, C.red, { top: P.PULSE, side: P.PULSE, end: P.PULSE }, ['bottom'])
}

/**
 * Builds the snow zone (`view`: zoneView(stage, 'snow')) as geometry: one MeshBuilder per
 * terrain tile (with the set pieces in it), the pine tiles' instance matrices and the cable
 * car's line. `density` (the preset's scenery density) thins the pines; `detail` (MEDIUM+)
 * adds the chalets along the way, the waterfalls' extra columns.
 */
export function buildSnowWorld(view, { density = 1 } = {}) {
  // Built ahead of time in the prep worker (game/prep), when it was.
  const pre = takePrebuilt('snow', view, { density })
  if (pre) return pre
  const L = snowLayout(view)
  const { x0, z0, nx, nz, H } = L
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
  // Terrain cells (cells wholly under the sea are left out: the sea covers them).
  for (let j = 0; j < nz - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const a = j * nx + i
      const ha = H[a]
      const hb = H[a + 1]
      const hc = H[a + nx]
      const hd = H[a + nx + 1]
      if (Math.max(ha, hb, hc, hd) < -1) continue
      const x = x0 + i * GRID
      const z = z0 + j * GRID
      const A = [x, ha, z]
      const B = [x + GRID, hb, z]
      const Cc = [x, hc, z + GRID]
      const D = [x + GRID, hd, z + GRID]
      const mb = place(x + GRID / 2, z + GRID / 2)
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
        const ny = nyv / (Math.hypot(nxv, nyv, nzv) || 1)
        const y = (p[1] + q[1] + r[1]) / 3
        const hsh = hash(p[0] * 0.13 + q[2], r[0] + p[2] * 0.07)
        let color
        let pattern = 0
        if (y < 8) color = C.rockDark
        else if (ny < 0.6 || (ny < 0.74 && hsh < 0.55) || (y < 45 && hsh < 0.6)) color = hsh < 0.5 ? C.rock : C.rockLight
        else {
          color = hsh < 0.5 ? C.snow : C.snowShade
          pattern = P.SNOW
        }
        mb.tri(p, q, r, color, pattern)
      }
    }
  }
  village(view, L, place)
  const line = cableCar(view, L, place)
  waterfalls(view, L, place)
  iceCave(view, L, place)
  frozenLake(L, place)
  observatory(view, L, place)
  let triangles = 0
  const chunks = []
  for (const [key, mb] of tiles) {
    triangles += mb.triangles
    chunks.push({ key, geometry: mb.build(), triangles: mb.triangles })
  }
  return { chunks, trees: treeTiles(L.trees, density), cable: line, heightAt: L.heightAt, triangles, treeCount: L.trees.length }
}
