import { Color } from 'three'

import { footprintDistance, stageFootprints } from '@shared/track'

import { PATTERN as P } from '../../render/worldMaterial'
import { MeshBuilder } from '../../render/meshBuilder'
import { HARBOUR_ZONES, rng } from '../harbourGeometry'
import { takePrebuilt } from '../../prep/prebuilt'

/**
 * Rustport - Heat Run's scenery - as plain geometry (no React, no GPU), laid out from the
 * stage (deterministic, seeded), all on the shared world material:
 *
 * - the district's ground: 40 m concrete / asphalt yards at GROUND_Y under the elevated
 *   roads, quay walls down to the water at their edges, cut away for the canals (round
 *   the drawbridges and the river jump) and wherever the road runs low (the pier end,
 *   the safehouse quay);
 * - warehouses (corrugated, brick, roll-up doors, roof vents) and office / apartment
 *   blocks along the route, a sparse skyline further out - never on (or through) a road
 *   or a plaza;
 * - set pieces round the road (`stage.decor`, shared/stages/heatRun.js): the warehouse
 *   tunnels (walls, roof and ceiling lights over the road), the alleys' tall walls with
 *   fire escapes and neon, tower cranes and building frames at the construction site,
 *   rail tracks and freight wagons in the yard below the rail-yard road, bridge towers at
 *   the drawbridges, the multi-storey car park round the garage helix, the safehouse
 *   warehouse and pier piles at the finish;
 * - street lights along the roads (glowing heads; `lamps` lists them for the night light
 *   pools, heat.jsx) and billboard frames (their artwork is the sign atlas: `signs`, for
 *   render/signs.js buildSignMesh - our own fictional brands).
 *
 * Geometry is split into AREA m tiles (`chunks`, culled by the renderer and by distance).
 * `density` (0-1) thins the buildings and skyline; `detail` adds fire escapes, roof clutter
 * and the skyline (off on LOW).
 */

export const GROUND_Y = 2.5
const CELL = 40
const AREA = 200
/** No ground within this of a road lower than GROUND_Y + LOW_ROAD (m) - the road runs low there. */
const LOW_ROAD = 4
const ROAD_GAP = 7

const c = (hex) => new Color(hex)
const CONCRETE = [c('#5a5e66'), c('#4f535b'), c('#62666c')]
const ASPHALT = c('#2f3238')
const QUAY = c('#3a3d44')
const WAREHOUSE = ['#7a3a2e', '#5a6470', '#8a6a4a', '#4a5a52', '#6e4a3a', '#56606e'].map(c)
const OFFICE = ['#3a4252', '#454a58', '#523f3f', '#3c4a4a', '#4a4458'].map(c)
const ROOF = c('#25282e')
const DOOR = c('#9aa2ac')
const STEEL = c('#4a5462')
const RAIL = c('#9aa4ae')
const BALLAST = c('#3a3634')
const CRANE = c('#ffb020')
const LAMP = c('#ffd89a')
const NEONS = ['#ff3b4e', '#2de2ff', '#ffd23a', '#ff6ec7', '#3dffb0'].map(c)
const WAGONS = ['#a8432f', '#2f5a8a', '#3a7a4a', '#c78a2a', '#6a4a8a'].map(c)
const DARK = c('#1c1e24')
const WHITE = c('#e6eaee')


/** An oriented upright box: centre (x, z), base y0 to top y1, half sizes hw (along r) x hd (along f). */
function box(mb, x, z, y0, y1, hw, hd, r, color, { pat = P.PLAIN, top = ROOF, topPat = P.PLAIN, skipTop = false } = {}) {
  const f = [-r[2], 0, r[0]]
  const col = { side: color, end: color, top }
  const pats = { side: pat, end: pat, top: topPat }
  mb.box([x, (y0 + y1) / 2, z], [hw, (y1 - y0) / 2, hd], r, [0, 1, 0], f, col, pats, { skip: skipTop ? ['bottom', 'top'] : ['bottom'], along: [0, 1, 0] })
}

/** An oriented box between two points, `t` thick (beams, posts, rails). */
function beam(mb, p0, p1, t, color, pattern = P.PLAIN, tz = t) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
  const len = Math.hypot(d[0], d[1], d[2]) || 1
  const ay = [d[0] / len, d[1] / len, d[2] / len]
  const ref = Math.abs(ay[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  let ax = [ay[1] * ref[2] - ay[2] * ref[1], ay[2] * ref[0] - ay[0] * ref[2], ay[0] * ref[1] - ay[1] * ref[0]]
  const al = Math.hypot(ax[0], ax[1], ax[2]) || 1
  ax = [ax[0] / al, ax[1] / al, ax[2] / al]
  const az = [ax[1] * ay[2] - ax[2] * ay[1], ax[2] * ay[0] - ax[0] * ay[2], ax[0] * ay[1] - ax[1] * ay[0]]
  const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2]
  mb.box(mid, [t / 2, len / 2, tz / 2], ax, ay, az, { top: color, side: color, end: color, bottom: color }, { top: pattern, side: pattern, end: pattern, bottom: pattern }, { along: ay })
}

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

const inHarbour = (x, z, m = 0) => HARBOUR_ZONES.some(([x0, z0, x1, z1]) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m)
/** The pier, the lobby and the water round the start. */
const nearPier = (x, z, m = 0) => Math.abs(x) < 70 + m && z > -150 - m && z < 90 + m

/** Frame of a path sample: level forward and right. */
function levelFrame(p) {
  const l = Math.hypot(p.fx, p.fz) || 1
  const f = [p.fx / l, 0, p.fz / l]
  return { f, r: [-f[2], 0, f[0]] }
}

export function buildHeatCity(stage, { density = 1, detail = true } = {}) {
  // Built ahead of time in the prep worker (game/prep), when it was.
  const pre = takePrebuilt('heat', stage, { density, detail })
  if (pre) return pre
  const rand = rng(424242)
  const path = stage.path
  const grid = gridOf(path)
  const fps = stageFootprints(stage)
  const decor = stage.decor || {}
  const chunks = new Map()
  const signs = []
  const mbAt = (x, z) => {
    const key = `${Math.floor(x / AREA)},${Math.floor(z / AREA)}`
    let mb = chunks.get(key)
    if (!mb) chunks.set(key, (mb = new MeshBuilder()))
    return mb
  }
  // Footprints taken by what's been placed (circles), so nothing overlaps.
  const taken = []
  const free = (x, z, rad) => taken.every((t) => Math.hypot(t.x - x, t.z - z) > t.rad + rad + 1.5)

  /** Is a footprint of radius `rad` at (x, z) clear of every road (any height), plaza and the harbour? */
  function clear(x, z, rad, gap = ROAD_GAP) {
    if (inHarbour(x, z, rad + 4) || nearPier(x, z, rad)) return false
    for (const p of near(grid, x, z, rad + 40)) if (Math.hypot(p.x - x, p.z - z) < rad + p.w / 2 + gap) return false
    for (const fp of fps) if (footprintDistance(fp, x, z) < rad + gap) return false
    return true
  }

  // --- Canals: bands across the road at the drawbridges and the river jump (no ground).
  const canals = []
  for (const cr of decor.canals || []) {
    if (cr.kind === 'river') {
      const air = []
      for (let i = cr.from; i <= cr.to; i += 1) if (path[i].air) air.push(path[i])
      const mid = air[Math.floor(air.length / 2)] || path[Math.floor((cr.from + cr.to) / 2)]
      canals.push({ x: mid.x, z: mid.z, ...levelFrame(mid), half: 26, len: 420 })
    } else {
      for (const o of stage.obstacles) if (o.type === 'drawbridge' && o.pi >= cr.from && o.pi <= cr.to) {
        const p = path[o.pi]
        canals.push({ x: p.x, z: p.z, ...levelFrame(p), half: 15, len: 300 })
      }
    }
  }
  const inCanal = (x, z, m = 0) =>
    canals.some((k) => {
      const dx = x - k.x
      const dz = z - k.z
      return Math.abs(dx * k.f[0] + dz * k.f[2]) < k.half + m && Math.abs(dx * k.r[0] + dz * k.r[2]) < k.len / 2
    })

  // --- Ground: 40 m yards near the route.
  const ground = new Set()
  let gx0 = Infinity
  let gx1 = -Infinity
  let gz0 = Infinity
  let gz1 = -Infinity
  for (const p of path) {
    gx0 = Math.min(gx0, p.x)
    gx1 = Math.max(gx1, p.x)
    gz0 = Math.min(gz0, p.z)
    gz1 = Math.max(gz1, p.z)
  }
  const isGround = (i, j) => ground.has(`${i},${j}`)
  for (let i = Math.floor((gx0 - 160) / CELL); i <= Math.ceil((gx1 + 160) / CELL); i += 1) {
    for (let j = Math.floor((gz0 - 160) / CELL); j <= Math.ceil((gz1 + 160) / CELL); j += 1) {
      const x = (i + 0.5) * CELL
      const z = (j + 0.5) * CELL
      if (inHarbour(x, z, CELL / 2 + 10) || nearPier(x, z, CELL / 2 + 30) || inCanal(x, z, CELL / 2)) continue
      let nearest = Infinity
      let low = false
      for (const p of near(grid, x, z, 200)) {
        const d = Math.hypot(p.x - x, p.z - z)
        if (d < nearest) nearest = d
        if (d < CELL * 0.75 + p.w / 2 + 6 && p.y < GROUND_Y + LOW_ROAD) low = true
      }
      if (nearest > 170 || low) continue
      ground.add(`${i},${j}`)
    }
  }
  for (const key of ground) {
    const [i, j] = key.split(',').map(Number)
    const x0 = i * CELL
    const z0 = j * CELL
    const mb = mbAt(x0 + CELL / 2, z0 + CELL / 2)
    const h = (((i * 7 + j * 13) % 5) + 5) % 5
    const col = h === 0 ? ASPHALT : CONCRETE[h % 3]
    const pat = h === 0 ? P.ASPHALT : P.TILES
    mb.quad([x0, GROUND_Y, z0], [x0, GROUND_Y, z0 + CELL], [x0 + CELL, GROUND_Y, z0 + CELL], [x0 + CELL, GROUND_Y, z0], col, pat)
    // Quay walls down to the water where the yard ends.
    const edge = (a, b) => mb.quad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], GROUND_Y, b[1]], [a[0], GROUND_Y, a[1]], QUAY, P.PLAIN)
    if (!isGround(i, j - 1)) edge([x0 + CELL, z0], [x0, z0])
    if (!isGround(i, j + 1)) edge([x0, z0 + CELL], [x0 + CELL, z0 + CELL])
    if (!isGround(i - 1, j)) edge([x0, z0], [x0, z0 + CELL])
    if (!isGround(i + 1, j)) edge([x0 + CELL, z0 + CELL], [x0 + CELL, z0])
  }
  const onGround = (x, z, rad) => {
    for (const [dx, dz] of [[0, 0], [rad, rad], [-rad, rad], [rad, -rad], [-rad, -rad]]) if (!isGround(Math.floor((x + dx) / CELL), Math.floor((z + dz) / CELL))) return false
    return true
  }

  // --- Buildings ------------------------------------------------------------------

  function warehouse(x, z, hw, hd, h, r, color) {
    const mb = mbAt(x, z)
    const top = GROUND_Y + h
    box(mb, x, z, GROUND_Y, top, hw, hd, r, color, { pat: P.STRIPES })
    // A low pitched roof ridge, roll-up doors on one long side, vents.
    const f = [-r[2], 0, r[0]]
    box(mb, x, z, top, top + 1.2, hw * 0.98, hd * 0.4, r, ROOF)
    const doors = Math.max(1, Math.floor(hw / 7))
    for (let k = 0; k < doors; k += 1) {
      const u = -hw + ((k + 0.5) * 2 * hw) / doors
      const dx = x + r[0] * u + f[0] * (hd + 0.06)
      const dz = z + r[2] * u + f[2] * (hd + 0.06)
      box(mb, dx, dz, GROUND_Y, GROUND_Y + Math.min(5.5, h * 0.55), 2.4, 0.06, r, DOOR, { pat: P.STRIPES, top: DOOR })
    }
    if (detail) for (let k = 0; k < 3; k += 1) mb.prism(x + r[0] * (k - 1) * hw * 0.5, z + r[2] * (k - 1) * hw * 0.5, top + 1.2, top + 2.4, 0.7, 6, STEEL, DARK)
    // A neon strip along the eave on some.
    if (rand() < 0.35) box(mb, x + f[0] * (hd + 0.1), z + f[2] * (hd + 0.1), top - 0.8, top - 0.45, hw * 0.9, 0.08, r, NEONS[Math.floor(rand() * NEONS.length)], { pat: P.GLOW, top: NEONS[0], topPat: P.GLOW })
  }

  function tower(x, z, hw, hd, h, r, color) {
    const mb = mbAt(x, z)
    const top = GROUND_Y + h
    box(mb, x, z, GROUND_Y, top, hw, hd, r, color, { pat: rand() < 0.5 ? P.FACADE : P.WINDOWS })
    box(mb, x, z, top, top + 1.5, hw * 0.6, hd * 0.6, r, ROOF)
    // Lit floor bands / a rooftop beacon after dark.
    if (rand() < 0.5) {
      const f = [-r[2], 0, r[0]]
      const y = GROUND_Y + h * (0.4 + rand() * 0.4)
      box(mb, x + f[0] * (hd + 0.05), z + f[2] * (hd + 0.05), y, y + 0.35, hw, 0.05, r, NEONS[Math.floor(rand() * NEONS.length)], { pat: P.GLOW, top: NEONS[1], topPat: P.GLOW })
    }
    if (detail && h > 30) box(mb, x, z, top + 1.5, top + 4, 0.25, 0.25, r, c('#ff2a3a'), { pat: P.GLOW, top: c('#ff2a3a'), topPat: P.GLOW })
  }

  // Along the route: warehouses near the road, blocks behind them, both sides.
  for (let s = 20; s < stage.length; s += 30 / Math.max(0.35, density)) {
    const i = path.findIndex((p) => p.s >= s)
    if (i < 0) break
    const p = path[i]
    if (p.air) continue
    const { f, r } = levelFrame(p)
    for (const side of [-1, 1]) {
      if (rand() > 0.85) continue
      const big = rand() < 0.6
      const hw = big ? 9 + rand() * 9 : 7 + rand() * 5
      const hd = big ? 7 + rand() * 6 : 6 + rand() * 5
      const rad = Math.hypot(hw, hd)
      const d = p.w / 2 + ROAD_GAP + rad + rand() * 8
      const x = p.x + r[0] * side * d
      const z = p.z + r[2] * side * d
      if (!clear(x, z, rad) || !onGround(x, z, rad) || !free(x, z, rad)) continue
      taken.push({ x, z, rad })
      const tall = rand() < 0.3
      if (tall) tower(x, z, hw * 0.7, hd * 0.7, 18 + rand() * 30, f, OFFICE[Math.floor(rand() * OFFICE.length)])
      else warehouse(x, z, hw, hd, 7 + rand() * 7, f, WAREHOUSE[Math.floor(rand() * WAREHOUSE.length)])
      // A second row further out.
      if (rand() < 0.55 * density) {
        const d2 = d + rad + 14 + rand() * 20
        const x2 = p.x + r[0] * side * d2
        const z2 = p.z + r[2] * side * d2
        const hw2 = 8 + rand() * 8
        const hd2 = 8 + rand() * 8
        const rad2 = Math.hypot(hw2, hd2)
        if (clear(x2, z2, rad2) && onGround(x2, z2, rad2) && free(x2, z2, rad2)) {
          taken.push({ x: x2, z: z2, rad: rad2 })
          tower(x2, z2, hw2, hd2, 14 + rand() * (detail ? 50 : 25), f, OFFICE[Math.floor(rand() * OFFICE.length)])
        }
      }
    }
  }

  // The skyline further out (MEDIUM+).
  if (detail) {
    for (let s = 40; s < stage.length; s += 70 / density) {
      const i = path.findIndex((p) => p.s >= s)
      if (i < 0) break
      const p = path[i]
      const { f, r } = levelFrame(p)
      const side = rand() < 0.5 ? -1 : 1
      const d = 90 + rand() * 70
      const x = p.x + r[0] * side * d
      const z = p.z + r[2] * side * d
      const hw = 9 + rand() * 7
      const rad = hw * 1.42
      if (!clear(x, z, rad, 20) || !onGround(x, z, rad) || !free(x, z, rad)) continue
      taken.push({ x, z, rad })
      tower(x, z, hw, hw * (0.7 + rand() * 0.5), 40 + rand() * 60, f, OFFICE[Math.floor(rand() * OFFICE.length)])
    }
  }

  // --- Set pieces -----------------------------------------------------------------

  /** Calls fn(a, b, ra, ua, ra2) for consecutive samples of a range (right and up of a). */
  function along(range, fn, step = 1) {
    for (let i = range.from; i + step <= range.to; i += step) {
      const a = path[i]
      const b = path[i + step]
      const f = [a.fx, a.fy, a.fz]
      const u = [a.ux, a.uy, a.uz]
      const r = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]]
      const rl = Math.hypot(r[0], r[1], r[2]) || 1
      fn(a, b, [r[0] / rl, r[1] / rl, r[2] / rl], u, i)
    }
  }
  const off = (p, r, u, lat, up) => [p.x + r[0] * lat + u[0] * up, p.y + r[1] * lat + u[1] * up, p.z + r[2] * lat + u[2] * up]

  // Warehouse tunnels: walls either side, a roof, ceiling light strips and a lit portal sign.
  for (const t of decor.tunnels || []) {
    const H = 6.4
    along(
      t,
      (a, b, r, u, i) => {
        const mb = mbAt(a.x, a.z)
        const ra = [b.fy * b.uz - b.fz * b.uy, b.fz * b.ux - b.fx * b.uz, b.fx * b.uy - b.fy * b.ux]
        const rl = Math.hypot(...ra) || 1
        const rb = [ra[0] / rl, ra[1] / rl, ra[2] / rl]
        const ub = [b.ux, b.uy, b.uz]
        for (const side of [-1, 1]) {
          const lin = side * (a.w / 2 + 0.45)
          const lout = side * (a.w / 2 + 1.4)
          // Inner face (towards the road), outer face, top of the wall.
          const ia = off(a, r, u, lin, -1.2)
          const ib = off(b, rb, ub, lin, -1.2)
          const ic = off(b, rb, ub, lin, H)
          const id = off(a, r, u, lin, H)
          if (side > 0) mb.quad(ia, id, ic, ib, DARK, P.PLAIN)
          else mb.quad(ia, ib, ic, id, DARK, P.PLAIN)
          const oa = off(a, r, u, lout, -1.2)
          const ob = off(b, rb, ub, lout, -1.2)
          const oc = off(b, rb, ub, lout, H + 0.9)
          const od = off(a, r, u, lout, H + 0.9)
          const wc = WAREHOUSE[(t.from * 3) % WAREHOUSE.length]
          if (side > 0) mb.quad(oa, ob, oc, od, wc, P.STRIPES, [0, 2, 2, 0])
          else mb.quad(oa, od, oc, ob, wc, P.STRIPES, [0, 2, 2, 0])
        }
        // Roof slab: top, ceiling.
        const L = a.w / 2 + 1.4
        const t0 = off(a, r, u, -L, H + 0.9)
        const t1 = off(a, r, u, L, H + 0.9)
        const t2 = off(b, rb, ub, L, H + 0.9)
        const t3 = off(b, rb, ub, -L, H + 0.9)
        mb.quad(t0, t1, t2, t3, ROOF, P.PLAIN)
        const c0 = off(a, r, u, -a.w / 2 - 0.45, H)
        const c1 = off(a, r, u, a.w / 2 + 0.45, H)
        const c2 = off(b, rb, ub, a.w / 2 + 0.45, H)
        const c3 = off(b, rb, ub, -a.w / 2 - 0.45, H)
        mb.quad(c0, c3, c2, c1, c('#30343c'), P.PLAIN)
        // Light strips across the ceiling every 6 m.
        if ((i - t.from) % 3 === 0) {
          const l0 = off(a, r, u, -a.w / 2 + 1, H - 0.05)
          const l1 = off(a, r, u, a.w / 2 - 1, H - 0.05)
          const l2 = off(b, rb, ub, a.w / 2 - 1, H - 0.05)
          const l3 = off(b, rb, ub, -a.w / 2 + 1, H - 0.05)
          const k = 0.25
          mb.quad(l0, [l0[0] + (l3[0] - l0[0]) * k, l0[1] + (l3[1] - l0[1]) * k, l0[2] + (l3[2] - l0[2]) * k], [l1[0] + (l2[0] - l1[0]) * k, l1[1] + (l2[1] - l1[1]) * k, l1[2] + (l2[2] - l1[2]) * k], l1, LAMP, P.GLOW)
        }
      },
      1,
    )
    // Portal facades over both ends.
    for (const end of [t.from, t.to]) {
      const p = path[end]
      const { f, r } = levelFrame(p)
      const back = end === t.from ? -1 : 1
      const x = p.x + f[0] * back * 0.6
      const z = p.z + f[2] * back * 0.6
      const mb = mbAt(x, z)
      box(mb, x, z, p.y + 6.4, p.y + 11, p.w / 2 + 3, 0.6, r, WAREHOUSE[(t.from * 3) % WAREHOUSE.length], { pat: P.STRIPES })
      box(mb, x + f[0] * back * 0.62, z + f[2] * back * 0.62, p.y + 7.6, p.y + 9.6, p.w / 3, 0.04, r, c('#ffd23a'), { pat: P.GLOW, top: c('#ffd23a'), topPat: P.GLOW })
    }
  }

  // Alleys: tall block walls either side (fire escapes, neon signs).
  for (const al of decor.alleys || []) {
    along(
      al,
      (a, b, r, u, i) => {
        const mb = mbAt(a.x, a.z)
        const rb = levelFrame(b).r
        const ra = levelFrame(a).r
        const top = a.y + 10 + ((Math.floor(i / 12) * 7) % 5)
        for (const side of [-1, 1]) {
          const lin = side * (a.w / 2 + 1)
          const lout = side * (a.w / 2 + 9)
          const pa = [a.x + ra[0] * lin, a.z + ra[2] * lin]
          const pb = [b.x + rb[0] * lin, b.z + rb[2] * lin]
          const qa = [a.x + ra[0] * lout, a.z + ra[2] * lout]
          const qb = [b.x + rb[0] * lout, b.z + rb[2] * lout]
          const col = WAREHOUSE[(Math.floor(i / 12) + (side > 0 ? 2 : 0)) % WAREHOUSE.length]
          const y0 = GROUND_Y
          // Inner face, top, outer face.
          if (side > 0) mb.quad([pa[0], y0, pa[1]], [pa[0], top, pa[1]], [pb[0], top, pb[1]], [pb[0], y0, pb[1]], col, P.FACADE)
          else mb.quad([pa[0], y0, pa[1]], [pb[0], y0, pb[1]], [pb[0], top, pb[1]], [pa[0], top, pa[1]], col, P.FACADE)
          if (side > 0) mb.quad([pa[0], top, pa[1]], [qa[0], top, qa[1]], [qb[0], top, qb[1]], [pb[0], top, pb[1]], ROOF)
          else mb.quad([pa[0], top, pa[1]], [pb[0], top, pb[1]], [qb[0], top, qb[1]], [qa[0], top, qa[1]], ROOF)
          if (side > 0) mb.quad([qa[0], y0, qa[1]], [qb[0], y0, qb[1]], [qb[0], top, qb[1]], [qa[0], top, qa[1]], col, P.FACADE)
          else mb.quad([qa[0], y0, qa[1]], [qa[0], top, qa[1]], [qb[0], top, qb[1]], [qb[0], y0, qb[1]], col, P.FACADE)
          // Fire escape platforms and neon signs now and then (above the barrier, off the road).
          if (detail && (i - al.from) % 9 === 4) {
            const lat = side * (a.w / 2 + 0.75)
            for (const dy of [3, 6.5]) {
              const e0 = [a.x + ra[0] * lat, a.y + dy, a.z + ra[2] * lat]
              const e1 = [b.x + rb[0] * lat, b.y + dy, b.z + rb[2] * lat]
              beam(mb, e0, e1, 0.45, STEEL, P.PLAIN, 0.08)
            }
          }
          if ((i - al.from) % 14 === 7) {
            const lat = side * (a.w / 2 + 0.92)
            const n = NEONS[(i + (side > 0 ? 1 : 3)) % NEONS.length]
            beam(mb, [a.x + ra[0] * lat, a.y + 4.5, a.z + ra[2] * lat], [a.x + ra[0] * lat, a.y + 7.5, a.z + ra[2] * lat], 0.16, n, P.GLOW, 1.2)
          }
        }
      },
      1,
    )
  }

  // Construction site: tower cranes and bare building frames beside the road.
  for (const cs of decor.construction || []) {
    const picks = [0.15, 0.5, 0.85]
    for (const k of picks) {
      const i = Math.floor(cs.from + (cs.to - cs.from) * k)
      const p = path[i]
      const { f, r } = levelFrame(p)
      for (const side of [-1, 1]) {
        const d = p.w / 2 + 16
        const x = p.x + r[0] * side * d
        const z = p.z + r[2] * side * d
        if (!clear(x, z, 4) || !free(x, z, 4)) continue
        taken.push({ x, z, rad: 4 })
        const mb = mbAt(x, z)
        const base = isGround(Math.floor(x / CELL), Math.floor(z / CELL)) ? GROUND_Y : 0
        const top = p.y + 30
        if (side > 0 || k !== 0.5) {
          // Tower crane: mast, slewing cab, a jib swung out (along the road) and a counter-jib.
          box(mb, x, z, base, top, 1.1, 1.1, r, CRANE, { pat: P.HAZARD })
          box(mb, x, z, top, top + 2.4, 1.6, 1.6, r, CRANE)
          const yaw = rand() * Math.PI * 2
          const jd = [Math.cos(yaw), 0, Math.sin(yaw)]
          beam(mb, [x, top + 2.6, z], [x + jd[0] * 34, top + 2.6, z + jd[2] * 34], 0.9, CRANE, P.HAZARD)
          beam(mb, [x, top + 2.6, z], [x - jd[0] * 12, top + 2.6, z - jd[2] * 12], 1.0, CRANE)
          box(mb, x - jd[0] * 10, z - jd[2] * 10, top + 1, top + 2.6, 1.4, 1.4, r, c('#7a7f88'))
          beam(mb, [x + jd[0] * 24, top + 2.2, z + jd[2] * 24], [x + jd[0] * 24, top - 10, z + jd[2] * 24], 0.08, DARK)
          box(mb, x, z, top + 2.4, top + 6.5, 0.25, 0.25, r, c('#ff2a3a'), { pat: P.GLOW, top: c('#ff2a3a'), topPat: P.GLOW })
        } else {
          // A building frame: columns and floor slabs.
          for (let fl = 0; fl < 4; fl += 1) {
            const y = base + fl * 4.5
            box(mb, x, z, y + 4.1, y + 4.5, 7, 7, r, c('#8a8e94'))
            for (const [cx, cz] of [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]]) box(mb, x + r[0] * cx + f[0] * cz, z + r[2] * cx + f[2] * cz, y, y + 4.1, 0.4, 0.4, r, c('#9aa0a6'))
          }
        }
      }
    }
  }

  // Rail yard: tracks and freight wagons on the ground under the rail-yard road.
  for (const ry of decor.railyard || []) {
    for (const lat of [-26, -18, 18, 26]) {
      along(
        ry,
        (a, b) => {
          const ra = levelFrame(a).r
          const rb = levelFrame(b).r
          const pa = [a.x + ra[0] * lat, GROUND_Y, a.z + ra[2] * lat]
          const pb = [b.x + rb[0] * lat, GROUND_Y, b.z + rb[2] * lat]
          if (!onGround(pa[0], pa[2], 2) || !clear(pa[0], pa[2], 2, 1)) return
          const mb = mbAt(pa[0], pa[2])
          beam(mb, [pa[0], GROUND_Y + 0.15, pa[2]], [pb[0], GROUND_Y + 0.15, pb[2]], 3.2, BALLAST, P.PLAIN, 0.3)
          for (const g of [-0.72, 0.72]) beam(mb, [pa[0] + ra[0] * g, GROUND_Y + 0.38, pa[2] + ra[2] * g], [pb[0] + rb[0] * g, GROUND_Y + 0.38, pb[2] + rb[2] * g], 0.14, RAIL, P.PLAIN, 0.16)
        },
        3,
      )
    }
    for (let n = 0; n < 12; n += 1) {
      const i = Math.floor(ry.from + (ry.to - ry.from) * rand())
      const p = path[i]
      const { r } = levelFrame(p)
      const lat = [-26, -18, 18, 26][Math.floor(rand() * 4)]
      const x = p.x + r[0] * lat
      const z = p.z + r[2] * lat
      if (!onGround(x, z, 7) || !clear(x, z, 7, 1) || !free(x, z, 7)) continue
      taken.push({ x, z, rad: 7 })
      const mb = mbAt(x, z)
      box(mb, x, z, GROUND_Y + 0.6, GROUND_Y + 4.2, 1.5, 6.5, r, WAGONS[n % WAGONS.length], { pat: P.STRIPES, top: WAGONS[n % WAGONS.length] })
      box(mb, x, z, GROUND_Y + 0.45, GROUND_Y + 0.6, 1.3, 6.3, r, DARK)
    }
  }

  // Drawbridges: a brick tower either side at each end, lamps on top.
  for (const o of stage.obstacles) {
    if (o.type !== 'drawbridge') continue
    const p0 = path[o.piStart]
    const p1 = path[o.piEnd]
    for (const p of [p0, p1]) {
      const { r } = levelFrame(p)
      for (const side of [-1, 1]) {
        const d = p.w / 2 + 2.2
        const x = p.x + r[0] * side * d
        const z = p.z + r[2] * side * d
        const mb = mbAt(x, z)
        box(mb, x, z, 0, p.y + 9, 1.6, 1.6, r, c('#7a4a3a'), { pat: P.STRIPES })
        box(mb, x, z, p.y + 9, p.y + 10.2, 2, 2, r, ROOF)
        box(mb, x, z, p.y + 10.2, p.y + 10.9, 0.35, 0.35, r, LAMP, { pat: P.GLOW, top: LAMP, topPat: P.GLOW })
      }
    }
  }

  // The car park round the garage helix: a core, corner columns and parapet bands, a lit P.
  for (const g of decor.garage || []) {
    let cx = 0
    let cz = 0
    let y0 = Infinity
    let y1 = -Infinity
    for (let i = g.from; i <= g.to; i += 1) {
      cx += path[i].x
      cz += path[i].z
      y0 = Math.min(y0, path[i].y)
      y1 = Math.max(y1, path[i].y)
    }
    const n = g.to - g.from + 1
    cx /= n
    cz /= n
    const mb = mbAt(cx, cz)
    mb.prism(cx, cz, GROUND_Y, y1 + 4, 9, 12, c('#7f858c'), ROOF, P.FACADE)
    box(mb, cx, cz, y1 + 4, y1 + 9, 0.3, 3.2, [1, 0, 0], c('#2a6bff'), { pat: P.GLOW, top: c('#2a6bff'), topPat: P.GLOW })
    const R = 36
    for (let k = 0; k < 12; k += 1) {
      const a = (k / 12) * Math.PI * 2
      const x = cx + Math.cos(a) * R
      const z = cz + Math.sin(a) * R
      if (!clear(x, z, 1.2, 3)) continue
      box(mb, x, z, GROUND_Y, y1 + 2, 0.9, 0.9, [Math.cos(a), 0, Math.sin(a)], c('#8a9096'))
      const a2 = ((k + 1) / 12) * Math.PI * 2
      const x2 = cx + Math.cos(a2) * R
      const z2 = cz + Math.sin(a2) * R
      if (!clear(x2, z2, 1.2, 3) || !clear((x + x2) / 2, (z + z2) / 2, 1.2, 3)) continue
      for (let lv = y0 - 2; lv <= y1 + 1; lv += 4.5) beam(mb, [x, lv, z], [x2, lv, z2], 1.1, c('#9aa0a6'), P.PLAIN, 0.3)
    }
  }

  // The safehouse: pier piles under the finish plaza and the safehouse warehouse past it.
  for (const sh of decor.safehouse || []) {
    const fin = stage.checkpoints[stage.checkpoints.length - 1]
    const f = [-Math.sin(fin.yaw), 0, -Math.cos(fin.yaw)]
    const r = [Math.cos(fin.yaw), 0, -Math.sin(fin.yaw)]
    const mb = mbAt(fin.x, fin.z)
    for (let a = 8; a < fin.length; a += 14) {
      for (let b = -fin.width / 2 + 6; b <= fin.width / 2 - 6; b += 14) mb.prism(fin.x + f[0] * a + r[0] * b, fin.z + f[2] * a + r[2] * b, -1, fin.y - 1.2, 0.6, 6, c('#3a3530'), DARK)
    }
    const d = fin.length + 16
    const x = fin.x + f[0] * d
    const z = fin.z + f[2] * d
    box(mb, x, z, -1, fin.y + 12, 26, 12, r, c('#5a3a2e'), { pat: P.STRIPES })
    box(mb, x, z, fin.y + 12, fin.y + 14, 25, 5, r, ROOF)
    box(mb, x - f[0] * 12.08, z - f[2] * 12.08, fin.y, fin.y + 8, 9, 0.06, r, c('#ffd89a'), { pat: P.GLOW, top: c('#ffd89a'), topPat: P.GLOW })
    signs.push({ text: 'SAFEHOUSE', sub: 'NO COPS BEYOND THIS POINT', center: [x - f[0] * 12.2, fin.y + 10.4, z - f[2] * 12.2], right: [-r[0], 0, -r[2]], up: [0, 1, 0], width: 16, height: 4, bg: '#1b2a4a', fg: '#ffd23a' })
    void sh
  }

  // --- Street lights and billboards along the roads ---------------------------------
  const inRange = (list, i) => (list || []).some((t) => i >= t.from - 2 && i <= t.to + 2)
  // Street lights for the night pools (heat.jsx): head x, y, z, then the pool's x, y, z on the road.
  const lamps = []
  let side = 1
  for (let s = 10; s < stage.length; s += 38) {
    const i = path.findIndex((p) => p.s >= s)
    if (i < 0) break
    const p = path[i]
    if (p.air || p.w < 8 || inRange(decor.tunnels, i) || inRange(decor.alleys, i)) continue
    if (fps.some((fp) => p.s >= fp.sFrom - 4 && p.s <= fp.sTo + 4)) continue
    side = -side
    const { r } = levelFrame(p)
    const lat = side * (p.w / 2 + 0.35)
    const x = p.x + r[0] * lat
    const z = p.z + r[2] * lat
    const mb = mbAt(x, z)
    beam(mb, [x, p.y - 1.2, z], [x, p.y + 7, z], 0.22, STEEL)
    const ax = x - r[0] * side * 2.2
    const az = z - r[2] * side * 2.2
    beam(mb, [x, p.y + 7, z], [ax, p.y + 7.2, az], 0.14, STEEL)
    mb.box([ax, p.y + 7.05, az], [0.35, 0.12, 0.6], r, [0, 1, 0], [-r[2], 0, r[0]], { top: STEEL, side: LAMP, end: LAMP, bottom: LAMP }, { side: P.GLOW, end: P.GLOW, bottom: P.GLOW })
    lamps.push(ax, p.y + 6.9, az, x - r[0] * side * 3.9, p.y + 0.06, z - r[2] * side * 3.9)
  }

  const BRANDS = [
    ['ZOOMA COLA', 'Fizz that keeps up', '#d8252e', '#ffffff'],
    ['RUSTPORT RADIO 99.1', 'Getaway hits all night', '#1b2a4a', '#ffd23a'],
    ['TURBO NOODLE', 'Ready in 90 seconds', '#ffb020', '#1b1b1b'],
    ['PIXEL PIZZA', 'Hot slices, fast', '#2f9a5a', '#ffffff'],
    ['GRIDLOCK INSURANCE', "We've seen worse", '#3a4a6a', '#ffffff'],
    ['NITRO FIZZ', 'Shake responsibly', '#7a2ad8', '#5fe3ff'],
    ['DOCKSIDE DINER', 'Open 24/7 on Pier 9', '#2a2a2a', '#ff6ec7'],
    ['SKYLINE MOTORS', 'Drive it like you stole it (don\'t)', '#0a6f9c', '#ffffff'],
  ]
  let brand = 0
  for (let s = 140; s < stage.length; s += 260) {
    const i = path.findIndex((p) => p.s >= s)
    if (i < 0) break
    const p = path[i]
    if (p.air) continue
    const { f, r } = levelFrame(p)
    for (const sd of [1, -1]) {
      const d = p.w / 2 + 10
      const x = p.x + r[0] * sd * d
      const z = p.z + r[2] * sd * d
      if (!clear(x, z, 8, 2) || !free(x, z, 8)) continue
      taken.push({ x, z, rad: 8 })
      const mb = mbAt(x, z)
      const base = isGround(Math.floor(x / CELL), Math.floor(z / CELL)) ? GROUND_Y : 0
      const y0 = p.y + 4
      for (const k of [-4.5, 4.5]) beam(mb, [x + r[0] * k, base, z + r[2] * k], [x + r[0] * k, y0 + 0.5, z + r[2] * k], 0.5, STEEL)
      // The board faces back down the road, towards drivers coming.
      box(mb, x, z, y0, y0 + 6, 7.5, 0.3, r, DARK, { top: DARK })
      const [text, sub, bg, fg] = BRANDS[brand % BRANDS.length]
      brand += 1
      signs.push({ text, sub, center: [x - f[0] * 0.36, y0 + 3, z - f[2] * 0.36], right: [-r[0], 0, -r[2]], up: [0, 1, 0], width: 14, height: 5.4, bg, fg })
      break
    }
  }
  void WHITE

  return {
    chunks: [...chunks].map(([key, mb]) => ({ key, geometry: mb.build(), triangles: mb.triangles })),
    signs,
    lamps: new Float32Array(lamps),
  }
}
