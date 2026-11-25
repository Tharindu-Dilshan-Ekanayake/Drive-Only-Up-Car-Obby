import { Color } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { CAR_BY_ID, carById } from '@shared/cars'
import { DEFAULT_PAINT, paintColor } from '@shared/cosmetics'

import { PATTERN } from '../render/worldMaterial'
import { BUILDERS } from './carBuilders'
import { BUILDERS_2 } from './carBuilders2'
import { BUILDERS_3 } from './carBuilders3'
import {
  arches,
  bumper,
  CHROME,
  createKit,
  grille,
  HEADLIGHT,
  lamps,
  lens,
  lin,
  mirrors,
  pipe,
  plate,
  pushTri,
  rawPart,
  ring,
  RUBBER,
  seam,
  shade,
  TAILLIGHT,
} from './carKit'
import { MORE_BUILDERS } from './moreCars'
import { SPORTS_BUILDERS } from './sportsCars'

/**
 * Procedural car models: every car in shared/cars.js sculpted with the car kit
 * (cars/carKit.js: smooth lofted shells, surface decals for lamps / grilles / trims,
 * extruded wings, lathed details), painted with vertex colours and merged into ONE
 * geometry per car (one draw call, no textures, nothing to download). Builders live in
 * carBuilders.js (the garage's original 30), sportsCars.js (the sports-car wave) and moreCars.js (the next six).
 *
 * Every model also has a level-of-detail body (`lodGeometry`, ~1/3 of the triangles: the
 * same builder run with a coarse kit) for far cars, the lobby's parked cars on LOW and
 * Heat Run traffic (CarRig swaps it by distance).
 *
 * Drawn with the car paint (cars/carMaterial.js; the world material's patterns): every
 * vertex carries `aPattern` (x = pattern id, y = coordinate). Lamps are PATTERN.GLOW
 * (self-lit) and become HEADLAMP / TAILLAMP (finishPaint), windows CARGLASS, hazard bars
 * PATTERN.HAZARD.
 *
 * Local frame: the car faces -Z, +X is its right, the origin sits at wheel-centre height
 * in the middle of the wheelbase. Wheels are NOT part of the body: draw WHEEL_GEOMETRY
 * (unit radius, unit width, axle along X) scaled by `wheels.radius` / `wheels.width` at
 * each of `wheels.positions` (FL, FR, RL, RR; `front` lists the steering ones).
 */

const HEAD_LIN = new Color(HEADLIGHT)
const TAIL_LIN = new Color(TAILLIGHT)

const ALL_BUILDERS = { ...BUILDERS, ...BUILDERS_2, ...BUILDERS_3, ...SPORTS_BUILDERS, ...MORE_BUILDERS }

// --- public API --------------------------------------------------------------------

const cache = new Map()

/** Builds one body geometry (full or LOD) and its builder's spec. */
function buildBody(build, colors, lo, name) {
  const kit = createKit(lo)
  const spec = build(kit, colors)
  const geometry = mergeGeometries(kit.parts, false)
  for (const p of kit.parts) p.dispose()
  geometry.computeBoundingSphere()
  geometry.computeBoundingBox()
  geometry.name = name
  finishPaint(geometry, colors)
  return { geometry, spec }
}

/**
 * The model for `carId` (falls back to the starter for unknown ids), built once and
 * cached. The geometry has position, normal, color and aPattern attributes: draw it
 * with the car material (or any material with `vertexColors: true`).
 *
 * `lights` is an array of every lamp centre (head, then tail, then beacons) that also
 * carries `lights.head`, `lights.tail` and (some cars) `lights.beacon` arrays.
 * `lodGeometry` is the low-detail body (same frame, same lamps and size).
 *
 * @returns {{ geometry: import('three').BufferGeometry, lodGeometry: import('three').BufferGeometry,
 *   wheels: { radius: number, width: number, positions: number[][], front: number[] },
 *   size: number[], exhausts: number[][], electric: boolean,
 *   lights: number[][] & { head: number[][], tail: number[][], beacon: number[][] } }}
 */
export function getCarModel(carId, paintId = DEFAULT_PAINT) {
  const car = carById(carId)
  const paint = paintColor(paintId)
  const key = paint ? `${car.id}:${paintId}` : car.id
  if (cache.has(key)) return cache.get(key)
  // A Store paint (shared/cosmetics.js) replaces the body colour; trim, glass and
  // lights stay the car's own.
  const colors = paint ? { ...car.colors, body: paint } : car.colors
  const build = ALL_BUILDERS[car.kind] || ALL_BUILDERS.buggy
  const { geometry, spec } = buildBody(build, colors, false, `car:${key}`)
  const lod = buildBody(build, colors, true, `car:${key}:lod`).geometry
  const { radius, width, x, zf, zr } = spec.wheels
  const beacon = spec.beacon || []
  const lights = [...spec.head, ...spec.tail, ...beacon]
  lights.head = spec.head
  lights.tail = spec.tail
  lights.beacon = beacon
  const model = {
    geometry,
    lodGeometry: lod,
    wheels: {
      radius,
      width,
      positions: [
        [-x, 0, zf],
        [x, 0, zf],
        [-x, 0, zr],
        [x, 0, zr],
      ],
      front: [0, 1],
    },
    size: spec.size,
    exhausts: spec.exhausts,
    electric: Boolean(spec.electric),
    lights,
    rim: rimColor(colors),
  }
  cache.set(key, model)
  return model
}

/** True if `carId` is a known car (else getCarModel falls back to the starter). */
export const hasCarModel = (carId) => Boolean(CAR_BY_ID[carId])

/**
 * Paint finishing over a merged body: windows (vertices in the car's glass colour) get
 * PATTERN.CARGLASS - stronger reflections and a highlight streak, with the car-local
 * coordinate it needs - and every part that isn't a lamp gets baked ambient occlusion:
 * darker low down and underneath, so the bodies read solid instead of flat.
 */
function finishPaint(geometry, colors) {
  const pos = geometry.attributes.position.array
  const nrm = geometry.attributes.normal.array
  const col = geometry.attributes.color.array
  const pat = geometry.attributes.aPattern.array
  const glass = new Color(colors.glass)
  const gr = glass.r
  const gg = glass.g
  const gb = glass.b
  // Head / tail lamp lenses (self-lit parts in exactly the lamp colours) become HEADLAMP /
  // TAILLAMP: lit like a lens by day, glowing at night (render/worldMaterial.js).
  const lamp = (r, g, b, c) => Math.abs(r - c.r) + Math.abs(g - c.g) + Math.abs(b - c.b) < 0.002
  const bb = geometry.boundingBox
  const y0 = bb.min.y
  const span = Math.max(0.5, bb.max.y - y0)
  for (let i = 0, n = pos.length / 3; i < n; i += 1) {
    const kind = pat[i * 2]
    const r = col[i * 3]
    const g = col[i * 3 + 1]
    const b = col[i * 3 + 2]
    if (kind === PATTERN.GLOW) {
      if (lamp(r, g, b, HEAD_LIN)) pat[i * 2] = PATTERN.HEADLAMP
      else if (lamp(r, g, b, TAIL_LIN)) pat[i * 2] = PATTERN.TAILLAMP
      continue
    }
    if (kind === PATTERN.PULSE || kind >= PATTERN.HEADLAMP) continue
    if (kind === 0 && Math.abs(r - gr) + Math.abs(g - gg) + Math.abs(b - gb) < 0.002) {
      pat[i * 2] = PATTERN.CARGLASS
      pat[i * 2 + 1] = pos[i * 3] * 0.8 + pos[i * 3 + 1] * 1.6 + pos[i * 3 + 2] * 0.35
    }
    // Height up the car (0..1) and whether the face looks down.
    const h = (pos[i * 3 + 1] - y0) / span
    const down = Math.max(0, -nrm[i * 3 + 1])
    const ao = (0.8 + 0.2 * Math.min(1, h * 1.8)) * (1 - 0.3 * down)
    col[i * 3] = r * ao
    col[i * 3 + 1] = g * ao
    col[i * 3 + 2] = b * ao
  }
  geometry.attributes.color.needsUpdate = true
  geometry.attributes.aPattern.needsUpdate = true
}

/** The wheel rims' colour for a car: its `rim` or trim, or chrome when that is too dark. */
function rimColor(colors) {
  const c = new Color(colors.rim || colors.trim)
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  return lum < 0.05 ? new Color(CHROME) : c
}

// --- wheels --------------------------------------------------------------------------

// Rim parts are near-white so the wheel batch's per-car instance colour tints them
// (cars/carMaterial.js: only bright parts take the tint); rubber, the barrel and the
// brake disc stay dark.
const RIM = '#eef1f4'
const SIDEWALL = '#2a2d33'
const BARREL = '#34383e'
const DISC = '#5a5f66'

function mergeKit(kit, name) {
  const g = mergeGeometries(kit.parts, false)
  for (const p of kit.parts) p.dispose()
  g.computeBoundingSphere()
  g.name = name
  return g
}

/**
 * The full wheel (~320 triangles): a tyre with sidewalls and rounded shoulders, a rim
 * flange and a dark barrel, a brake disc behind five slightly concave spokes and a
 * centre cap - on both faces (the same wheel turns either way out). Axle along X.
 */
function buildWheel() {
  const kit = createKit()
  kit.lathe(
    [
      [0.63, -0.455],
      [0.71, -0.45],
      [0.95, -0.49],
      [1.0, -0.34],
      [1.0, 0.34],
      [0.95, 0.49],
      [0.71, 0.45],
      [0.63, 0.455],
      [0.63, -0.455],
    ],
    0,
    0,
    0,
    [RIM, SIDEWALL, RUBBER, RUBBER, RUBBER, SIDEWALL, RIM, BARREL],
    { axis: 'x', segs: 14 },
  )
  const pos = []
  const nrm = []
  const col = []
  const cc = lin(RIM)
  for (const s of [-1, 1]) {
    kit.fan(ring(12, 0.5), s * 0.2, s, DISC)
    kit.fan(ring(6, 0.17, 0.17, Math.PI / 6), s * 0.47, s, '#dfe4ea')
    // Spokes: hub (r 0.15, set in) to the flange (r 0.64), tapering, as a raised wedge.
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + (s > 0 ? 0 : Math.PI / 5)
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const tx = -sa
      const ty = ca
      const P = (r, half, x) => [x, ca * r + tx * half, sa * r + ty * half]
      const xi = s * 0.4
      const xo = s * 0.455
      const back = s * -0.07
      const h0 = P(0.15, -0.075, xi)
      const h1 = P(0.15, 0.075, xi)
      const r0 = P(0.64, -0.045, xo)
      const r1 = P(0.64, 0.045, xo)
      const h0b = P(0.15, -0.075, xi + back)
      const h1b = P(0.15, 0.075, xi + back)
      const r0b = P(0.64, -0.045, xo + back)
      const r1b = P(0.64, 0.045, xo + back)
      const out = [s, 0, 0]
      const fn = out
      pushTri(pos, nrm, col, h0, r0, r1, fn, fn, fn, out, cc)
      pushTri(pos, nrm, col, h0, r1, h1, fn, fn, fn, out, cc)
      const sideA = [0, -tx, -ty]
      const sideB = [0, tx, ty]
      pushTri(pos, nrm, col, h0, h0b, r0b, sideA, sideA, sideA, sideA, cc)
      pushTri(pos, nrm, col, h0, r0b, r0, sideA, sideA, sideA, sideA, cc)
      pushTri(pos, nrm, col, h1, r1b, h1b, sideB, sideB, sideB, sideB, cc)
      pushTri(pos, nrm, col, h1, r1, r1b, sideB, sideB, sideB, sideB, cc)
    }
  }
  kit.parts.push(rawPart(pos, nrm, col))
  return mergeKit(kit, 'car:wheel')
}

/** The far wheel (~90 triangles): tyre band and flat rim faces. */
function buildWheelLod() {
  const kit = createKit()
  kit.lathe(
    [
      [0.66, -0.46],
      [0.95, -0.49],
      [1.0, -0.3],
      [1.0, 0.3],
      [0.95, 0.49],
      [0.66, 0.46],
    ],
    0,
    0,
    0,
    [SIDEWALL, RUBBER, RUBBER, RUBBER, SIDEWALL],
    { axis: 'x', segs: 8 },
  )
  for (const s of [-1, 1]) kit.fan(ring(8, 0.67), s * 0.46, s, RIM)
  return mergeKit(kit, 'car:wheel:lod')
}

/** Brake callipers (both faces), posed with the wheel's steer but not its spin. */
function buildCaliper() {
  const kit = createKit()
  const a = 0.75
  for (const s of [-1, 1]) {
    kit.box(0.17, 0.14, 0.3, s * 0.27, Math.sin(a) * 0.46, Math.cos(a) * 0.46, '#c4262c', { r: [-a + Math.PI / 2, 0, 0], top: [0.8, 0.85] })
  }
  return mergeKit(kit, 'car:caliper')
}

/**
 * Shared wheel: unit radius, unit width, axle along X, centred at the origin. Scale by
 * (width, radius, radius) per car; spin about X.
 */
export const WHEEL_GEOMETRY = buildWheel()
/** The same wheel for far cars (CarRig's wheel batch picks it by distance). */
export const WHEEL_LOD_GEOMETRY = buildWheelLod()
/** Brake callipers in the wheel's frame: drawn with the steer, never the spin. */
export const CALIPER_GEOMETRY = buildCaliper()

/** Frees every cached car geometry (on context loss / unmount). Wheel geometries stay. */
export function disposeCarModels() {
  for (const m of cache.values()) {
    m.geometry.dispose()
    m.lodGeometry.dispose()
  }
  cache.clear()
}

/** Triangle count of a model's body (non-indexed geometry). */
export const triangleCount = (geometry) => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3

/**
 * The part kit and shared details, for vehicle models made elsewhere in the same style
 * (Heat Run's police fleet, game/world/heat/policeModels.js): build parts with a kit, merge
 * them, then finishPaint the merged geometry (computeBoundingBox first).
 */
export { createKit, finishPaint, lamps, lens, grille, mirrors, bumper, plate, arches, pipe, seam, shade, ring }
