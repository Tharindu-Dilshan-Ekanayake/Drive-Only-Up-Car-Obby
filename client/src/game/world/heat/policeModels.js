import { Color } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { arches, bumper, createKit, finishPaint, grille, lamps, lens, mirrors, plate, seam, shade } from '../../cars/carModels'
import { PATTERN } from '../../render/worldMaterial'

/**
 * Heat Run's police fleet: original low-poly vehicles in the same chunky toy style as the
 * player cars (built with the car kit from cars/carModels.js, vertex colours, one merged
 * geometry each, drawn with the car paint). Not in the car catalog - nobody owns them.
 *
 * - patrol:  the Rustport patrol car - navy body, white doors, a light bar
 * - cab:     the interceptor - an unmarked yellow taxi-style cab, lights hidden in the grille
 * - jeep:    the police jeep - tall, a steel bull bar, rams hard
 * - bike:    the police motorbike - fast and light (two wheels)
 * - tank:    the armoured riot truck - six-wheel armour, a foam cannon on the roof
 * - heli:    the helicopter - body only; its rotor is a separate mesh (`HELI_ROTOR`)
 *
 * Local frame as the cars: faces -Z, origin at wheel-centre height mid-wheelbase.
 * Each model: `{ geometry, wheels: { radius, width, positions }, half, offset, bar,
 * muzzle?, knock, lights }` - `half`/`offset` the collision box (half extents, centre), `bar`
 * the siren lamps (left red, right blue; their lenses flash in the shader), `muzzle` where a
 * gadget is fired from, `lights` the head / tail lamp centres (night lights).
 */

const NAVY = '#1b2a4a'
const WHITE = '#eef2f7'
const DARK = '#24282e'
const INK = '#121418'
const STEEL = '#8f99a4'
const CHROME = '#d7dde3'
const RED = '#ff2a3a'
const BLUE = '#2a6bff'
const GLASS = '#3a5878'
const TAXI = '#ffc21a'
const OLIVE = '#2f3d3a'
const SLATE = '#4a525e'
const HAZARD = '#ffc41f'

/** A light bar on the roof at height y, centre z, half-width hw: dark housing and red / blue lenses. Returns the lamp centres. */
function lightBar(k, y, z, hw = 0.55) {
  k.box(hw * 2 + 0.1, 0.1, 0.3, 0, y, z, DARK, { bevel: 0.03 })
  k.box(hw * 0.9, 0.12, 0.24, -hw / 2, y + 0.08, z, RED, { glow: true, bevel: 0.02 })
  k.box(hw * 0.9, 0.12, 0.24, hw / 2, y + 0.08, z, BLUE, { glow: true, bevel: 0.02 })
  return [
    [-hw / 2, y + 0.1, z],
    [hw / 2, y + 0.1, z],
  ]
}

const BUILDERS = {
  patrol(k) {
    const deep = shade(NAVY, 0.7)
    k.box(1.9, 0.55, 4.3, 0, 0.3, 0, NAVY, { top: [0.97, 0.96], bevel: 0.1 })
    k.box(1.84, 0.16, 1.3, 0, 0.64, -1.45, NAVY, { top: [0.92, 0.85], shift: 0.08, bevel: 0.05 })
    k.box(1.8, 0.12, 0.9, 0, 0.6, 1.65, NAVY, { top: [0.92, 0.85], bevel: 0.04 })
    k.box(1.66, 0.55, 2.0, 0, 0.84, 0.15, GLASS, { top: [0.86, 0.66], shift: 0.06, bevel: 0.05 })
    k.box(1.5, 0.08, 1.2, 0, 1.15, 0.2, WHITE, { bevel: 0.03 })
    // White doors (the livery) and a red stripe under them.
    k.pair((s) => k.box(0.04, 0.42, 1.9, s * 0.955, 0.32, 0.05, WHITE))
    k.pair((s) => k.box(0.05, 0.07, 3.6, s * 0.96, 0.08, 0.0, RED))
    seam(k, 0.975, 0.33, 0.1, 0.42, deep)
    k.pair((s) => k.box(0.03, 0.04, 0.14, s * 0.98, 0.46, -0.25, CHROME))
    arches(k, { x: 0.86, zf: -1.35, zr: 1.3, y: 0.42, color: deep })
    // Push bar, grille, lamps, mirrors.
    k.box(1.4, 0.32, 0.12, 0, 0.22, -2.24, DARK, { bevel: 0.03 })
    k.pair((s) => k.box(0.1, 0.5, 0.1, s * 0.5, 0.3, -2.2, DARK))
    grille(k, 0.8, 0.14, 0, 0.36, -2.16, { slats: 2, frame: DARK, slat: STEEL })
    bumper(k, { w: 1.95, y: 0.08, z: -2.12, color: DARK })
    bumper(k, { w: 1.95, y: 0.08, z: 2.15, color: DARK })
    mirrors(k, 0.98, 0.7, -0.75, NAVY)
    const lights = lamps(k, { hw: 0.66, front: -2.15, rear: 2.16, y: 0.4, ly: 0.46 })
    plate(k, 0.12, 2.28)
    const bar = lightBar(k, 1.22, 0.1)
    return { wheels: { radius: 0.44, width: 0.36, x: 0.86, zf: -1.35, zr: 1.3 }, bar, lights, knock: 1 }
  },

  cab(k) {
    const deep = shade(TAXI, 0.66)
    k.box(1.85, 0.58, 4.2, 0, 0.3, 0, TAXI, { top: [0.96, 0.96], bevel: 0.1 })
    k.box(1.8, 0.16, 1.2, 0, 0.66, -1.45, TAXI, { top: [0.9, 0.85], shift: 0.1, bevel: 0.05 })
    k.box(1.62, 0.52, 2.1, 0, 0.86, 0.2, GLASS, { top: [0.86, 0.7], shift: 0.06, bevel: 0.05 })
    k.box(1.46, 0.08, 1.3, 0, 1.15, 0.25, TAXI, { bevel: 0.03 })
    // Chequer stripe along the doors, and a roof sign (dark: it's off duty...).
    for (let i = 0; i < 8; i += 1) k.pair((s) => k.box(0.04, 0.09, 0.24, s * 0.935, 0.46, -1.0 + i * 0.3, i % 2 ? INK : WHITE))
    k.box(0.7, 0.2, 0.26, 0, 1.3, 0.3, DARK, { bevel: 0.04 })
    seam(k, 0.93, 0.34, -0.3, 0.42, deep)
    seam(k, 0.93, 0.34, 0.72, 0.42, deep)
    arches(k, { x: 0.84, zf: -1.3, zr: 1.28, y: 0.42, color: deep })
    bumper(k, { w: 1.9, y: 0.08, z: -2.1, color: CHROME })
    bumper(k, { w: 1.9, y: 0.08, z: 2.1, color: CHROME })
    grille(k, 0.9, 0.16, 0, 0.36, -2.08, { slats: 2, frame: CHROME })
    mirrors(k, 0.96, 0.72, -0.7, TAXI)
    const lights = lamps(k, { hw: 0.64, front: -2.08, rear: 2.1, y: 0.4, ly: 0.46 })
    plate(k, 0.12, 2.22)
    // Hidden lights: a pair of red / blue lenses in the grille and on the dash.
    lens(k, -0.25, 0.36, -2.13, 0.16, 0.08, RED)
    lens(k, 0.25, 0.36, -2.13, 0.16, 0.08, BLUE)
    return {
      wheels: { radius: 0.44, width: 0.36, x: 0.84, zf: -1.3, zr: 1.28 },
      bar: [
        [-0.25, 0.4, -2.16],
        [0.25, 0.4, -2.16],
      ],
      lights,
      knock: 1,
    }
  },

  jeep(k) {
    const deep = shade(OLIVE, 0.7)
    k.box(2.0, 0.75, 4.1, 0, 0.5, 0, OLIVE, { bevel: 0.08 })
    k.box(1.96, 0.24, 1.25, 0, 0.98, -1.35, OLIVE, { top: [0.95, 0.9], bevel: 0.05 })
    k.box(1.9, 0.72, 2.3, 0, 1.25, 0.35, GLASS, { top: [0.94, 0.86], shift: 0.04, bevel: 0.05 })
    k.box(1.8, 0.1, 2.1, 0, 1.64, 0.38, WHITE, { bevel: 0.03 })
    k.pair((s) => k.box(0.05, 0.3, 3.2, s * 1.0, 0.62, 0.1, WHITE))
    k.pair((s) => k.box(0.05, 0.06, 3.2, s * 1.005, 0.44, 0.1, BLUE))
    arches(k, { x: 0.95, zf: -1.35, zr: 1.35, y: 0.7, color: deep, w: 0.42 })
    // Steel bull bar and a winch.
    k.box(1.9, 0.12, 0.12, 0, 0.3, -2.25, STEEL)
    k.box(1.7, 0.12, 0.12, 0, 0.75, -2.2, STEEL)
    k.pair((s) => k.box(0.12, 0.65, 0.12, s * 0.7, 0.52, -2.22, STEEL))
    k.box(0.5, 0.18, 0.2, 0, 0.3, -2.12, DARK)
    grille(k, 1.1, 0.3, 0, 0.6, -2.06, { slats: 3, frame: DARK, slat: STEEL })
    bumper(k, { w: 2.05, y: 0.15, z: 2.12, color: DARK })
    k.cyl(0.42, 0.24, 0, 0.75, 2.2, INK, { axis: 'z', segs: 10 }) // spare wheel
    mirrors(k, 1.08, 1.12, -0.8, OLIVE)
    const lights = lamps(k, { hw: 0.7, front: -2.06, rear: 2.07, y: 0.62, ly: 0.7 })
    const bar = lightBar(k, 1.74, 0.0, 0.62)
    return { wheels: { radius: 0.52, width: 0.42, x: 0.95, zf: -1.35, zr: 1.35 }, bar, lights, knock: 0.55 }
  },

  bike(k) {
    // Frame, tank, seat, fairing with a screen, panniers; the rider (helmeted) on top.
    k.box(0.3, 0.3, 1.5, 0, 0.35, 0, DARK, { bevel: 0.05 })
    k.box(0.5, 0.35, 0.7, 0, 0.6, -0.35, WHITE, { top: [0.8, 0.85], bevel: 0.08 })
    k.box(0.42, 0.12, 0.7, 0, 0.72, 0.3, INK, { bevel: 0.04 })
    k.box(0.6, 0.5, 0.35, 0, 0.75, -0.85, WHITE, { top: [0.7, 0.6], shift: -0.08, bevel: 0.06 })
    k.box(0.44, 0.3, 0.05, 0, 1.08, -0.92, GLASS, { r: [-0.4, 0, 0] })
    k.pair((s) => k.box(0.22, 0.4, 0.55, s * 0.36, 0.55, 0.6, NAVY, { bevel: 0.05 }))
    k.box(0.1, 0.5, 0.1, 0, 0.3, -1.0, CHROME, { r: [0.35, 0, 0] }) // fork
    k.box(0.7, 0.05, 0.05, 0, 1.0, -0.65, DARK) // bars
    k.box(0.44, 0.55, 0.3, 0, 1.15, 0.15, NAVY, { top: [0.8, 0.8], bevel: 0.06 }) // rider's body
    k.gem(0.2, 0, 1.58, 0.05, WHITE, [1, 1.05, 1.15], { detail: 1 }) // helmet
    k.box(0.24, 0.08, 0.04, 0, 1.58, -0.14, INK)
    k.pair((s) => k.box(0.12, 0.4, 0.12, s * 0.22, 1.05, -0.3, NAVY, { r: [-0.9, 0, 0] })) // arms
    const lights = { head: [lens(k, 0, 0.78, -1.04, 0.2, 0.1, '#fff6c8')], tail: [lens(k, 0, 0.62, 0.9, 0.18, 0.08, '#ff3b3b', 1)] }
    // Lamps on the fairing's corners.
    lens(k, -0.26, 0.9, -1.01, 0.08, 0.08, RED)
    lens(k, 0.26, 0.9, -1.01, 0.08, 0.08, BLUE)
    return {
      wheels: { radius: 0.38, width: 0.2, positions: [[0, 0, -0.95], [0, 0, 0.85]] },
      bar: [
        [-0.26, 0.92, -1.05],
        [0.26, 0.92, -1.05],
      ],
      lights,
      knock: 2,
    }
  },

  tank(k) {
    const deep = shade(SLATE, 0.7)
    // Armoured hull (sloped front plate), cab with slit windows, six wheel arches.
    k.box(2.5, 1.1, 5.4, 0, 0.75, 0.1, SLATE, { top: [0.92, 0.9], bevel: 0.12 })
    k.box(2.4, 0.5, 1.2, 0, 0.62, -2.75, SLATE, { top: [0.9, 0.4], shift: 0.3, bevel: 0.08 })
    k.box(2.2, 0.6, 2.6, 0, 1.6, -0.3, deep, { top: [0.88, 0.85], bevel: 0.1 })
    k.box(1.8, 0.16, 0.05, 0, 1.68, -1.62, GLASS)
    k.pair((s) => k.box(0.05, 0.16, 1.4, s * 1.1, 1.68, -0.4, GLASS))
    k.pair((s) => k.box(0.06, 0.18, 5.0, s * 1.26, 0.5, 0.1, HAZARD, { stripe: [6, 6, 0] }))
    for (const z of [-1.7, 0.1, 1.9]) k.pair((s) => k.box(0.3, 0.2, 1.3, s * 1.2, 1.05, z, deep, { bevel: 0.04 }))
    // Ram plate.
    k.box(2.6, 0.7, 0.2, 0, 0.45, -3.25, STEEL, { bevel: 0.05 })
    // Foam cannon turret on the roof.
    k.cyl(0.6, 0.35, 0, 2.08, -0.2, SLATE, { segs: 10 })
    k.cyl(0.18, 1.5, 0, 2.2, -1.1, DARK, { axis: 'z', segs: 8 })
    k.cyl(0.24, 0.2, 0, 2.2, -1.85, WHITE, { axis: 'z', segs: 8 })
    const lights = lamps(k, { hw: 0.9, front: -3.36, rear: 2.82, y: 0.85, ly: 0.9 })
    const bar = lightBar(k, 1.98, 0.9, 0.7)
    return {
      wheels: { radius: 0.62, width: 0.5, positions: [[-1.12, 0, -1.7], [1.12, 0, -1.7], [-1.12, 0, 1.9], [1.12, 0, 1.9]] },
      bar,
      muzzle: [0, 2.2, -2.0],
      lights,
      knock: 0.22,
    }
  },

  heli(k) {
    // Body pod, glass nose, tail boom, tail fin with its rotor, skids, searchlight.
    k.box(2.0, 1.7, 3.6, 0, 0, 0, NAVY, { top: [0.85, 0.8], bottom: [0.9, 0.9], bevel: 0.25 })
    k.box(1.8, 1.3, 1.3, 0, 0.05, -2.0, GLASS, { top: [0.7, 0.6], bottom: [0.85, 0.7], shift: 0.2, bevel: 0.2 })
    k.pair((s) => k.box(0.04, 0.5, 2.6, s * 1.0, -0.15, 0.2, WHITE))
    k.box(0.4, 0.4, 4.4, 0, 0.3, 3.8, NAVY, { top: [0.6, 1], bevel: 0.08 })
    k.box(0.12, 1.4, 0.8, 0, 0.9, 5.8, WHITE, { bevel: 0.05 })
    k.box(1.5, 0.08, 0.5, 0, 0.4, 5.6, NAVY)
    k.cyl(0.6, 0.06, 0.12, 0.9, 5.9, STEEL, { axis: 'x', segs: 8 })
    k.pair((s) => {
      k.box(0.1, 0.1, 3.4, s * 0.9, -1.25, 0.1, DARK)
      k.box(0.08, 0.5, 0.08, s * 0.8, -1.0, -0.8, DARK)
      k.box(0.08, 0.5, 0.08, s * 0.8, -1.0, 0.9, DARK)
    })
    k.cyl(0.25, 0.4, 0, 1.0, 0, DARK, { segs: 8 }) // mast
    k.cyl(0.28, 0.3, 0, -0.95, -1.6, CHROME, { segs: 8 }) // searchlight
    lens(k, 0, -1.12, -1.6, 0.3, 0.06, '#fff6c8')
    const bar = [
      [-1.0, -0.6, -0.2],
      [1.0, -0.6, -0.2],
    ]
    k.box(0.12, 0.12, 0.12, -1.02, -0.6, -0.2, RED, { glow: true })
    k.box(0.12, 0.12, 0.12, 1.02, -0.6, -0.2, BLUE, { glow: true })
    return { wheels: { radius: 0, width: 0, positions: [] }, bar, muzzle: [0, -1.3, 0], lights: { head: [], tail: [] }, knock: 0 }
  },
}

const RED_LIN = new Color(RED)
const BLUE_LIN = new Color(BLUE)
/** Self-lit lenses in the siren red / blue become PATTERN.SIREN_RED / SIREN_BLUE: they flash in turn (render/worldMaterial.js). */
function markSirens(geometry) {
  const pat = geometry.attributes.aPattern.array
  const col = geometry.attributes.color.array
  const near = (i, c) => Math.abs(col[i * 3] - c.r) + Math.abs(col[i * 3 + 1] - c.g) + Math.abs(col[i * 3 + 2] - c.b) < 0.002
  for (let i = 0, n = pat.length / 2; i < n; i += 1) {
    if (pat[i * 2] !== PATTERN.GLOW) continue
    if (near(i, RED_LIN)) pat[i * 2] = PATTERN.SIREN_RED
    else if (near(i, BLUE_LIN)) pat[i * 2] = PATTERN.SIREN_BLUE
  }
  geometry.attributes.aPattern.needsUpdate = true
}

/** Every police vehicle kind, in spawn-table order. */
export const POLICE_KINDS = ['patrol', 'cab', 'jeep', 'bike', 'tank', 'heli']

const cache = new Map()

/** The model of police vehicle `kind` (built once, cached). */
export function getPoliceModel(kind) {
  let m = cache.get(kind)
  if (m) return m
  const k = createKit()
  const spec = BUILDERS[kind](k)
  const geometry = mergeGeometries(k.parts, false)
  for (const p of k.parts) p.dispose()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.name = `police:${kind}`
  finishPaint(geometry, { glass: GLASS })
  markSirens(geometry)
  const box = geometry.boundingBox
  const w = spec.wheels
  const positions = w.positions || [
    [-w.x, 0, w.zf],
    [w.x, 0, w.zf],
    [-w.x, 0, w.zr],
    [w.x, 0, w.zr],
  ]
  m = {
    kind,
    geometry,
    wheels: { radius: w.radius, width: w.width, positions },
    // Collision box a touch inside the drawn body (as physics/carBody.js does for cars).
    half: [((box.max.x - box.min.x) / 2) * 0.92, (box.max.y - box.min.y) / 2, ((box.max.z - box.min.z) / 2) * 0.94],
    offset: [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2],
    bar: spec.bar,
    muzzle: spec.muzzle || [0, 1.2, -2],
    knock: spec.knock,
    // Head / tail lamp centres, for the night lights (fx/carLights.js).
    lights: spec.lights,
  }
  cache.set(kind, m)
  return m
}

/** The helicopter's main rotor: two crossed blades, built once (unit: spins about +Y). */
export function getRotorModel() {
  let m = cache.get('rotor')
  if (m) return m
  const k = createKit()
  k.box(9, 0.06, 0.35, 0, 0, 0, DARK)
  k.box(0.35, 0.06, 9, 0, 0, 0, DARK)
  k.cyl(0.3, 0.2, 0, 0, 0, STEEL, { segs: 8 })
  const geometry = mergeGeometries(k.parts, false)
  for (const p of k.parts) p.dispose()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.name = 'police:rotor'
  finishPaint(geometry, { glass: GLASS })
  m = { geometry }
  cache.set('rotor', m)
  return m
}

/** Frees the fleet's geometries (Heat Run unmounted). */
export function disposePoliceModels() {
  for (const m of cache.values()) m.geometry.dispose()
  cache.clear()
}
