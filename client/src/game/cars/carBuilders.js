import {
  AMBER,
  archBand,
  bar,
  BLACK,
  CHROME,
  DARK,
  DIAG,
  greenhouse,
  handles,
  HAZARD,
  HEADLIGHT,
  INK,
  lampPair,
  NAV_GREEN,
  NAV_RED,
  noseGrille,
  paints,
  plateOn,
  rearWing,
  roadBody,
  roundel,
  roundLamp,
  shade,
  sideMirrors,
  STEEL,
  sweep,
  tailpipes,
  TAILLIGHT,
  torus,
  tube,
  tyre,
  WHITE,
  WOOD,
} from './carKit'

/**
 * The garage's original 30 cars, sculpted with the car kit (cars/carKit.js): smooth
 * lofted shells with real-car proportions, greenhouses, surface lamps and grilles. Each
 * builder adds its parts to `k` (full or LOD kit) and returns the model's metrics:
 * { wheels, size, exhausts, head, tail, beacon? }. Wheel placement and size feed the
 * physics: keep them as they are.
 */

export const CREAM = '#f3ead2'
export const GOLD = '#ffd23a'
export const HOVER = '#4ff3ff'
export const ICE = '#d8f3ff'
export const VELVET = '#b3122e'

/** An aerofoil section [[z, y], ...] of chord c and thickness t (wings, front wings). */
export const foil = (c, t) => [
  [-c / 2, 0],
  [-c * 0.35, t * 0.7],
  [0, t],
  [c * 0.35, t * 0.75],
  [c / 2, t * 0.2],
  [c / 2, 0],
  [0, -t * 0.12],
]

/** An arc band outline [[z, y], ...] (mudguards): radii r0..r1 from angle a0 to a1 (0 = forward). */
export function arcBand(r0, r1, a0, a1, n = 8) {
  const pts = []
  for (let i = 0; i <= n; i += 1) {
    const a = a0 + ((a1 - a0) * i) / n
    pts.push([-Math.cos(a) * r1, Math.sin(a) * r1])
  }
  for (let i = n; i >= 0; i -= 1) {
    const a = a0 + ((a1 - a0) * i) / n
    pts.push([-Math.cos(a) * r0, Math.sin(a) * r0])
  }
  return pts
}

/** Top quads inside |x| < hw between z0 and z1 drawn dark: an open cockpit / load bed. */
export const opening = (z0, z1, hw, color = INK) => (q) => (q.kind === 'top' && q.z > z0 && q.z < z1 && Math.abs(q.x) < hw ? color : null)
/** Side quads below y in `color` (two-tone lower body / cladding). */
export const lower = (y, color) => (q) => (q.kind === 'side' && q.y < y ? color : null)
/** Top quads (decks). */
export const deck = (color, z0 = -Infinity, z1 = Infinity) => (q) => (q.kind === 'top' && q.z > z0 && q.z < z1 ? color : null)

export const BUILDERS = {
  /** The starter: an off-road buggy - sculpted tub, tube roll cage, rear engine, spare tyre. */
  buggy(k, { body, trim, glass }) {
    const wheels = { radius: 0.5, width: 0.42, x: 0.98, zf: -1.18, zr: 1.12 }
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      arches: [],
      wells: false,
      z: [-1.74, 1.44],
      top: [-1.74, 0.14, -1.6, 0.34, -1.25, 0.5, -0.7, 0.58, -0.35, 0.62, 0.8, 0.58, 1.2, 0.62, 1.44, 0.5],
      bottom: [-1.74, 0.0, -1.45, -0.2, 1.25, -0.2, 1.44, -0.02],
      width: [-1.74, 0.36, -1.55, 0.55, -1.1, 0.65, -0.3, 0.7, 0.8, 0.7, 1.25, 0.62, 1.44, 0.48],
      rt: 0.22,
      rb: 0.12,
      tumble: 0.88,
      belly: 0.85,
      crown: 0.03,
      paint: paints(opening(-0.36, 0.98, 0.5), lower(0.08, trim)),
    })
    // Bucket seats, a steering wheel and a small screen.
    k.pair((s) => {
      k.box(0.46, 0.52, 0.15, s * 0.27, 0.86, 0.72, trim, { bevel: 0.05, r: [-0.18, 0, 0] })
      k.box(0.44, 0.1, 0.42, s * 0.27, 0.66, 0.48, trim, { bevel: 0.04 })
    })
    torus(k, 0.14, 0.018, -0.27, 0.86, 0.02, DARK, { axis: 'z', rot: [-0.5, 0, 0] })
    k.box(0.98, 0.3, 0.03, 0, 0.8, -0.42, glass, { r: [-0.42, 0, 0] })
    // Roll cage.
    const cage = trim
    const T = 0.045
    sweep(k, [[-0.62, 0.6, 0.98], [-0.62, 1.2, 0.98], [-0.5, 1.33, 0.98], [0.5, 1.33, 0.98], [0.62, 1.2, 0.98], [0.62, 0.6, 0.98]], T, cage)
    sweep(k, [[-0.6, 0.6, -0.4], [-0.56, 1.18, -0.06], [-0.46, 1.3, 0.02], [0.46, 1.3, 0.02], [0.56, 1.18, -0.06], [0.6, 0.6, -0.4]], T, cage)
    k.pair((s) => {
      tube(k, [s * 0.5, 1.32, 0.02], [s * 0.5, 1.33, 0.98], T, cage)
      tube(k, [s * 0.55, 1.26, 0.98], [s * 0.42, 0.66, 1.4], T, cage)
    })
    tube(k, [-0.6, 0.66, 0.98], [0.56, 1.28, 0.98], T * 0.9, cage)
    // Light bar on the cage.
    k.box(0.92, 0.09, 0.1, 0, 1.4, 0.02, DARK, { bevel: 0.02 })
    for (const x of [-0.3, 0, 0.3]) k.box(0.2, 0.055, 0.02, x, 1.4, -0.035, HEADLIGHT, { glow: true })
    // Hazard nudge bar, lamp pods on posts.
    k.box(1.36, 0.11, 0.11, 0, 0.08, -1.8, HAZARD, { stripe: DIAG, bevel: 0.03 })
    k.pair((s) => tube(k, [s * 0.5, 0.08, -1.78], [s * 0.42, 0.55, -1.45], 0.035, trim))
    const head = [roundLamp(k, -0.42, 0.62, -1.56, 0.1, HEADLIGHT, { housing: trim }), roundLamp(k, 0.42, 0.62, -1.56, 0.1, HEADLIGHT, { housing: trim })]
    // Rear engine with intakes, the spare tyre on its back.
    k.box(0.82, 0.34, 0.5, 0, 0.66, 1.18, DARK, { bevel: 0.05 })
    k.fine(() => {
      for (let i = 0; i < 4; i += 1) k.box(0.84, 0.025, 0.4, 0, 0.56 + i * 0.07, 1.18, STEEL)
    })
    k.pair((s) => k.lathe([[0.07, 0], [0.09, 0.14], [0.11, 0.17]], s * 0.2, 0.83, 1.12, CHROME, { segs: 8 }))
    tyre(k, 0.34, 0.22, 0, 0.74, 1.6, CHROME)
    // Exposed suspension.
    k.pair((s) => {
      for (const z of [wheels.zf, wheels.zr]) {
        k.box(0.34, 0.05, 0.1, s * 0.78, -0.12, z, DARK)
        tube(k, [s * 0.6, 0.42, z + 0.05], [s * 0.86, -0.04, z + 0.05], 0.06, body)
      }
    })
    const tail = lampPair(k, sh, 'rear', 0.3, 0.48, 0.18, 0.3, { inset: 0.1 })
    sideMirrors(k, 0.58, 0.72, -0.36, body, { size: 0.8 })
    tube(k, [0.3, 0.5, 1.2], [0.42, 0.22, 1.5], 0.045, STEEL)
    const exhausts = tailpipes(k, [[0.42, 0.2, 1.62]], { r: 0.06 })
    return { wheels, size: [2.1, 1.75, 3.9], exhausts, head, tail }
  },

  /** A small modern hatchback with a contrast roof and a roof spoiler. */
  hatch(k, { body, trim, glass }) {
    const wheels = { radius: 0.42, width: 0.36, x: 0.84, zf: -1.15, zr: 1.12 }
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-1.84, 1.8],
      top: [-1.84, 0.12, -1.76, 0.3, -1.55, 0.44, -1.15, 0.58, -0.72, 0.62, 0.2, 0.64, 1.3, 0.66, 1.66, 0.65, 1.8, 0.56],
      bottom: [-1.84, -0.04, -1.72, -0.2, -1.5, -0.27, 1.5, -0.27, 1.72, -0.2, 1.8, -0.05],
      width: [-1.84, 0.6, -1.74, 0.8, -1.52, 0.9, -1.15, 0.95, 0, 0.93, 1.12, 0.95, 1.62, 0.92, 1.8, 0.8],
      rt: 0.17,
      rb: 0.12,
      tumble: 0.95,
      belly: 0.9,
      crown: 0.02,
      grooves: [-0.64, 0.42],
      cabin: {
        z: [-0.76, 1.74],
        top: [-0.76, 0.6, -0.3, 0.92, 0.06, 1.18, 0.4, 1.24, 1.2, 1.24, 1.46, 1.16, 1.74, 0.68],
        bottom: 0.54,
        width: [-0.76, 0.84, 0.1, 0.84, 1.3, 0.83, 1.74, 0.78],
        tumble: 0.78,
        rt: 0.2,
        rb: 0.02,
        roof: [0.06, 1.44],
        pillars: [0.5],
        roofColor: trim,
        belt: 0.6,
      },
    })
    k.decal(sh, 'side', -0.62, 0.62, -0.26, -0.15, BLACK, { nu: 2 })
    handles(k, sh, [-0.25, 0.75], 0.46)
    const head = lampPair(k, sh, 'front', 0.44, 0.78, 0.24, 0.38, { skew: 0.02, inner: { from: 0.1, to: 0.4, color: '#9aa6b2' } })
    noseGrille(k, sh, 0.62, 0.08, 0.22, { bars: 2, bar: CHROME })
    noseGrille(k, sh, 1.1, -0.2, -0.06)
    const tail = lampPair(k, sh, 'rear', 0.5, 0.84, 0.38, 0.54, { taper: 0.25 })
    plateOn(k, sh, 'rear', 0.14)
    k.decal(sh, 'rear', -0.7, 0.7, -0.24, -0.1, INK, { nu: 3 })
    sideMirrors(k, sh.xAt(-0.55, 0.6) - 0.06, 0.7, -0.55, body)
    const sy = gh.topAt(1.4, 0)
    k.extrude([[-0.14, 0], [0.16, -0.03], [0.2, 0.01], [-0.12, 0.035]], -0.66, 0.66, trim, { at: [0, sy - 0.005, 1.42] })
    const exhausts = tailpipes(k, [[-0.5, -0.2, 1.8]], { r: 0.05 })
    return { wheels, size: [1.9, 1.65, 3.6], exhausts, head, tail }
  },

  /** A mid-size pickup: long bonnet, crew cab, chrome grille and bumpers, an open bed with a rope coil. */
  pickup(k, { body, trim, glass }) {
    const wheels = { radius: 0.48, width: 0.4, x: 0.92, zf: -1.4, zr: 1.3 }
    const ar = 0.55
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-2.24, 2.22],
      top: [-2.24, 0.3, -2.14, 0.52, -1.95, 0.64, -1.4, 0.7, -0.75, 0.76, 0.58, 0.78, 0.64, 0.6, 2.22, 0.6],
      bottom: [-2.24, 0.04, -2.1, -0.2, -1.9, -0.3, 1.9, -0.3, 2.1, -0.18, 2.22, -0.02],
      width: [-2.24, 0.8, -2.1, 0.95, -1.4, 1.0, 0, 0.98, 1.3, 1.0, 2.22, 0.98],
      rt: [-2.2, 0.16, 0.58, 0.14, 0.66, 0.03],
      rb: 0.1,
      tumble: 0.97,
      belly: 0.92,
      crown: 0.03,
      grooves: [-0.7, 0.5],
      paint: paints(deck(DARK, 0.66, 3), archBand(wheels, ar, trim, { w: 0.08 })),
      cabin: {
        z: [-0.8, 0.6],
        top: [-0.8, 0.74, -0.28, 1.34, -0.12, 1.44, 0.48, 1.47, 0.6, 1.42],
        bottom: 0.68,
        width: [-0.8, 0.92, 0.6, 0.92],
        tumble: 0.86,
        rt: 0.12,
        rb: 0.02,
        roof: [-0.12, 0.52],
        belt: 0.76,
        tailColor: body,
        pillars: [-0.02],
      },
    })
    k.decal(gh, 'rear', -0.55, 0.55, 0.95, 1.3, glass, { nu: 2 })
    noseGrille(k, sh, 1.0, 0.2, 0.5, { frame: CHROME, bars: 3, bar: CHROME })
    const head = lampPair(k, sh, 'front', 0.58, 0.88, 0.32, 0.5, { inset: 0.15 })
    bar(k, -1.0, 1.0, -2.2, 0.06, 0.18, 0.16, CHROME)
    bar(k, -0.98, 0.98, 2.22, 0.02, 0.16, 0.14, CHROME)
    k.pair((s) => k.box(0.18, 0.05, 1.5, s * 1.02, -0.22, -0.08, DARK, { bevel: 0.015 }))
    handles(k, sh, [-0.25, 0.3], 0.56)
    sideMirrors(k, 0.9, 0.98, -0.6, trim, { size: 1.15 })
    // Bed walls with chrome rails, the tailgate, a coil of rope.
    k.pair((s) => {
      k.box(0.09, 0.3, 1.52, s * 0.935, 0.75, 1.42, body, { bevel: 0.02 })
      k.box(0.12, 0.035, 1.55, s * 0.935, 0.915, 1.42, CHROME)
    })
    k.box(1.96, 0.32, 0.08, 0, 0.76, 2.2, trim, { bevel: 0.02 })
    torus(k, 0.3, 0.07, 0, 0.67, 1.35, WOOD, { tubeSegs: 6 })
    // Light bar on the roof.
    k.box(1.2, 0.08, 0.14, 0, 1.52, -0.32, DARK, { bevel: 0.02 })
    for (let i = -2; i <= 2; i += 1) k.box(0.16, 0.06, 0.02, i * 0.24, 1.52, -0.395, AMBER, { glow: true })
    const tail = lampPair(k, sh, 'rear', 0.78, 0.95, 0.18, 0.52, { inset: 0.05 })
    plateOn(k, sh, 'rear', 0.24)
    const exhausts = tailpipes(k, [[0.6, -0.24, 2.18]], { r: 0.055 })
    return { wheels, size: [2.05, 1.85, 4.35], exhausts, head, tail }
  },

  /** A tall delivery van: raked screen, a cargo box with livery stripes and a parcel logo, a roof rack. */
  van(k, { body, trim, glass }) {
    const wheels = { radius: 0.46, width: 0.38, x: 0.9, zf: -1.55, zr: 1.35 }
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-2.42, 2.24],
      top: [-2.42, 0.32, -2.3, 0.54, -2.05, 0.68, -1.75, 0.78, -1.45, 0.88, 2.24, 0.9],
      bottom: [-2.42, 0.02, -2.28, -0.18, -2.0, -0.26, 2.0, -0.26, 2.24, -0.08],
      width: [-2.42, 0.78, -2.3, 0.94, -1.9, 1.0, 2.24, 1.0],
      rt: [-2.4, 0.18, -1.4, 0.05],
      rb: 0.1,
      tumble: 0.99,
      belly: 0.93,
      crown: 0.02,
      grooves: [-0.95, 0.75],
    })
    const up = greenhouse(k, {
      z: [-1.62, 2.24],
      top: [-1.62, 0.88, -1.1, 1.68, -0.86, 1.84, -0.5, 1.9, 2.08, 1.9, 2.24, 1.82],
      bottom: 0.82,
      width: [-1.62, 0.95, -0.9, 0.99, 2.24, 0.99],
      tumble: 0.95,
      rt: 0.15,
      rb: 0.02,
      roof: [-0.88, 2.4],
      sideEnd: -0.92,
      glass,
      roofColor: body,
      bodyColor: body,
      belt: 0.88,
      tailColor: body,
    })
    // Livery stripes, the parcel logo.
    k.decal(up, 'side', -0.75, 2.12, 1.02, 1.2, trim, { nu: 3 })
    k.decal(sh, 'side', -1.45, 2.1, 0.6, 0.66, trim, { nu: 3 })
    k.decal(up, 'side', 0.35, 0.85, 1.28, 1.72, '#c78d4c', { nu: 1, off: 0.014 })
    k.decal(up, 'side', 0.56, 0.64, 1.28, 1.72, '#f0d9a8', { nu: 1, off: 0.018 })
    k.decal(up, 'rear', -0.9, 0.9, 1.02, 1.2, trim, { nu: 3 })
    k.fine(() => k.decal(up, 'rear', -0.012, 0.012, 0.92, 1.88, shade(body, 0.45), { nu: 1, off: 0.016 }))
    k.decal(up, 'rear', 0.12, 0.8, 1.38, 1.74, glass, { nu: 2, mirror: true, off: 0.014 })
    handles(k, up, [-1.0, 0.0], 0.98)
    // Roof rack and a parcel.
    k.pair((s) => tube(k, [s * 0.76, 1.96, -0.4], [s * 0.76, 1.96, 1.85], 0.03, DARK))
    for (const z of [-0.3, 0.5, 1.2, 1.75]) tube(k, [-0.76, 1.96, z], [0.76, 1.96, z], 0.025, DARK)
    k.box(0.8, 0.24, 0.6, 0.2, 2.1, 0.9, '#c78d4c', { bevel: 0.03 })
    k.box(0.82, 0.245, 0.1, 0.2, 2.1, 0.9, '#f0d9a8')
    noseGrille(k, sh, 1.0, 0.18, 0.42, { frame: DARK, bars: 2, bar: STEEL })
    const head = lampPair(k, sh, 'front', 0.58, 0.88, 0.42, 0.62, { inset: 0.1 })
    bar(k, -1.0, 1.0, -2.36, 0.04, 0.2, 0.2, DARK)
    k.box(1.6, 0.12, 0.26, 0, -0.08, 2.18, HAZARD, { stripe: DIAG, bevel: 0.03 })
    sideMirrors(k, 0.96, 1.18, -1.45, DARK, { size: 1.0 })
    const tail = lampPair(k, sh, 'rear', 0.8, 0.96, 0.3, 0.82, { inset: 0.04 })
    const exhausts = tailpipes(k, [[-0.6, -0.2, 2.22]], { r: 0.05 })
    return { wheels, size: [2.05, 2.05, 4.6], exhausts, head, tail }
  },

  /** A forklift: a rounded body and counterweight, overhead guard, mast, carriage and forks. */
  forklift(k, { body, trim, glass }) {
    const wheels = { radius: 0.44, width: 0.38, x: 0.82, zf: -0.85, zr: 1.1 }
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-1.16, 1.72],
      top: [-1.16, 0.5, -0.95, 0.62, -0.4, 0.66, 0.3, 0.68, 0.75, 0.92, 1.3, 0.98, 1.6, 0.9, 1.72, 0.66],
      bottom: [-1.16, 0.0, -1.0, -0.2, 1.5, -0.2, 1.72, 0.0],
      width: [-1.16, 0.7, -0.95, 0.78, 0.6, 0.8, 1.0, 0.86, 1.55, 0.84, 1.72, 0.72],
      rt: 0.2,
      rb: 0.12,
      tumble: 0.9,
      crown: 0.02,
      paint: (q) => (q.z > 0.72 && q.kind !== 'bottom' ? trim : null),
    })
    k.box(1.3, 0.3, 0.04, 0, 0.52, sh.rearZ(0, 0.52) + 0.005, HAZARD, { stripe: DIAG })
    // Seat, steering column and wheel.
    k.box(0.68, 0.14, 0.66, 0, 0.75, 0.32, DARK, { bevel: 0.05 })
    k.box(0.68, 0.55, 0.14, 0, 1.02, 0.64, DARK, { bevel: 0.05, r: [-0.12, 0, 0] })
    k.box(0.3, 0.32, 0.3, 0, 0.82, -0.48, DARK, { bevel: 0.05 })
    tube(k, [0, 0.95, -0.42], [0, 1.18, -0.3], 0.03, DARK)
    torus(k, 0.17, 0.02, 0, 1.2, -0.29, DARK, { axis: 'z', rot: [-1.0, 0, 0] })
    // Overhead guard.
    k.pair((s) => {
      sweep(k, [[s * 0.7, 0.6, -0.66], [s * 0.7, 1.9, -0.6], [s * 0.7, 2.06, -0.48]], 0.045, trim)
      tube(k, [s * 0.7, 0.9, 0.98], [s * 0.7, 2.06, 0.9], 0.045, trim)
      tube(k, [s * 0.7, 2.06, -0.48], [s * 0.7, 2.06, 0.9], 0.045, trim)
    })
    for (const z of [-0.4, 0.0, 0.42, 0.85]) tube(k, [-0.7, 2.08, z], [0.7, 2.08, z], 0.03, body)
    // Mast, ram, carriage and forks.
    k.pair((s) => k.box(0.12, 2.1, 0.14, s * 0.55, 0.95, -1.25, DARK, { bevel: 0.02 }))
    k.box(1.2, 0.1, 0.14, 0, 1.95, -1.25, HAZARD, { stripe: DIAG })
    k.cyl(0.07, 1.5, 0, 0.9, -1.2, DARK, { segs: 8 })
    k.cyl(0.045, 0.7, 0, 1.6, -1.2, CHROME, { segs: 8 })
    k.box(1.3, 0.45, 0.1, 0, 0.1, -1.36, trim, { bevel: 0.03 })
    k.pair((s) => {
      k.box(0.14, 0.07, 1.25, s * 0.36, -0.12, -1.98, CHROME, { bevel: 0.015 })
      k.box(0.14, 0.4, 0.07, s * 0.36, 0.08, -1.39, CHROME)
    })
    // Lamps: work lamps on the guard, amber beacon, tail lamps.
    const head = [roundLamp(k, -0.62, 1.95, -0.7, 0.08, HEADLIGHT, { housing: DARK }), roundLamp(k, 0.62, 1.95, -0.7, 0.08, HEADLIGHT, { housing: DARK })]
    k.lathe([[0.1, 0], [0.1, 0.06], [0.08, 0.16], [0, 0.2]], 0, 2.1, 0.88, AMBER, { glow: true })
    const tail = lampPair(k, sh, 'rear', 0.48, 0.66, 0.68, 0.8, { inset: 0.15 })
    k.box(1.0, 0.04, 0.04, 0, 0.45, -1.07, glass)
    k.cyl(0.06, 0.4, 0.5, 1.0, 1.4, CHROME, { segs: 8 })
    return { wheels, size: [1.9, 2.75, 4.0], exhausts: [[0.5, 1.2, 1.4]], head, tail, beacon: [[0, 2.22, 0.88]] }
  },

  /** A speedboat on wheels: a flared V hull with a red boot-top, teak deck, wrap screen and an outboard. */
  wheelboat(k, { body, trim, glass }) {
    const wheels = { radius: 0.46, width: 0.4, x: 0.92, zf: -1.25, zr: 1.25 }
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-2.62, 2.1],
      top: [-2.62, 0.74, -2.2, 0.73, -1.4, 0.69, 0, 0.65, 1.6, 0.67, 2.1, 0.67],
      bottom: [-2.62, 0.64, -2.3, 0.22, -1.8, -0.06, -1.0, -0.2, 1.8, -0.2, 2.1, -0.12],
      width: [-2.62, 0.04, -2.35, 0.36, -1.8, 0.74, -1.0, 0.92, 0.5, 0.95, 1.8, 0.9, 2.1, 0.82],
      rt: 0.08,
      rb: 0.42,
      tumble: 1.03,
      belly: 0.4,
      crown: 0.03,
      paint: paints(opening(-0.42, 1.35, 0.68), deck('#c9a77c'), (q) => (q.kind !== 'top' && q.y < 0.06 ? trim : q.kind !== 'top' && q.y < 0.12 ? DARK : null)),
    })
    k.decal(sh, 'side', -2.3, 2.0, 0.55, 0.61, trim, { nu: 6 })
    // Seats, dash, wheel, the wrap-round screen.
    k.pair((s) => k.box(0.5, 0.5, 0.48, s * 0.34, 0.75, 0.62, WHITE, { bevel: 0.08 }))
    k.box(1.25, 0.2, 0.24, 0, 0.7, -0.3, DARK, { bevel: 0.05 })
    torus(k, 0.13, 0.016, -0.34, 0.88, -0.18, CHROME, { axis: 'z', rot: [-0.9, 0, 0] })
    k.box(1.56, 0.42, 0.04, 0, 0.92, -0.46, glass, { r: [-0.55, 0, 0], top: [0.84, 1] })
    sweep(k, [[-0.76, 0.74, -0.38], [-0.66, 1.1, -0.28], [0.66, 1.1, -0.28], [0.76, 0.74, -0.38]], 0.022, CHROME)
    // Bow rails.
    k.pair((s) => sweep(k, [[s * 0.66, 0.72, -1.0], [s * 0.6, 0.86, -1.4], [s * 0.36, 0.88, -2.0], [s * 0.04, 0.86, -2.45]], 0.018, CHROME, { segs: 5 }))
    // Outboard motor.
    k.box(0.48, 0.55, 0.5, 0, 0.98, 2.28, DARK, { bevel: 0.1, top: [0.9, 0.8] })
    k.box(0.5, 0.08, 0.52, 0, 1.0, 2.28, trim)
    k.box(0.14, 0.62, 0.14, 0, 0.4, 2.36, DARK, { bevel: 0.03 })
    k.fine(() => {
      for (let i = 0; i < 3; i += 1) k.box(0.08, 0.3, 0.03, 0, 0.14, 2.46, STEEL, { r: [0, 0, (i * Math.PI * 2) / 3] })
    })
    // Pennant.
    tube(k, [0.6, 0.66, 1.5], [0.6, 1.5, 1.5], 0.015, CHROME)
    k.box(0.02, 0.22, 0.38, 0.6, 1.4, 1.68, trim, { top: [1, 0.2], shift: -0.15 })
    const head = []
    k.pair((s) => {
      const z = sh.frontZ(s * 0.3, 0.52) ?? -2.2
      head.push(roundLamp(k, s * 0.3, 0.52, z + 0.04, 0.07, HEADLIGHT, { housing: CHROME, depth: 0.06 }))
      k.gem(0.05, s * 0.62, 0.74, -1.55, s < 0 ? NAV_RED : NAV_GREEN, [1, 1, 1], { glow: true })
    })
    const tail = lampPair(k, sh, 'rear', 0.58, 0.78, 0.36, 0.48, { inset: 0.15 })
    return { wheels, size: [2.1, 1.75, 5.0], exhausts: [[0, 0.2, 2.45]], head, tail }
  },

  /** A tug truck: a round-bilged hull, rubber bow fender, white wheelhouse, funnel and searchlight. */
  tug(k, { body, trim, glass }) {
    const wheels = { radius: 0.5, width: 0.42, x: 0.98, zf: -1.35, zr: 1.35 }
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-2.38, 2.25],
      top: [-2.38, 0.96, -1.8, 0.86, 0, 0.8, 1.8, 0.82, 2.25, 0.86],
      bottom: [-2.38, 0.52, -2.1, 0.02, -1.6, -0.2, 1.7, -0.2, 2.1, 0.0, 2.25, 0.25],
      width: [-2.38, 0.46, -2.1, 0.84, -1.4, 1.02, 1.4, 1.02, 2.0, 0.95, 2.25, 0.76],
      rt: 0.06,
      rb: 0.3,
      tumble: 1.0,
      belly: 0.75,
      paint: paints(deck('#4a4f57'), (q) => (q.kind !== 'top' && q.y < 0.08 ? DARK : q.kind !== 'top' && q.y < 0.14 ? WHITE : null)),
    })
    k.decal(sh, 'side', -2.1, 2.1, 0.68, 0.8, trim, { nu: 6 })
    // Bow fender, side fenders.
    const bow = []
    for (let i = -4; i <= 4; i += 1) {
      const x = i * 0.15
      bow.push([x, 0.42, (sh.frontZ(x, 0.42) ?? -2.2) - 0.05])
    }
    sweep(k, bow, 0.12, DARK, { segs: 6 })
    k.pair((s) => {
      for (const z of [-0.6, 0.5]) torus(k, 0.17, 0.065, s * 1.06, 0.44, z, DARK, { axis: 'x' })
      for (const z of [-0.05, 0.95]) {
        roundel(k, sh, z, 0.5, 0.11, CHROME, { side: s })
        roundel(k, sh, z, 0.5, 0.075, glass, { side: s, off: 0.02 })
      }
    })
    // Wheelhouse with a window band, roof, life rings, searchlight.
    const house = k.shell({
      z: [-0.48, 0.98],
      top: 1.76,
      bottom: 0.74,
      width: 0.78,
      rt: 0.08,
      rb: 0.02,
      tumble: 0.96,
      color: WHITE,
      paint: (q) => (q.kind === 'top' ? WHITE : q.y > 1.34 && q.y < 1.64 ? glass : null),
      cuts: [-0.4],
      noseColor: WHITE,
    })
    k.decal(house, 'front', -0.72, 0.72, 1.34, 1.64, glass, { nu: 3 })
    k.box(1.74, 0.06, 1.62, 0, 1.79, 0.25, trim, { bevel: 0.025 })
    k.box(1.6, 0.04, 1.48, 0, 1.83, 0.25, WHITE)
    k.pair((s) => torus(k, 0.18, 0.04, s * 0.8, 1.12, 0.62, WHITE, { axis: 'x' }))
    k.box(0.2, 0.14, 0.22, 0.55, 1.93, -0.3, DARK, { bevel: 0.03 })
    k.cyl(0.06, 0.02, 0.55, 1.93, -0.42, HEADLIGHT, { axis: 'z', segs: 10, glow: true })
    // Funnel.
    k.lathe([[0.26, 1.82], [0.27, 2.2], [0.28, 2.34], [0.26, 2.52], [0.2, 2.55], [0.19, 2.45]], 0, 0, 0.95, [trim, body, body, INK, INK], { segs: 12 })
    tube(k, [0, 1.82, 0.0], [0, 2.4, 0.0], 0.03, CHROME)
    k.gem(0.09, 0, 2.45, 0.0, AMBER, [1, 1, 1], { glow: true })
    k.box(1.6, 0.16, 0.12, 0, 0.32, 2.2, HAZARD, { stripe: DIAG, bevel: 0.03 })
    const head = []
    k.pair((s) => {
      const z = sh.frontZ(s * 0.55, 0.62) ?? -2.1
      head.push(roundLamp(k, s * 0.55, 0.62, z + 0.03, 0.09, HEADLIGHT, { housing: CHROME, depth: 0.08 }))
    })
    const tail = lampPair(k, sh, 'rear', 0.55, 0.76, 0.46, 0.62, { inset: 0.12 })
    return { wheels, size: [2.15, 2.6, 4.5], exhausts: [[0, 2.55, 0.95]], head, tail, beacon: [[0, 2.45, 0]] }
  },

  /** A rally hatch: flared arches, roof scoop, a bonnet lamp pod, a big wing, stripes and roundels. */
  rally(k, { body, trim, glass }) {
    const wheels = { radius: 0.45, width: 0.42, x: 0.92, zf: -1.25, zr: 1.25 }
    const ar = 0.52
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      gap: 0.07,
      z: [-2.02, 1.98],
      top: [-2.02, 0.12, -1.94, 0.32, -1.7, 0.48, -1.25, 0.62, -0.8, 0.62, -0.55, 0.64, 0.6, 0.68, 1.25, 0.72, 1.75, 0.68, 1.98, 0.58],
      bottom: [-2.02, -0.04, -1.88, -0.22, -1.6, -0.3, 1.6, -0.3, 1.88, -0.2, 1.98, -0.05],
      width: [-2.02, 0.62, -1.9, 0.86, -1.6, 0.96, -1.25, 1.05, -0.75, 0.97, 0.6, 0.97, 1.25, 1.06, 1.7, 0.98, 1.98, 0.84],
      rt: 0.16,
      rb: 0.1,
      tumble: 0.94,
      belly: 0.9,
      crown: 0.02,
      grooves: [-0.62, 0.42],
      paint: archBand(wheels, ar, trim, { w: 0.09 }),
      cabin: {
        z: [-0.64, 1.88],
        top: [-0.64, 0.62, -0.15, 1.0, 0.15, 1.22, 0.5, 1.28, 1.3, 1.27, 1.55, 1.18, 1.88, 0.74],
        bottom: 0.58,
        width: [-0.64, 0.86, 0.3, 0.86, 1.4, 0.85, 1.88, 0.8],
        tumble: 0.78,
        rt: 0.2,
        rb: 0.02,
        roof: [0.15, 1.52],
        pillars: [0.42],
        belt: 0.64,
      },
    })
    // Livery: twin stripes over bonnet, roof and tail; side sash; door roundels.
    k.decal(sh, 'top', 0.12, 0.32, -1.92, -0.66, trim, { nu: 1, nv: 4, mirror: true })
    k.decal(gh, 'top', 0.12, 0.3, 0.18, 1.5, trim, { nu: 1, nv: 3, mirror: true, off: 0.012 })
    k.decal(sh, 'rear', 0.12, 0.32, 0.2, 0.62, trim, { nu: 1, mirror: true })
    k.decal(sh, 'side', -1.65, 1.62, -0.12, -0.02, trim, { nu: 4 })
    roundel(k, sh, 0.0, 0.26, 0.24, WHITE)
    roundel(k, sh, 0.0, 0.26, 0.15, trim, { off: 0.016 })
    k.box(0.44, 0.12, 0.42, 0, gh.topAt(0.55, 0) + 0.04, 0.55, DARK, { top: [0.75, 0.6], bevel: 0.03 })
    rearWing(k, { span: 1.84, chord: 0.44, y: 1.44, z: 1.74, deckY: gh.topAt(1.6, 0.48) - 0.02, color: trim, angle: 0.14 })
    // Bonnet lamp pod: four spot lamps.
    const podY = sh.topAt(-1.72, 0) + 0.1
    k.box(1.14, 0.18, 0.12, 0, podY, -1.74, DARK, { bevel: 0.035 })
    for (const x of [-0.42, -0.14, 0.14, 0.42]) k.cyl(0.075, 0.02, x, podY, -1.81, HEADLIGHT, { axis: 'z', segs: 12, glow: true })
    // Mud flaps, tow hook.
    k.pair((s) => {
      for (const z of [wheels.zf, wheels.zr]) {
        k.box(0.38, 0.3, 0.03, s * 0.9, -0.12, z + 0.56, DARK)
        k.box(0.3, 0.05, 0.035, s * 0.9, -0.03, z + 0.56, trim)
      }
    })
    k.box(0.1, 0.1, 0.12, 0.55, -0.14, -2.02, trim)
    const head = lampPair(k, sh, 'front', 0.5, 0.84, 0.26, 0.4, { skew: 0.02 })
    noseGrille(k, sh, 0.72, 0.08, 0.22, { frame: DARK })
    noseGrille(k, sh, 1.3, -0.24, -0.06)
    const tail = lampPair(k, sh, 'rear', 0.55, 0.88, 0.4, 0.56, { taper: 0.25 })
    plateOn(k, sh, 'rear', 0.06)
    sideMirrors(k, sh.xAt(-0.55, 0.62) - 0.06, 0.72, -0.55, body)
    const exhausts = tailpipes(k, [[0.55, -0.22, 1.98]], { r: 0.075 })
    return { wheels, size: [2.1, 1.75, 4.0], exhausts, head, tail }
  },

  /** A monster truck: a lifted pickup on giant tyres - exposed axles, coilovers, flames and a light bar. */
  monster(k, { body, trim, glass }) {
    const wheels = { radius: 0.75, width: 0.6, x: 1.12, zf: -1.25, zr: 1.25 }
    const ar = 0.82
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      wells: false,
      z: [-1.92, 1.78],
      top: [-1.92, 0.96, -1.82, 1.16, -1.6, 1.26, -0.6, 1.32, 0.42, 1.34, 0.48, 1.22, 1.78, 1.22],
      bottom: [-1.92, 0.76, -1.75, 0.56, 1.65, 0.56, 1.78, 0.7],
      width: [-1.92, 0.82, -1.75, 1.0, -1.25, 1.06, 1.25, 1.06, 1.78, 1.0],
      rt: 0.16,
      rb: 0.1,
      tumble: 0.96,
      crown: 0.03,
      paint: paints(deck(DARK, 0.48, 3), archBand(wheels, ar, DARK, { w: 0.13 })),
      cabin: {
        z: [-0.64, 0.44],
        top: [-0.64, 1.32, -0.26, 1.86, -0.1, 1.96, 0.36, 1.98, 0.44, 1.95],
        bottom: 1.28,
        width: [-0.64, 0.95, 0.44, 0.95],
        tumble: 0.85,
        rt: 0.12,
        rb: 0.02,
        roof: [-0.1, 0.4],
        belt: 1.34,
        tailColor: body,
      },
    })
    k.decal(gh, 'rear', -0.5, 0.5, 1.5, 1.8, glass, { nu: 2 })
    // Chassis, axles, diffs and coilovers.
    k.box(1.2, 0.22, 3.2, 0, 0.42, 0, DARK, { bevel: 0.04 })
    for (const z of [wheels.zf, wheels.zr]) {
      tube(k, [-0.86, 0, z], [0.86, 0, z], 0.07, DARK)
      k.lathe([[0.0, -0.2], [0.18, -0.12], [0.2, 0.05], [0.0, 0.16]], 0, 0, z, DARK, { axis: 'z', segs: 8 })
      k.pair((s) => {
        tube(k, [s * 0.75, 0.05, z - 0.18], [s * 0.6, 0.6, z - 0.3], 0.085, trim)
        tube(k, [s * 0.75, 0.05, z + 0.18], [s * 0.6, 0.6, z + 0.3], 0.085, trim)
      })
    }
    k.box(1.2, 0.06, 0.5, 0, 0.32, -1.6, HAZARD, { stripe: DIAG })
    // Flames licking back along the sides.
    for (let i = 0; i < 3; i += 1) {
      const y = 0.68 + i * 0.12
      k.decal(sh, 'side', -1.74, -0.4 - i * 0.28, y, y + 0.1, i === 1 ? AMBER : trim, { nu: 5, taper: 0.95, skew: 0.05, off: 0.012 + i * 0.002 })
    }
    // Light bar and bull bar.
    k.box(1.5, 0.12, 0.18, 0, 2.05, -0.28, DARK, { bevel: 0.03 })
    for (let i = -2; i <= 2; i += 1) k.cyl(0.07, 0.02, i * 0.28, 2.05, -0.38, HEADLIGHT, { axis: 'z', segs: 12, glow: true })
    sweep(k, [[-0.75, 0.62, -1.9], [-0.78, 1.15, -1.98], [-0.5, 1.22, -2.02], [0.5, 1.22, -2.02], [0.78, 1.15, -1.98], [0.75, 0.62, -1.9]], 0.05, CHROME)
    tube(k, [-0.8, 0.78, -1.98], [0.8, 0.78, -1.98], 0.05, CHROME)
    noseGrille(k, sh, 1.0, 0.86, 1.1, { frame: CHROME, bars: 3 })
    const head = lampPair(k, sh, 'front', 0.6, 0.9, 0.98, 1.12, { inset: 0.15 })
    const tail = lampPair(k, sh, 'rear', 0.78, 0.98, 0.9, 1.14, { inset: 0.05 })
    sideMirrors(k, 0.92, 1.5, -0.55, DARK)
    const exhausts = tailpipes(k, [[0.5, 0.62, 1.8], [0.3, 0.62, 1.8]], { r: 0.065 })
    return { wheels, size: [2.85, 2.7, 4.0], exhausts: [exhausts[0]], head, tail }
  },

  /** A cab-over hauler with sleeper fairing, chrome stacks and tanks, towing its own shipping container. */
  hauler(k, { body, trim, glass }) {
    const wheels = { radius: 0.5, width: 0.44, x: 0.95, zf: -1.5, zr: 1.55 }
    const rib = trim === '#ff8a1f' ? '#e07010' : DARK
    const cab = k.shell({
      z: [-2.4, -0.95],
      top: [-2.4, 1.5, -2.32, 1.74, -2.1, 1.83, -0.95, 1.85],
      bottom: [-2.4, -0.04, -2.3, -0.2, -0.95, -0.2],
      width: [-2.4, 0.88, -2.26, 1.0, -0.95, 1.0],
      rt: 0.2,
      rb: 0.08,
      tumble: 0.95,
      color: body,
      arches: [{ z: wheels.zf, r: 0.57 }],
      grooves: [-1.3],
    })
    k.box(1.52, 0.6, 1.0, 0, 0.2, -1.5, INK)
    k.decal(cab, 'front', -0.86, 0.86, 0.98, 1.5, glass, { nu: 4 })
    k.decal(cab, 'side', -2.12, -1.5, 1.02, 1.48, glass, { nu: 2 })
    k.decal(cab, 'front', -0.7, 0.7, 1.6, 1.65, AMBER, { nu: 4, glow: true })
    k.box(1.7, 0.3, 1.1, 0, 1.98, -1.5, body, { top: [0.9, 0.5], shift: 0.25, bevel: 0.06 })
    k.box(1.86, 0.05, 0.22, 0, 1.53, -2.44, DARK, { r: [0.25, 0, 0] })
    noseGrille(k, cab, 1.4, 0.3, 0.76, { frame: CHROME, bars: 4, bar: STEEL })
    const head = lampPair(k, cab, 'front', 0.6, 0.9, 0.28, 0.44, { inset: 0.1 })
    bar(k, -0.98, 0.98, -2.38, 0.06, 0.22, 0.22, DARK)
    sideMirrors(k, 0.96, 1.3, -2.15, DARK, { size: 1.0 })
    k.pair((s) => k.box(0.1, 0.06, 0.4, s * 1.0, 0.18, -1.0, CHROME))
    // Chassis, fuel tanks, exhaust stacks.
    k.box(1.6, 0.3, 4.6, 0, 0.14, 0.1, DARK, { bevel: 0.04 })
    k.pair((s) => k.lathe([[0, -0.4], [0.2, -0.38], [0.21, 0.38], [0, 0.4]], s * 0.86, 0.0, -0.45, CHROME, { axis: 'z', segs: 12 }))
    k.pair((s) => {
      tube(k, [s * 0.95, 0.4, -0.88], [s * 0.95, 2.1, -0.88], 0.075, CHROME)
      k.cyl(0.05, 0.02, s * 0.95, 2.11, -0.88, INK, { segs: 8 })
    })
    // The container: ribs, livery band, corner castings, doors with lock bars.
    const cy = 1.35
    k.box(2.0, 1.45, 2.9, 0, cy, 0.85, trim, { bevel: 0.03 })
    for (let i = 0; i < 7; i += 1) {
      const z = -0.45 + i * 0.43
      k.pair((s) => k.box(0.05, 1.35, 0.12, s * 1.01, cy, z, rib))
    }
    k.pair((s) => {
      k.box(0.07, 0.22, 2.75, s * 1.02, cy + 0.15, 0.85, WHITE)
      k.box(0.08, 0.05, 2.75, s * 1.025, cy + 0.01, 0.85, body)
      for (const z of [-0.6, 2.3]) for (const y of [cy - 0.68, cy + 0.68]) k.box(0.1, 0.1, 0.1, s * 0.97, y, z, DARK)
      k.box(0.06, 1.3, 0.06, s * 0.3, cy, 2.31, DARK)
      k.box(0.06, 1.3, 0.06, s * 0.75, cy, 2.31, DARK)
      k.box(0.12, 0.05, 0.06, s * 0.36, cy - 0.1, 2.33, CHROME)
    })
    k.box(0.03, 1.38, 0.03, 0, cy, 2.315, rib)
    // Rear mudguards, under-ride bar, lamps.
    k.pair((s) => k.extrude([[-0.62, 0.2], [-0.5, 0.55], [0, 0.66], [0.5, 0.55], [0.62, 0.2], [0.55, 0.2], [0.44, 0.48], [0, 0.58], [-0.44, 0.48], [-0.55, 0.2]], s * 0.72, s * 1.18, DARK, { at: [0, 0, wheels.zr], smooth: false }))
    k.box(1.9, 0.14, 0.12, 0, -0.08, 2.4, HAZARD, { stripe: DIAG, bevel: 0.03 })
    const tail = [
      roundLamp(k, -0.8, 0.3, 2.36, 0.07, TAILLIGHT, { dir: 1, housing: DARK, depth: 0.06 }),
      roundLamp(k, 0.8, 0.3, 2.36, 0.07, TAILLIGHT, { dir: 1, housing: DARK, depth: 0.06 }),
    ]
    return { wheels, size: [2.1, 2.35, 4.85], exhausts: [[-0.95, 2.1, -0.88], [0.95, 2.1, -0.88]], head, tail }
  },
}
