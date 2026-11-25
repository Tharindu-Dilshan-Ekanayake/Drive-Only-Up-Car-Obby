import { Color } from 'three'

import { footprintDistance, stageFootprints } from '@shared/track'

import { BANNER_ARTS, RESORT_ARTS } from '../render/banners'
import { MeshBuilder } from '../render/meshBuilder'
import { building, box, GLASS, HARBOUR_ZONES, LAND_Y, RESORT_RINGS, RESORT_WALL, rng, WALLS } from './harbourGeometry'
import { takePrebuilt } from '../prep/prebuilt'

/**
 * The city the track climbs through: towers on concrete platforms out in the sea all
 * along a stage (any map's: pass the stage), each about as tall as the road beside it (so the climb runs between
 * skyscrapers), facing the road, many carrying a billboard at road height.
 *
 * Deterministic (seeded) and kept clear of the road, the pier and the harbour town.
 * Geometry is split into chunks of a few sections each so far-away chunks are culled.
 */

const SECTIONS_PER_CHUNK = 3
const PLATFORM = new Color('#c9ced4')
const SEAWALL = new Color('#7d858f')
const CROWNS = ['#5fe3ff', '#ffc41f', '#ff7a1a', '#7cf25a'].map((h) => new Color(h))
/** Metres of open space between a building's footprint and the road's centre line. */
const ROAD_CLEAR = 18

/** Path points bucketed on a 40 m grid, for quick "how close is the road" queries. */
function pathGrid(stage) {
  const g = new Map()
  for (const p of stage.path) {
    const k = `${Math.floor(p.x / 40)},${Math.floor(p.z / 40)}`
    if (!g.has(k)) g.set(k, [])
    g.get(k).push(p)
  }
  return g
}

/** Distance (xz) from (x, z) to the nearest road point (in `grid`) within `r`, or Infinity. */
function roadDistance(grid, x, z, r) {
  let best = Infinity
  const cx = Math.floor(x / 40)
  const cz = Math.floor(z / 40)
  const n = Math.ceil(r / 40)
  for (let i = -n; i <= n; i += 1) {
    for (let j = -n; j <= n; j += 1) {
      const list = grid.get(`${cx + i},${cz + j}`)
      if (!list) continue
      for (const p of list) {
        const d = Math.hypot(p.x - x, p.z - z)
        if (d < best) best = d
      }
    }
  }
  return best
}

/**
 * The wide pieces - checkpoint plazas and the round platforms (Stunt Bowl, sweeper deck) -
 * reach well past the centre line's ROAD_CLEAR: buildings keep that clear of their edges too.
 */
const PLAZA_REACH = 90
/** Tallest tower (m): the road climbs to ~1,350 m, the towers climb beside it. */
const HEIGHT_CAP = 1600

const inZone = (x, z, m) => HARBOUR_ZONES.some(([x0, z0, x1, z1]) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m)

/** stage -> density -> layout. */
const layoutCache = new WeakMap()

/**
 * Where the buildings go along `stage` for a scenery density (1 = HIGH): an array of
 * building specs with `chunk` (index) and `r` (footprint radius). Cached per stage and density.
 */
export function trackCityLayout(stage, density = 1) {
  let layouts = layoutCache.get(stage)
  if (!layouts) layoutCache.set(stage, (layouts = new Map()))
  if (layouts.has(density)) return layouts.get(density)
  const grid = pathGrid(stage)
  const footprints = stageFootprints(stage)
  const clearOfFootprints = (x, z, m) => footprints.every((fp) => footprintDistance(fp, x, z) >= m)
  /** Path distances of the checkpoint plazas: neon resort towers are commoner within PLAZA_REACH of one. */
  const plazaS = stage.checkpoints.map((cp) => cp.s)
  const rand = rng(90210)
  const out = []
  const spacing = 52 / Math.max(0.3, density)
  const path = stage.path
  let nextS = 140
  for (const p of path) {
    if (p.s < nextS) continue
    nextS = p.s + spacing * (0.7 + rand() * 0.6)
    const len = Math.hypot(p.fx, p.fz) || 1
    const nx = -p.fz / len
    const nz = p.fx / len
    // Try both sides, nearer side first at random.
    const sides = rand() < 0.5 ? [1, -1] : [-1, 1]
    for (const side of sides) {
      const w = 18 + Math.round(rand() * 18)
      const d = 18 + Math.round(rand() * 18)
      const r = Math.hypot(w, d) / 2
      const off = r + ROAD_CLEAR + rand() * 45
      const x = p.x + nx * off * side + (rand() - 0.5) * 20
      const z = p.z + nz * off * side + (rand() - 0.5) * 20
      if (Math.abs(x) < 75 && Math.abs(z) < 75) continue
      if (inZone(x, z, r + 10)) continue
      if (roadDistance(grid, x, z, r + ROAD_CLEAR + 40) < r + ROAD_CLEAR) continue
      if (!clearOfFootprints(x, z, r + 8)) continue
      if (out.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + r + 8)) continue
      // As tall as the road here, give or take; never a stub.
      const road = Math.max(0, p.y - LAND_Y)
      const h = Math.min(HEIGHT_CAP, Math.max(30, road * (0.72 + rand() * 0.42) + 12 + rand() * 20))
      const toRoad = [p.x - x, p.z - z]
      const front = Math.abs(toRoad[0]) > Math.abs(toRoad[1]) ? (toRoad[0] > 0 ? 'e' : 'w') : toRoad[1] > 0 ? 's' : 'n'
      const tall = h > 110
      // Neon resort towers (cream facade, glowing rings, rooftop sign): about one in five,
      // nearly one in two within reach of a checkpoint plaza.
      const nearPlaza = plazaS.some((s) => Math.abs(p.s - s) < PLAZA_REACH)
      const resort = h >= 40 && rand() < (nearPlaza ? 0.45 : 0.08)
      const glass = resort ? false : tall ? rand() < 0.7 : rand() < 0.3
      const spec = {
        x,
        z,
        w,
        d,
        h,
        r,
        front,
        chunk: Math.floor(p.section / SECTIONS_PER_CHUNK),
        style: glass ? 'glass' : 'facade',
        wall: resort ? RESORT_WALL : WALLS[Math.floor(rand() * WALLS.length)],
        glass: GLASS[Math.floor(rand() * GLASS.length)],
        shop: !glass && h < 160,
        bands: resort ? 24 : !glass && h > 60 ? 24 + Math.round(rand() * 3) * 6 : glass && rand() < 0.4 ? 36 : 0,
        tiers: tall && rand() < 0.6 ? [[1, 0.55 + rand() * 0.15], [0.78, 0.86], [0.56, 1]] : tall ? [[1, 0.75], [0.7, 1]] : null,
        crown: !resort && tall && rand() < 0.65 ? CROWNS[Math.floor(rand() * CROWNS.length)] : null,
        roof: resort ? 'tank' : rand() < 0.3 ? 'antenna' : rand() < 0.5 ? 'helipad' : 'tank',
      }
      if (resort) {
        // Rings round the tower near the road's height (where you see them), in our three
        // neon colours in a per-tower order; a sign board on the roof.
        const rot = Math.floor(rand() * 3)
        const lastTier = spec.tiers ? spec.tiers[spec.tiers.length - 1][0] : 1
        const span = (front === 'n' || front === 's' ? w : d) * lastTier
        spec.resort = {
          // (Clamped into the tower; any two that land within 4 m of each other: the second is dropped.)
          rings: [road - 12, road + 9, road + 30]
            .map((y) => Math.min(h - 12, Math.max(10, y)))
            .filter((y, i, all) => all.findIndex((o) => Math.abs(o - y) < 4) === i),
          colors: [0, 1, 2].map((i) => RESORT_RINGS[(i + rot) % 3]),
        }
        spec.rooftop = { art: RESORT_ARTS[Math.floor(rand() * RESORT_ARTS.length)], width: Math.min(20, span * 0.85) }
      }
      // A billboard on about 40% of them: at road height, or near the top of the
      // shorter ones. On a tiered tower it goes on whichever tier is there, sized to fit.
      const bannerY = Math.min(road + 7, h - 12)
      if (!resort && rand() < 0.42 && bannerY > 12) {
        let scale = 1
        if (spec.tiers) {
          for (const [k, frac] of spec.tiers) {
            scale = k
            if (bannerY + 7 < h * frac) break
          }
        }
        const span = (front === 'n' || front === 's' ? w : d) * scale
        spec.banner = { art: BANNER_ARTS[Math.floor(rand() * BANNER_ARTS.length)], y: bannerY, width: Math.min(22, span * 0.85) }
      }
      out.push(spec)
      break
    }
  }
  layouts.set(density, out)
  return out
}

/**
 * Builds the city along `stage`: one geometry per chunk (with each building's platform)
 * and the billboard placements. `detail` adds rooftop clutter and spires (off on LOW).
 */
export function buildTrackCity(stage, density, detail) {
  // Built ahead of time in the prep worker (game/prep), when it was.
  const pre = takePrebuilt('city', stage, { density, detail })
  if (pre) return pre
  const specs = trackCityLayout(stage, density)
  const rand = rng(31337)
  const builders = new Map()
  const out = { banners: [] }
  let triangles = 0
  for (const b of specs) {
    if (!builders.has(b.chunk)) builders.set(b.chunk, new MeshBuilder())
    const mb = builders.get(b.chunk)
    const before = mb.triangles
    box(mb, [b.x - b.w / 2 - 3, -3, b.z - b.d / 2 - 3], [b.x + b.w / 2 + 3, LAND_Y, b.z + b.d / 2 + 3], { top: PLATFORM, side: SEAWALL, end: SEAWALL, bottom: SEAWALL })
    building(mb, out, b, detail, rand)
    triangles += mb.triangles - before
  }
  const chunks = [...builders.entries()].map(([chunk, mb]) => ({ chunk, geometry: mb.build() }))
  return { chunks, banners: out.banners, triangles, count: specs.length }
}
