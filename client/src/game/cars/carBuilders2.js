import { arcBand, foil, lower, opening } from './carBuilders'
import {
  AMBER,
  archBand,
  bar,
  CHROME,
  DARK,
  DIAG,
  FLAME,
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
  wheelWells,
  WHITE,
} from './carKit'

/** Deck / bed tops in one colour. */
const deck = (color, z0 = -Infinity, z1 = Infinity) => (q) => (q.kind === 'top' && q.z > z0 && q.z < z1 ? color : null)

/** The second ten of the original garage (same contract as carBuilders.js). */
export const BUILDERS_2 = {
  /** A jet-boat racer: needle nose, bubble canopy, side pods, twin fins, a front wing and glowing jets. */
  seajet(k, { body, trim, glass }) {
    const wheels = { radius: 0.44, width: 0.42, x: 0.95, zf: -1.3, zr: 1.3 }
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      arches: [],
      wells: false,
      z: [-2.56, 2.02],
      top: [-2.56, 0.18, -2.2, 0.27, -1.3, 0.42, -0.6, 0.5, 0.6, 0.56, 1.6, 0.52, 2.02, 0.42],
      bottom: [-2.56, 0.12, -2.2, 0.0, -1.5, -0.1, 1.6, -0.12, 2.02, -0.02],
      width: [-2.56, 0.05, -2.2, 0.2, -1.5, 0.36, -0.7, 0.55, 0, 0.68, 0.9, 0.7, 1.6, 0.6, 2.02, 0.48],
      rt: 0.16,
      rb: 0.12,
      tumble: 0.85,
      belly: 0.8,
      crown: 0.04,
      paint: (q) => (q.z < -1.95 && q.kind !== 'bottom' ? trim : null),
    })
    k.decal(sh, 'top', -0.14, 0.14, -1.9, 1.95, trim, { nu: 2, nv: 6 })
    k.decal(sh, 'side', -1.9, 1.9, 0.17, 0.2, WHITE, { nu: 6 })
    k.shell({
      z: [-0.8, 0.85],
      top: [-0.8, 0.2, -0.4, 0.34, 0.6, 0.36, 0.85, 0.28],
      bottom: [-0.8, 0.02, -0.4, -0.08, 0.85, -0.04],
      width: [-0.8, 0.07, -0.4, 0.17, 0.6, 0.18, 0.85, 0.12],
      rt: 0.08,
      rb: 0.06,
      color: trim,
      noseColor: INK,
      cx: 0.86,
      pair: true,
    })
    k.box(0.5, 0.3, 0.5, 0, 0.62, 0.35, DARK, { bevel: 0.05 })
    k.shell({ z: [-0.8, 0.95], top: [-0.8, 0.48, -0.35, 0.84, 0.25, 0.98, 0.95, 0.54], bottom: 0.44, width: [-0.8, 0.28, -0.3, 0.48, 0.4, 0.5, 0.95, 0.3], rt: 0.45, rb: 0.02, tumble: 0.7, color: glass })
    sweep(k, [[0, 0.5, -0.82], [0, 0.87, -0.35], [0, 1.0, 0.25], [0, 0.56, 0.96]], 0.025, trim)
    k.pair((s) => {
      k.extrude([[0, 0], [0.62, 0], [0.82, 0.62], [0.55, 0.64]], -0.03, 0.03, trim, { at: [s * 0.55, 0.45, 1.3], r: [0, 0, s * -0.25], smooth: false })
      k.gem(0.05, s * 0.72, 1.05, 2.02, s < 0 ? NAV_RED : NAV_GREEN, [1, 1, 1], { glow: true })
    })
    k.extrude(foil(0.42, 0.06), -0.66, 0.66, trim, { at: [0, 1.0, 1.9], r: [0.1, 0, 0] })
    k.extrude(foil(0.36, 0.05), -0.92, 0.92, trim, { at: [0, 0.02, -2.32], r: [-0.08, 0, 0] })
    k.pair((s) => k.box(0.03, 0.18, 0.42, s * 0.93, 0.06, -2.32, DARK))
    const exhausts = []
    k.pair((s) => {
      k.lathe([[0.15, -0.35], [0.19, -0.15], [0.19, 0.08], [0.15, 0.12], [0.11, 0.05]], s * 0.4, 0.2, 2.0, [DARK, DARK, CHROME, INK], { axis: 'z', segs: 12 })
      k.cyl(0.1, 0.02, s * 0.4, 0.2, 2.07, FLAME, { axis: 'z', segs: 12, glow: true })
      exhausts.push([s * 0.4, 0.2, 2.3])
    })
    const head = k.decal(sh, 'side', -2.18, -1.86, 0.14, 0.2, HEADLIGHT, { nu: 3, glow: true, off: 0.012 })
    const tail = lampPair(k, sh, 'rear', 0.22, 0.42, 0.24, 0.34, { inset: 0.1 })
    return { wheels, size: [2.25, 1.35, 4.9], exhausts, head, tail }
  },

  /** A crab: a domed, segmented carapace with a cream rim, eyes on stalks, two big claws and little legs. */
  crab(k, { body, trim, glass }) {
    const wheels = { radius: 0.46, width: 0.42, x: 1.0, zf: -1.1, zr: 1.2 }
    const deep = shade(body, 0.7)
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      gap: 0.06,
      z: [-1.46, 1.66],
      top: [-1.46, 0.42, -1.2, 0.7, -0.6, 0.94, 0.2, 1.04, 0.9, 0.96, 1.4, 0.72, 1.66, 0.42],
      bottom: [-1.46, 0.24, -1.2, 0.0, 1.4, 0.0, 1.66, 0.2],
      width: [-1.46, 0.7, -1.1, 1.06, -0.3, 1.2, 0.6, 1.16, 1.3, 1.02, 1.66, 0.7],
      rt: 0.62,
      rb: 0.06,
      tumble: 0.62,
      belly: 1.0,
      crown: 0.1,
      grooves: [-0.45, 0.25, 0.95],
      groove: deep,
      paint: lower(0.12, trim),
    })
    for (const z of [-0.45, 0.25, 0.95]) k.decal(sh, 'top', -0.95, 0.95, z - 0.016, z + 0.016, deep, { nu: 6 })
    k.fine(() => {
      for (const [x, z] of [[-0.45, -0.2], [0.45, -0.2], [0, 0.55], [-0.5, 0.65], [0.5, 0.65], [0, -0.75]]) k.gem(0.09, x, sh.topAt(z, x) + 0.015, z, trim, [1, 0.55, 1], { detail: 1 })
    })
    k.box(1.5, 0.12, 2.5, 0, -0.04, 0.1, trim, { bevel: 0.04 })
    k.gem(0.35, 0, 0.5, 1.5, trim, [1.6, 0.5, 0.8], { detail: 1 })
    const head = []
    k.pair((s) => {
      tube(k, [s * 0.32, 0.75, -1.05], [s * 0.36, 1.12, -1.2], 0.045, trim)
      k.gem(0.14, s * 0.36, 1.2, -1.22, HEADLIGHT, [1, 1, 1], { glow: true, detail: 1 })
      k.gem(0.07, s * 0.36, 1.22, -1.35, INK, [1, 1, 0.6], { detail: 1 })
      head.push([s * 0.36, 1.2, -1.38])
      sweep(k, [[s * 0.85, 0.35, -1.0], [s * 1.08, 0.4, -1.45], [s * 1.2, 0.45, -1.75]], [0.11, 0.1, 0.09], body)
      k.gem(0.3, s * 1.25, 0.46, -2.02, body, [0.85, 0.7, 1.2], { detail: 1 })
      k.box(0.18, 0.18, 0.6, s * 1.36, 0.58, -2.5, body, { top: [0.6, 0.4], shift: -0.08, bevel: 0.05 })
      k.box(0.16, 0.14, 0.52, s * 1.12, 0.4, -2.46, trim, { top: [0.6, 0.4], shift: -0.08, bevel: 0.04 })
      k.fine(() => {
        for (const z of [-2.35, -2.55]) k.gem(0.04, s * 1.28, 0.5, z, trim)
      })
      for (const z of [-0.45, 0.05, 0.5]) sweep(k, [[s * 1.0, 0.38, z], [s * 1.38, 0.5, z + 0.04], [s * 1.5, 0.06, z + 0.08]], [0.055, 0.045, 0.03], body, { segs: 5 })
    })
    const tail = lampPair(k, sh, 'rear', 0.42, 0.72, 0.16, 0.28, { inset: 0.15 })
    const exhausts = tailpipes(k, [[0, 0.16, 1.68]], { r: 0.06 })
    return { wheels, size: [3.0, 1.5, 4.4], exhausts, head, tail }
  },

  /** A rocket car: a sleek body with a red nose cone, bubble canopy, a striped lighthouse tower, fins and boosters. */
  lighthouse(k, { body, trim, glass }) {
    const wheels = { radius: 0.45, width: 0.42, x: 0.93, zf: -1.3, zr: 1.3 }
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-2.62, 2.06],
      top: [-2.62, 0.24, -2.3, 0.34, -1.6, 0.54, -1.3, 0.6, -0.8, 0.6, 0.5, 0.64, 1.3, 0.62, 2.06, 0.52],
      bottom: [-2.62, 0.2, -2.3, 0.05, -1.7, -0.12, 1.7, -0.12, 2.06, 0.0],
      width: [-2.62, 0.08, -2.3, 0.34, -1.75, 0.68, -1.3, 0.94, 0, 0.9, 1.3, 0.95, 2.06, 0.74],
      rt: 0.24,
      rb: 0.12,
      tumble: 0.86,
      crown: 0.02,
      paint: (q) => (q.z < -1.78 && q.kind !== 'bottom' ? trim : null),
    })
    k.decal(sh, 'top', 0.14, 0.28, -1.7, 1.95, trim, { nu: 1, nv: 6, mirror: true })
    k.decal(sh, 'side', -1.5, 1.85, 0.08, 0.17, trim, { nu: 5, taper: 0.6 })
    greenhouse(k, { z: [-1.25, -0.2], top: [-1.25, 0.56, -0.85, 0.9, -0.5, 0.94, -0.2, 0.6], bottom: 0.52, width: [-1.25, 0.42, -0.7, 0.52, -0.2, 0.4], rt: 0.32, tumble: 0.75, roof: [9, 9], glass, roofColor: body })
    ;[body, trim, body, trim].forEach((c, i) => k.lathe([[0.52 - i * 0.05, 0.62 + i * 0.38], [0.47 - i * 0.05, 1.0 + i * 0.38]], 0, 0, 0.75, c, { segs: 14 }))
    k.lathe([[0.4, 2.14], [0.4, 2.2], [0, 2.21]], 0, 0, 0.75, DARK, { segs: 14 })
    k.lathe([[0.38, 2.2], [0.38, 2.3]], 0, 0, 0.75, DARK, { segs: 14 })
    k.lathe([[0.24, 2.2], [0.24, 2.6]], 0, 0, 0.75, glass, { segs: 10, glow: true })
    k.fine(() => {
      for (let i = 0; i < 4; i += 1) {
        const a = (i * Math.PI) / 2 + Math.PI / 4
        k.box(0.03, 0.4, 0.03, Math.cos(a) * 0.235, 2.4, 0.75 + Math.sin(a) * 0.235, DARK)
      }
    })
    k.lathe([[0.31, 2.6], [0.2, 2.72], [0.02, 2.84]], 0, 0, 0.75, trim, { segs: 12 })
    k.gem(0.05, 0, 2.87, 0.75, CHROME)
    k.pair((s) => k.extrude([[0, 0], [0.85, 0], [0.95, 0.55], [0.5, 0.6]], -0.035, 0.035, trim, { at: [s * 0.86, 0.32, 1.25], r: [0, 0, s * -0.45], smooth: false }))
    k.extrude([[0, 0], [0.8, 0], [0.95, 0.6], [0.55, 0.62]], -0.035, 0.035, trim, { at: [0, 0.6, 1.3], smooth: false })
    const exhausts = []
    k.pair((s) => {
      k.lathe([[0.16, -0.5], [0.2, -0.3], [0.2, 0.25], [0.15, 0.3], [0.12, 0.2]], s * 0.55, 0.2, 2.1, [CHROME, CHROME, CHROME, INK], { axis: 'z', segs: 12 })
      k.lathe([[0.205, -0.12], [0.215, -0.06], [0.205, 0]], s * 0.55, 0.2, 2.1, trim, { axis: 'z', segs: 12 })
      k.cyl(0.12, 0.02, s * 0.55, 0.2, 2.32, FLAME, { axis: 'z', segs: 12, glow: true })
      exhausts.push([s * 0.55, 0.2, 2.4])
    })
    const head = lampPair(k, sh, 'front', 0.14, 0.28, 0.22, 0.3, { inset: 0.1 })
    const tail = lampPair(k, sh, 'rear', 0.14, 0.3, 0.36, 0.44)
    return { wheels, size: [2.1, 2.9, 4.9], exhausts, head, tail, beacon: [[0, 2.4, 0.75]] }
  },

  /** A submarine rover: a smooth riveted hull with brass bands, conning tower, lit portholes and a guarded prop. */
  diver(k, { body, trim, glass }) {
    const wheels = { radius: 0.48, width: 0.42, x: 0.98, zf: -1.3, zr: 1.3 }
    const Y = 0.6
    const hull = [[0, -2.48], [0.36, -2.38], [0.6, -2.15], [0.75, -1.8], [0.8, -1.3], [0.8, 1.4], [0.72, 1.95], [0.5, 2.35], [0.3, 2.55], [0, 2.56]]
    const rAt = (z) => {
      for (let i = 0; i < hull.length - 1; i += 1) {
        const [r0, z0] = hull[i]
        const [r1, z1] = hull[i + 1]
        if (z >= z0 && z <= z1) return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0)
      }
      return 0
    }
    k.lathe(hull, 0, Y, 0, body, { axis: 'z', segs: 16 })
    for (const z of [-1.4, 0.15, 1.7]) {
      const r = rAt(z) + 0.025
      k.lathe([[r - 0.01, z - 0.07], [r, z - 0.05], [r, z + 0.05], [r - 0.01, z + 0.07]], 0, Y, 0, trim, { axis: 'z', segs: 16 })
      k.fine(() => {
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + 0.26
          k.gem(0.03, Math.cos(a) * (r + 0.01), Y + Math.sin(a) * (r + 0.01), z, '#d8b26a')
        }
      })
    }
    const tower = k.shell({ z: [-0.45, 0.65], top: [-0.45, 1.58, -0.28, 1.8, 0.5, 1.82, 0.65, 1.58], bottom: 1.2, width: [-0.45, 0.26, -0.2, 0.38, 0.5, 0.36, 0.65, 0.26], rt: 0.12, rb: 0.02, color: body, paint: (q) => (q.y > 1.72 ? trim : null) })
    k.cyl(0.18, 0.05, -0.1, tower.topAt(0.25, -0.1) + 0.02, 0.25, trim, { segs: 12 })
    tube(k, [0.14, 1.78, -0.12], [0.14, 2.38, -0.12], 0.05, trim)
    k.box(0.12, 0.12, 0.3, 0.14, 2.42, -0.2, trim, { bevel: 0.02 })
    k.box(0.09, 0.09, 0.02, 0.14, 2.42, -0.36, glass, { glow: true })
    k.pair((s) => {
      for (const z of [-0.8, 0.4, 1.0]) {
        k.cyl(0.13, 0.04, s * 0.79, 0.7, z, trim, { axis: 'x', segs: 12 })
        k.cyl(0.095, 0.05, s * 0.8, 0.7, z, glass, { axis: 'x', segs: 12, glow: true })
      }
      k.extrude([[0, 0], [0.55, 0], [0.6, 0.36], [0.25, 0.38]], -0.035, 0.035, trim, { at: [s * 0.45, 0.95, 1.85], r: [0, 0, s * -0.6], smooth: false })
    })
    k.gem(0.24, 0, 0.75, -2.36, glass, [1, 1, 0.5], { glow: true, detail: 1 })
    const head = []
    k.pair((s) => head.push(roundLamp(k, s * 0.52, 0.26, -2.08, 0.1, HEADLIGHT, { housing: DARK, depth: 0.14 })))
    k.lathe([[0, 2.5], [0.1, 2.56], [0.08, 2.76], [0, 2.82]], 0, Y, 0, trim, { axis: 'z', segs: 10 })
    k.fine(() => {
      for (let i = 0; i < 3; i += 1) k.box(0.13, 0.62, 0.04, 0, Y, 2.68, trim, { r: [0, 0.35, (i * Math.PI * 2) / 3] })
    })
    k.lathe([[0.44, 2.6], [0.47, 2.68], [0.44, 2.76]], 0, Y, 0, trim, { axis: 'z', segs: 16 })
    const tail = [roundLamp(k, -0.42, 0.25, 2.27, 0.07, TAILLIGHT, { dir: 1, housing: trim, depth: 0.06 }), roundLamp(k, 0.42, 0.25, 2.27, 0.07, TAILLIGHT, { dir: 1, housing: trim, depth: 0.06 })]
    return { wheels, size: [2.05, 2.55, 5.4], exhausts: [[0, 0.6, 2.8]], head, tail }
  },

  /** An ice-cream van: snub nose, serving hatch with a striped awning, cream band and drips, a cone on the roof. */
  icecream(k, { body, trim, glass }) {
    const wheels = { radius: 0.44, width: 0.38, x: 0.88, zf: -1.45, zr: 1.3 }
    const deep = shade(body, 0.75)
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-2.36, 2.1],
      top: [-2.36, 0.3, -2.24, 0.5, -2.0, 0.64, -1.7, 0.76, -1.4, 0.84, 2.1, 0.86],
      bottom: [-2.36, 0.02, -2.2, -0.18, -1.95, -0.25, 1.9, -0.25, 2.1, -0.08],
      width: [-2.36, 0.76, -2.22, 0.92, -1.8, 0.98, 2.1, 0.98],
      rt: [-2.3, 0.2, -1.4, 0.05],
      rb: 0.1,
      tumble: 0.99,
      belly: 0.93,
      grooves: [-0.9],
    })
    const up = greenhouse(k, {
      z: [-1.5, 2.1],
      top: [-1.5, 0.84, -1.1, 1.32, -0.86, 1.46, -0.5, 1.5, 1.95, 1.5, 2.1, 1.44],
      bottom: 0.8,
      width: [-1.5, 0.94, -0.9, 0.97, 2.1, 0.97],
      tumble: 0.95,
      rt: 0.2,
      rb: 0.02,
      roof: [-0.88, 2.3],
      sideEnd: -0.9,
      glass,
      roofColor: body,
      bodyColor: body,
      belt: 0.86,
      tailColor: body,
    })
    k.decal(sh, 'side', -2.1, 2.0, 0.36, 0.5, trim, { nu: 4 })
    k.decal(sh, 'rear', -0.9, 0.9, 0.36, 0.5, trim, { nu: 3 })
    k.fine(() =>
      k.pair((s) => {
        for (let i = 0; i < 6; i += 1) {
          const z = -0.6 + i * 0.5
          k.gem(0.08, s * (up.xAt(z, 1.38) + 0.01), 1.38, z, trim, [0.45, 1.6, 1])
        }
      }),
    )
    k.decal(up, 'side', 0.05, 1.45, 0.92, 1.36, INK, { side: 1, nu: 2 })
    k.decal(up, 'side', 0.12, 1.38, 0.97, 1.31, glass, { side: 1, nu: 2, off: 0.016 })
    k.box(0.26, 0.06, 1.5, 1.08, 0.9, 0.75, trim, { bevel: 0.02 })
    for (let i = 0; i < 6; i += 1) k.box(0.36, 0.035, 0.25, 1.12, 1.44, 0.13 + i * 0.25, i % 2 ? WHITE : deep, { r: [0, 0, -0.4] })
    k.box(0.46, 0.06, 0.46, 0, 1.53, 0.55, DARK, { bevel: 0.02 })
    k.lathe([[0.03, 1.56], [0.22, 1.8], [0.23, 1.83]], 0, 0, 0.55, '#d9a35b', { segs: 12 })
    k.gem(0.2, 0, 1.93, 0.55, '#8a5a3c', [1, 0.85, 1], { detail: 1 })
    k.gem(0.15, 0, 2.1, 0.55, '#9df2cf', [1, 0.85, 1], { detail: 1 })
    k.gem(0.045, 0, 2.25, 0.55, NAV_RED, [1, 1, 1], { detail: 1 })
    k.lathe([[0.04, 0], [0.05, 0.12], [0.13, 0.28]], 0, 1.56, -1.0, CHROME, { axis: 'z', segs: 10, r: [0, Math.PI, 0] })
    noseGrille(k, sh, 0.9, 0.12, 0.3, { bars: 2, bar: CHROME })
    const head = lampPair(k, sh, 'front', 0.56, 0.84, 0.36, 0.54, { inset: 0.3 })
    bar(k, -1.0, 1.0, -2.32, 0.02, 0.18, 0.18, DARK)
    bar(k, -1.0, 1.0, 2.1, 0.02, 0.18, 0.18, DARK)
    sideMirrors(k, 0.95, 1.1, -1.35, DARK, { size: 1.1 })
    const tail = lampPair(k, sh, 'rear', 0.78, 0.94, 0.56, 0.8, { inset: 0.05 })
    plateOn(k, sh, 'rear', 0.2)
    const exhausts = tailpipes(k, [[-0.6, -0.18, 2.1]], { r: 0.05 })
    return { wheels, size: [2.1, 2.4, 4.5], exhausts, head, tail }
  },

  /** A tuk-tuk: a rounded nose cowl with one big lamp, mudguards, an open cab, a bench and a fringed canopy. */
  tuktuk(k, { body, trim, glass }) {
    const wheels = { radius: 0.4, width: 0.34, x: 0.8, zf: -1.15, zr: 1.15 }
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      wells: false,
      arches: [{ z: wheels.zr, r: 0.46 }],
      z: [-1.0, 1.76],
      top: [-1.0, 0.42, -0.6, 0.46, 0.3, 0.56, 0.62, 0.84, 1.6, 0.86, 1.76, 0.74],
      bottom: [-1.0, 0.08, -0.8, -0.16, 1.6, -0.16, 1.76, 0.0],
      width: [-1.0, 0.44, -0.6, 0.6, 0.2, 0.72, 0.62, 0.78, 1.6, 0.77, 1.76, 0.66],
      rt: 0.16,
      rb: 0.1,
      tumble: 0.94,
      paint: opening(-0.95, 0.55, 0.5, DARK),
    })
    k.box(1.2, 0.7, 0.8, 0, 0.1, wheels.zr, INK)
    k.decal(sh, 'side', -0.6, 1.6, 0.26, 0.34, trim, { nu: 4 })
    const nose = k.shell({ z: [-1.54, -0.7], top: [-1.54, 0.55, -1.42, 0.95, -1.1, 1.15, -0.7, 1.2], bottom: [-1.54, 0.18, -1.3, -0.02, -0.7, 0.02], width: [-1.54, 0.26, -1.3, 0.38, -0.7, 0.44], rt: 0.24, rb: 0.08, tumble: 0.82, color: body })
    const head = [roundLamp(k, 0, 0.78, (nose.frontZ(0, 0.78) ?? -1.45) + 0.02, 0.13, HEADLIGHT, { housing: CHROME, depth: 0.1 })]
    k.pair((s) => {
      k.gem(0.045, s * 0.24, 0.42, (nose.frontZ(s * 0.24, 0.42) ?? -1.4) - 0.01, AMBER, [1, 1, 0.6], { glow: true })
      k.extrude(arcBand(0.46, 0.52, 0.15, 2.2), s * 0.6, s * 1.0, trim, { at: [0, 0, wheels.zf], smooth: false })
    })
    k.box(1.1, 0.5, 0.04, 0, 1.44, -0.78, glass, { r: [0.12, 0, 0] })
    sweep(k, [[-0.56, 1.18, -0.76], [-0.56, 1.7, -0.82], [0.56, 1.7, -0.82], [0.56, 1.18, -0.76]], 0.025, DARK, { caps: false })
    tube(k, [-0.36, 1.06, -0.6], [0.36, 1.06, -0.6], 0.025, CHROME)
    k.box(0.55, 0.12, 0.45, 0, 0.62, -0.3, DARK, { bevel: 0.04 })
    k.box(0.5, 0.35, 0.1, 0, 0.82, -0.08, DARK, { bevel: 0.03 })
    k.box(1.3, 0.12, 0.55, 0, 0.98, 0.85, DARK, { bevel: 0.04 })
    k.box(1.3, 0.5, 0.12, 0, 1.25, 1.5, DARK, { bevel: 0.04 })
    k.pair((s) => {
      tube(k, [s * 0.66, 0.46, -0.74], [s * 0.66, 1.9, -0.74], 0.03, DARK)
      tube(k, [s * 0.7, 0.86, 1.58], [s * 0.7, 1.9, 1.58], 0.03, DARK)
    })
    const can = k.shell({ z: [-0.86, 1.72], top: [-0.86, 1.98, -0.6, 2.04, 1.5, 2.06, 1.72, 2.0], bottom: 1.88, width: 0.8, rt: 0.1, rb: 0.02, tumble: 0.98, color: trim, paint: (q) => (q.kind === 'side' ? body : null), noseColor: body, tailColor: body })
    k.decal(can, 'top', 0.3, 0.5, -0.7, 1.6, body, { nu: 1, nv: 4, mirror: true })
    k.box(1.45, 0.72, 0.05, 0, 1.52, 1.7, trim)
    sideMirrors(k, 0.68, 1.3, -0.74, DARK, { size: 0.7 })
    const tail = lampPair(k, sh, 'rear', 0.5, 0.7, 0.5, 0.66, { inset: 0.2 })
    plateOn(k, sh, 'rear', 0.28, 0.36, 0.1)
    const exhausts = tailpipes(k, [[0.45, -0.1, 1.76]], { r: 0.045 })
    return { wheels, size: [1.9, 2.1, 3.4], exhausts, head, tail }
  },

  /** A stubby bubble microcar: big round chrome eyes, a contrast bubble roof, a spare on its back and a suitcase. */
  microcar(k, { body, trim, glass }) {
    const wheels = { radius: 0.38, width: 0.34, x: 0.76, zf: -0.92, zr: 0.92 }
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      gap: 0.06,
      z: [-1.38, 1.36],
      top: [-1.38, 0.26, -1.3, 0.42, -1.1, 0.53, -0.6, 0.58, 0.5, 0.62, 1.15, 0.58, 1.36, 0.42],
      bottom: [-1.38, 0.0, -1.25, -0.18, 1.25, -0.18, 1.36, 0.0],
      width: [-1.38, 0.55, -1.25, 0.76, -0.92, 0.87, 0, 0.84, 0.92, 0.87, 1.25, 0.78, 1.36, 0.58],
      rt: 0.24,
      rb: 0.14,
      tumble: 0.92,
      belly: 0.88,
      crown: 0.03,
      grooves: [0.05],
      cabin: {
        z: [-0.72, 1.24],
        top: [-0.72, 0.56, -0.38, 1.18, -0.06, 1.48, 0.35, 1.56, 0.8, 1.48, 1.08, 1.12, 1.24, 0.6],
        bottom: 0.5,
        width: [-0.72, 0.78, 0.3, 0.8, 1.24, 0.72],
        rt: 0.4,
        rb: 0.02,
        tumble: 0.72,
        roof: [-0.02, 0.84],
        roofColor: trim,
        pillars: [0.38],
        belt: 0.56,
      },
    })
    const head = []
    k.pair((s) => {
      const z = sh.frontZ(s * 0.5, 0.36) ?? -1.25
      head.push(roundLamp(k, s * 0.5, 0.36, z - 0.02, 0.12, HEADLIGHT, { housing: CHROME, depth: 0.08, cup: true }))
    })
    const smile = []
    for (let i = -3; i <= 3; i += 1) {
      const x = i * 0.1
      const y = 0.12 + x * x * 0.6
      smile.push([x, y, (sh.frontZ(x, y) ?? -1.3) - 0.015])
    }
    sweep(k, smile, 0.018, CHROME, { segs: 5 })
    for (const face of ['front', 'rear']) {
      const pts = []
      for (let i = -4; i <= 4; i += 1) {
        const x = i * 0.19
        const z = face === 'front' ? sh.frontZ(x, -0.04) : sh.rearZ(x, -0.04)
        pts.push([x, -0.04, (z ?? 0) + (face === 'front' ? -0.02 : 0.02)])
      }
      sweep(k, pts, 0.04, CHROME, { segs: 6 })
    }
    tyre(k, 0.27, 0.15, 0, 0.42, (sh.rearZ(0, 0.42) ?? 1.3) + 0.08, body)
    const ry = gh.topAt(0.3, 0)
    k.pair((s) => tube(k, [s * 0.36, ry + 0.05, -0.1], [s * 0.36, ry + 0.05, 0.7], 0.018, CHROME))
    k.box(0.56, 0.22, 0.42, 0, ry + 0.17, 0.3, '#c78d4c', { bevel: 0.03 })
    k.box(0.58, 0.225, 0.07, 0, ry + 0.17, 0.3, '#f0d9a8')
    const tail = lampPair(k, sh, 'rear', 0.46, 0.64, 0.3, 0.44, { inset: 0.35 })
    sideMirrors(k, sh.xAt(-0.55, 0.55) - 0.05, 0.64, -0.5, body, { size: 0.85 })
    handles(k, sh, [0.28], 0.42)
    const exhausts = tailpipes(k, [[-0.45, -0.14, 1.36]], { r: 0.045 })
    return { wheels, size: [1.8, 1.7, 2.8], exhausts, head, tail }
  },

  /** A vintage roadster: long louvred bonnet, sweeping separate wings and running boards, upright grille, bullet lamps. */
  roadster(k, { body, trim, glass }) {
    const wheels = { radius: 0.45, width: 0.36, x: 0.86, zf: -1.3, zr: 1.3 }
    const deep = shade(body, 0.62)
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      arches: [],
      wells: false,
      z: [-1.84, 1.74],
      top: [-1.84, 0.58, -1.76, 0.8, -1.0, 0.86, -0.25, 0.82, 0.05, 0.66, 0.9, 0.66, 1.3, 0.68, 1.74, 0.5],
      bottom: [-1.84, 0.26, -1.6, 0.06, 1.6, 0.06, 1.74, 0.22],
      width: [-1.84, 0.34, -1.7, 0.4, -0.9, 0.48, -0.3, 0.57, 0.3, 0.63, 1.2, 0.61, 1.74, 0.44],
      rt: 0.16,
      rb: 0.1,
      tumble: 0.92,
      paint: opening(0.0, 0.98, 0.48),
    })
    k.fine(() => {
      for (let i = 0; i < 5; i += 1) k.decal(sh, 'side', -1.55 + i * 0.2, -1.47 + i * 0.2, 0.6, 0.76, deep, { nu: 1 })
    })
    k.decal(sh, 'top', -0.025, 0.025, -1.8, -0.3, CHROME, { nu: 1, nv: 3 })
    k.shell({
      z: [-1.95, -0.28],
      top: [-1.95, 0.2, -1.72, 0.48, -1.35, 0.6, -0.98, 0.54, -0.62, 0.32, -0.28, 0.12],
      bottom: [-1.95, 0.12, -1.72, 0.38, -1.35, 0.5, -0.98, 0.44, -0.62, 0.22, -0.28, 0.04],
      width: 0.23,
      rt: 0.06,
      rb: 0.02,
      tumble: 0.98,
      color: body,
      cx: 0.86,
      pair: true,
      M: 1,
      step: 0.4,
    })
    k.shell({
      z: [0.66, 1.96],
      top: [0.66, 0.08, 0.95, 0.4, 1.3, 0.58, 1.65, 0.5, 1.96, 0.22],
      bottom: [0.66, 0.0, 0.95, 0.3, 1.3, 0.5, 1.65, 0.4, 1.96, 0.14],
      width: 0.23,
      rt: 0.06,
      rb: 0.02,
      color: body,
      cx: 0.86,
      pair: true,
      M: 1,
      step: 0.4,
    })
    k.pair((s) => {
      k.box(0.4, 0.05, 1.0, s * 0.84, 0.02, 0.2, DARK, { bevel: 0.015 })
      k.box(0.42, 0.015, 1.0, s * 0.84, 0.05, 0.2, CHROME)
    })
    k.box(0.62, 0.62, 0.1, 0, 0.56, -1.86, CHROME, { top: [0.85, 1], bevel: 0.04 })
    k.box(0.5, 0.5, 0.04, 0, 0.56, -1.915, INK, { top: [0.85, 1] })
    k.fine(() => {
      for (let i = -2; i <= 2; i += 1) k.box(0.025, 0.46, 0.025, i * 0.09, 0.56, -1.94, CHROME)
    })
    k.gem(0.05, 0, 0.92, -1.84, CHROME, [1, 1.6, 1.2], { detail: 1 })
    const head = []
    k.pair((s) => {
      tube(k, [s * 0.42, 0.55, -1.64], [s * 0.6, 0.78, -1.68], 0.025, CHROME)
      head.push(roundLamp(k, s * 0.62, 0.86, -1.8, 0.12, HEADLIGHT, { housing: CHROME, depth: 0.2 }))
    })
    k.box(1.1, 0.34, 0.03, 0, 0.84, -0.14, glass, { r: [0.2, 0, 0] })
    sweep(k, [[-0.56, 0.68, -0.1], [-0.58, 1.0, -0.06], [0.58, 1.0, -0.06], [0.56, 0.68, -0.1]], 0.018, CHROME, { caps: false })
    k.box(1.0, 0.42, 0.22, 0, 0.84, 0.92, trim, { bevel: 0.08 })
    k.box(0.96, 0.1, 0.5, 0, 0.7, 0.64, trim, { bevel: 0.04 })
    torus(k, 0.15, 0.018, -0.26, 0.86, 0.1, DARK, { axis: 'z', rot: [-1.1, 0, 0] })
    tyre(k, 0.34, 0.18, 0, 0.6, 1.88, trim)
    sweep(k, [[-0.82, 0.12, -1.95], [-0.7, 0.12, -2.02], [0.7, 0.12, -2.02], [0.82, 0.12, -1.95]], 0.04, CHROME)
    sweep(k, [[-0.8, 0.12, 2.0], [-0.68, 0.12, 2.06], [0.68, 0.12, 2.06], [0.8, 0.12, 2.0]], 0.04, CHROME)
    const tail = [roundLamp(k, -0.86, 0.34, 1.9, 0.055, TAILLIGHT, { dir: 1, housing: CHROME, depth: 0.06 }), roundLamp(k, 0.86, 0.34, 1.9, 0.055, TAILLIGHT, { dir: 1, housing: CHROME, depth: 0.06 })]
    const exhausts = tailpipes(k, [[0.45, 0.02, 1.92]], { r: 0.045 })
    return { wheels, size: [2.2, 1.2, 4.2], exhausts, head, tail }
  },

  /** A mini bin lorry: cab-over cab, a rounded ribbed compactor body, a hopper behind and a bin on the side lift. */
  garbage(k, { body, trim, glass }) {
    const wheels = { radius: 0.46, width: 0.4, x: 0.88, zf: -1.35, zr: 1.25 }
    const deep = shade(body, 0.72)
    const bin = '#2f6fe0'
    const cab = k.shell({
      z: [-2.1, -0.9],
      top: [-2.1, 1.34, -2.02, 1.56, -1.8, 1.64, -0.9, 1.66],
      bottom: [-2.1, -0.02, -2.0, -0.2, -0.9, -0.2],
      width: [-2.1, 0.84, -1.96, 0.96, -0.9, 0.96],
      rt: 0.18,
      rb: 0.08,
      tumble: 0.95,
      color: body,
      arches: [{ z: wheels.zf, r: 0.53 }],
      grooves: [-1.15],
    })
    k.decal(cab, 'front', -0.82, 0.82, 0.96, 1.46, glass, { nu: 4 })
    k.decal(cab, 'side', -1.86, -1.25, 1.0, 1.44, glass, { nu: 2 })
    k.lathe([[0.12, 0], [0.12, 0.06], [0.09, 0.17], [0, 0.21]], 0, 1.66, -1.4, AMBER, { glow: true, segs: 10 })
    const ribs = [-0.45, 0.15, 1.7]
    const box = k.shell({
      z: [-0.78, 1.86],
      top: [-0.78, 1.86, -0.6, 2.04, 1.6, 2.08, 1.86, 1.96],
      bottom: 0.3,
      width: [-0.78, 0.92, -0.6, 0.98, 1.86, 0.98],
      rt: 0.36,
      rb: 0.04,
      tumble: 0.9,
      color: body,
      arches: [{ z: wheels.zr, r: 0.53 }],
      cuts: ribs.flatMap((r) => [r - 0.045, r + 0.045]),
      paint: (q) => (q.kind !== 'bottom' && ribs.some((r) => Math.abs(q.z - r) < 0.045) ? deep : null),
    })
    wheelWells(k, wheels, { tops: [0.5, 0.5] })
    k.decal(box, 'side', -0.6, 1.75, 0.5, 0.6, trim, { nu: 4 })
    roundel(k, box, 0.85, 1.2, 0.3, trim)
    k.pair((s) => k.cyl(0.18, 0.012, s * (box.xAt(0.85, 1.2) + 0.025), 1.2, 0.85, body, { axis: 'x', segs: 3 }))
    const hop = k.shell({ z: [1.86, 2.5], top: [1.86, 1.92, 2.5, 1.36], bottom: [1.86, 0.2, 2.5, 0.24], width: [1.86, 0.96, 2.5, 0.94], rt: 0.12, rb: 0.04, color: DARK })
    k.decal(hop, 'rear', -0.72, 0.72, 0.62, 1.0, INK, { nu: 2 })
    k.box(1.85, 0.14, 0.06, 0, 0.38, 2.53, HAZARD, { stripe: DIAG })
    k.box(1.6, 0.06, 0.3, 0, 0.0, 2.4, CHROME, { bevel: 0.015 })
    k.box(1.5, 0.28, 4.2, 0, 0.12, 0.2, DARK, { bevel: 0.04 })
    k.pair((t) => k.box(0.18, 0.05, 0.05, 0.99, 1.2, -0.3 + t * 0.15, STEEL))
    k.box(0.4, 0.62, 0.46, 1.14, 0.78, -0.3, bin, { top: [1.08, 1.08], bevel: 0.03 })
    k.box(0.46, 0.06, 0.52, 1.14, 1.12, -0.3, shade(bin, 0.7), { bevel: 0.015 })
    noseGrille(k, cab, 1.0, 0.36, 0.62, { frame: DARK, bars: 3, bar: STEEL })
    const head = lampPair(k, cab, 'front', 0.6, 0.86, 0.38, 0.56, { inset: 0.12 })
    bar(k, -1.0, 1.0, -2.08, 0.1, 0.2, 0.2, DARK)
    const tail = lampPair(k, hop, 'rear', 0.74, 0.9, 0.34, 0.6, { inset: 0.05 })
    sideMirrors(k, 0.96, 1.22, -1.95, DARK, { size: 1.2 })
    tube(k, [-0.85, 1.2, -0.84], [-0.85, 2.2, -0.84], 0.065, CHROME)
    return { wheels, size: [2.2, 2.25, 4.7], exhausts: [[-0.85, 2.2, -0.84]], head, tail, beacon: [[0, 1.82, -1.4]] }
  },

  /** A tow truck: crew cab, amber light bar, toolboxes and a hazard-striped boom with a hook. */
  towtruck(k, { body, trim, glass }) {
    const wheels = { radius: 0.5, width: 0.42, x: 0.92, zf: -1.4, zr: 1.3 }
    const ar = 0.57
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-2.26, 2.3],
      top: [-2.26, 0.32, -2.15, 0.56, -1.95, 0.68, -1.4, 0.74, -0.78, 0.78, 0.56, 0.8, 0.62, 0.64, 2.3, 0.64],
      bottom: [-2.26, 0.04, -2.1, -0.2, -1.9, -0.32, 1.9, -0.32, 2.1, -0.18, 2.3, -0.02],
      width: [-2.26, 0.8, -2.12, 0.96, -1.4, 1.02, 0, 1.0, 1.3, 1.02, 2.3, 1.0],
      rt: [-2.2, 0.16, 0.56, 0.14, 0.64, 0.03],
      rb: 0.1,
      tumble: 0.97,
      belly: 0.92,
      crown: 0.03,
      grooves: [-0.72, 0.5],
      paint: paints(deck(DARK, 0.64, 3), archBand(wheels, ar, trim, { w: 0.09 })),
      cabin: {
        z: [-0.82, 0.58],
        top: [-0.82, 0.76, -0.3, 1.36, -0.14, 1.46, 0.46, 1.49, 0.58, 1.44],
        bottom: 0.7,
        width: [-0.82, 0.94, 0.58, 0.94],
        tumble: 0.86,
        rt: 0.12,
        rb: 0.02,
        roof: [-0.14, 0.5],
        belt: 0.78,
        tailColor: body,
        pillars: [-0.02],
      },
    })
    k.decal(gh, 'rear', -0.55, 0.55, 0.98, 1.32, glass, { nu: 2 })
    k.box(1.4, 0.12, 0.24, 0, 1.56, -0.28, DARK, { bevel: 0.03 })
    const beacon = []
    k.pair((s) => {
      k.lathe([[0.12, 0], [0.12, 0.05], [0.09, 0.13], [0, 0.16]], s * 0.48, 1.62, -0.28, AMBER, { glow: true, segs: 10 })
      beacon.push([s * 0.48, 1.7, -0.28])
    })
    k.box(0.36, 0.06, 0.03, 0, 1.56, -0.41, AMBER, { glow: true })
    k.pair((s) => {
      k.box(0.4, 0.4, 1.4, s * 0.74, 0.86, 1.25, STEEL, { bevel: 0.03 })
      k.box(0.03, 0.05, 0.25, s * 0.955, 0.92, 1.25, CHROME)
    })
    k.lathe([[0.3, 0.64], [0.3, 0.9], [0, 0.92]], 0, 0, 1.0, DARK, { segs: 12 })
    k.box(0.5, 0.36, 0.5, 0, 1.1, 1.0, trim, { bevel: 0.05 })
    k.box(0.24, 0.24, 1.5, 0, 1.5, 1.66, HAZARD, { stripe: DIAG, r: [-0.5, 0, 0], bevel: 0.03 })
    k.cyl(0.1, 0.28, 0, 1.86, 2.32, DARK, { axis: 'x', segs: 10 })
    tube(k, [0, 1.8, 2.38], [0, 1.32, 2.38], 0.012, INK)
    sweep(k, [[0, 1.32, 2.38], [0, 1.2, 2.38], [0, 1.12, 2.44], [0, 1.14, 2.52], [0, 1.22, 2.53]], 0.025, CHROME, { segs: 5 })
    k.box(1.5, 0.1, 0.12, 0, 0.05, 2.42, HAZARD, { stripe: DIAG, bevel: 0.02 })
    k.pair((s) => k.box(0.08, 0.08, 0.35, s * 0.55, 0.05, 2.22, DARK))
    noseGrille(k, sh, 0.96, 0.22, 0.52, { frame: DARK, bars: 3, bar: CHROME })
    const head = lampPair(k, sh, 'front', 0.6, 0.9, 0.34, 0.52, { inset: 0.15 })
    bar(k, -1.0, 1.0, -2.22, 0.06, 0.18, 0.16, CHROME)
    handles(k, sh, [-0.25, 0.3], 0.58)
    sideMirrors(k, 0.92, 1.0, -0.62, trim, { size: 1.1 })
    const tail = lampPair(k, sh, 'rear', 0.8, 0.96, 0.2, 0.54, { inset: 0.05 })
    plateOn(k, sh, 'rear', 0.1)
    const exhausts = tailpipes(k, [[-0.7, -0.24, 2.26]], { r: 0.055 })
    return { wheels, size: [2.2, 2.15, 4.8], exhausts, head, tail, beacon }
  },
}
