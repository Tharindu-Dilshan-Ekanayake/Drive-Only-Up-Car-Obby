import { CREAM, GOLD, HOVER, ICE, lower, opening, VELVET } from './carBuilders'
import {
  AMBER,
  archBand,
  bar,
  CHROME,
  DARK,
  DIAG,
  FLAME,
  handles,
  HAZARD,
  HEADLIGHT,
  INK,
  lampPair,
  noseGrille,
  paints,
  plateOn,
  rearWing,
  roadBody,
  roundel,
  roundLamp,
  RUBBER,
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

const deck = (color, z0 = -Infinity, z1 = Infinity) => (q) => (q.kind === 'top' && q.z > z0 && q.z < z1 ? color : null)

/** The last ten of the original garage (same contract as carBuilders.js). */
export const BUILDERS_3 = {
  /** A beach dune buggy: a swoopy fibreglass tub with flared wings, spare on the nose, rear engine and a surfboard. */
  sandpiper(k, { body, trim, glass }) {
    const wheels = { radius: 0.48, width: 0.44, x: 0.95, zf: -1.2, zr: 1.15 }
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-1.96, 1.76],
      top: [-1.96, 0.26, -1.75, 0.46, -1.2, 0.66, -0.62, 0.56, -0.2, 0.52, 0.75, 0.52, 1.15, 0.66, 1.55, 0.58, 1.76, 0.46],
      bottom: [-1.96, 0.12, -1.6, -0.12, 1.4, -0.12, 1.76, 0.1],
      width: [-1.96, 0.42, -1.7, 0.64, -1.2, 1.05, -0.62, 0.78, 0, 0.74, 0.62, 0.78, 1.15, 1.06, 1.55, 0.92, 1.76, 0.7],
      rt: 0.3,
      rb: 0.12,
      tumble: 0.82,
      belly: 0.82,
      crown: -0.03,
      paint: opening(-0.55, 1.0, 0.56),
    })
    k.decal(sh, 'side', -1.5, 1.4, 0.18, 0.26, trim, { nu: 5 })
    tyre(k, 0.3, 0.16, 0, sh.topAt(-1.45, 0) + 0.07, -1.45, CHROME, { axis: 'y' })
    k.pair((s) => {
      k.box(0.44, 0.55, 0.14, s * 0.3, 0.78, 0.78, DARK, { bevel: 0.05, r: [-0.15, 0, 0] })
      k.box(0.42, 0.1, 0.4, s * 0.3, 0.6, 0.55, DARK, { bevel: 0.03 })
    })
    torus(k, 0.13, 0.016, -0.3, 0.78, -0.22, DARK, { axis: 'z', rot: [-1.1, 0, 0] })
    k.box(1.1, 0.28, 0.03, 0, 0.7, -0.6, glass, { r: [0.35, 0, 0] })
    sweep(k, [[-0.56, 0.56, -0.56], [-0.56, 0.84, -0.66], [0.56, 0.84, -0.66], [0.56, 0.56, -0.56]], 0.018, CHROME, { caps: false })
    k.box(0.85, 0.36, 0.6, 0, 0.62, 1.38, DARK, { bevel: 0.05 })
    k.lathe([[0.15, 0], [0.16, 0.08], [0.1, 0.12], [0, 0.13]], 0, 0.8, 1.3, CHROME, { segs: 10 })
    k.fine(() => k.pair((s) => k.box(0.03, 0.28, 0.5, s * 0.44, 0.6, 1.38, STEEL)))
    k.pair((s) => tube(k, [s * 0.3, 0.6, 1.6], [s * 0.3, 1.0, 1.62], 0.05, CHROME))
    // Surf rack, the board with a stripe and a fin.
    for (const z of [-0.15, 1.0]) sweep(k, [[-0.62, 0.5, z], [-0.62, 1.3, z], [0.62, 1.3, z], [0.62, 0.5, z]], 0.028, CHROME, { caps: false })
    const board = k.shell({ z: [-0.95, 1.65], top: [-0.95, 1.4, -0.7, 1.43, 1.4, 1.43, 1.65, 1.41], bottom: [-0.95, 1.37, -0.7, 1.35, 1.4, 1.35, 1.65, 1.37], width: [-0.95, 0.04, -0.7, 0.2, 0.3, 0.28, 1.4, 0.2, 1.65, 0.06], rt: 0.03, rb: 0.02, M: 1, step: 0.5, color: trim })
    k.decal(board, 'top', -0.03, 0.03, -0.75, 1.5, WHITE, { nu: 1, nv: 4, off: 0.006 })
    k.extrude([[0, 0], [0.22, 0], [0.18, -0.16]], -0.015, 0.015, trim, { at: [0, 1.36, 1.4], smooth: false })
    const head = []
    k.pair((s) => {
      const z = sh.frontZ(s * 0.4, 0.32)
      head.push(roundLamp(k, s * 0.4, 0.32, (z ?? -1.85) + 0.02, 0.09, HEADLIGHT, { housing: CHROME, depth: 0.08 }))
    })
    const nb = []
    for (let i = -3; i <= 3; i += 1) nb.push([i * 0.2, 0.06, (sh.frontZ(i * 0.2, 0.12) ?? -1.9) - 0.06])
    sweep(k, nb, 0.035, CHROME)
    const tail = lampPair(k, sh, 'rear', 0.36, 0.54, 0.24, 0.34, { inset: 0.2 })
    plateOn(k, sh, 'rear', 0.24, 0.34, 0.09)
    return { wheels, size: [2.15, 1.5, 3.95], exhausts: [[-0.3, 1.0, 1.62], [0.3, 1.0, 1.62]], head, tail }
  },

  /** A snowcat: rubber tracks round the wheels, a glass-banded cab on a deck, a plough, cargo box and skis. */
  snowcat(k, { body, trim, glass }) {
    const R = 0.5
    const ty = 0.14
    const wheels = { radius: R, width: 0.5, x: 0.95, zf: -1.2, zr: 1.2 }
    const TR = R + 0.04
    const track = []
    for (let i = 0; i <= 8; i += 1) {
      const t = (i / 8) * Math.PI
      track.push([wheels.zf - TR * Math.sin(t), ty + TR * Math.cos(t)])
    }
    for (let i = 0; i <= 8; i += 1) {
      const t = (i / 8) * Math.PI
      track.push([wheels.zr + TR * Math.sin(t), ty - TR * Math.cos(t)])
    }
    k.pair((s) => {
      k.extrude(track, s * 0.68, s * 1.22, RUBBER)
      k.fine(() => {
        for (let i = 0; i < 7; i += 1) k.box(0.56, 0.04, 0.1, s * 0.95, ty + TR + 0.015, -1.05 + i * 0.35, DARK)
      })
      for (const z of [wheels.zf, wheels.zr]) k.cyl(0.32, 0.03, s * 1.235, ty, z, STEEL, { axis: 'x', segs: 12 })
      for (const z of [-0.6, 0, 0.6]) k.cyl(0.22, 0.03, s * 1.235, ty - 0.15, z, STEEL, { axis: 'x', segs: 10 })
    })
    k.box(1.3, 0.6, 3.2, 0, 0.55, 0, DARK, { bevel: 0.06 })
    k.box(2.5, 0.14, 3.5, 0, 0.82, 0.05, body, { bevel: 0.04 })
    const cab = k.shell({
      z: [-1.16, 0.66],
      top: [-1.16, 1.78, -1.0, 1.88, 0.66, 1.9],
      bottom: 0.86,
      width: [-1.16, 0.8, -0.9, 0.84, 0.66, 0.84],
      rt: 0.12,
      rb: 0.02,
      tumble: 0.93,
      color: body,
      paint: (q) => (q.kind === 'top' ? trim : null),
    })
    k.decal(cab, 'front', -0.76, 0.76, 1.3, 1.74, glass, { nu: 3 })
    k.decal(cab, 'side', -1.0, 0.5, 1.3, 1.74, glass, { nu: 3 })
    k.fine(() => k.decal(cab, 'side', -0.32, -0.26, 1.28, 1.76, DARK, { nu: 1, off: 0.016 }))
    k.box(1.7, 0.1, 1.86, 0, 1.94, -0.25, trim, { bevel: 0.04 })
    k.box(1.2, 0.1, 0.16, 0, 2.05, -0.95, DARK, { bevel: 0.02 })
    for (const x of [-0.42, -0.14, 0.14, 0.42]) k.cyl(0.06, 0.02, x, 2.05, -1.04, HEADLIGHT, { axis: 'z', segs: 10, glow: true })
    k.lathe([[0.1, 0], [0.1, 0.05], [0.08, 0.14], [0, 0.17]], 0.55, 1.99, 0.4, AMBER, { glow: true, segs: 10 })
    sideMirrors(k, 0.84, 1.5, -1.0, DARK)
    k.box(1.7, 0.6, 1.1, 0, 1.2, 1.15, shade(body, 0.72), { bevel: 0.05 })
    k.pair((s) => {
      k.box(0.1, 0.03, 1.5, s * 0.45, 1.52, 1.1, WHITE)
      k.box(0.1, 0.03, 0.2, s * 0.45, 1.56, 0.3, WHITE, { r: [0.5, 0, 0] })
      k.box(0.1, 0.03, 1.5, s * 0.25, 1.52, 1.1, trim)
      k.box(0.1, 0.03, 0.2, s * 0.25, 1.56, 0.3, trim, { r: [0.5, 0, 0] })
    })
    // Plough: arms and a curved blade with a hazard edge.
    k.pair((s) => k.box(0.1, 0.1, 0.7, s * 0.55, 0.4, -1.95, DARK))
    const blade = [[-2.42, 0.0], [-2.32, 0.2], [-2.3, 0.38], [-2.36, 0.56], [-2.46, 0.66], [-2.4, 0.68], [-2.29, 0.58], [-2.23, 0.38], [-2.25, 0.18], [-2.35, -0.02]]
    k.extrude(blade, -1.25, 1.25, trim, { smooth: true })
    k.box(2.5, 0.1, 0.06, 0, 0.04, -2.42, HAZARD, { stripe: DIAG, r: [0.4, 0, 0] })
    const head = lampPair(k, cab, 'front', 0.52, 0.72, 1.0, 1.14, { inset: 0.1 })
    const tail = [roundLamp(k, -0.65, 1.05, 1.71, 0.06, TAILLIGHT, { dir: 1, housing: DARK, depth: 0.05 }), roundLamp(k, 0.65, 1.05, 1.71, 0.06, TAILLIGHT, { dir: 1, housing: DARK, depth: 0.05 })]
    tube(k, [-0.95, 0.9, 0.75], [-0.95, 2.05, 0.75], 0.06, CHROME)
    return { wheels, size: [2.55, 2.45, 4.2], exhausts: [[-0.95, 2.05, 0.75]], head, tail, beacon: [[0.55, 2.12, 0.4]] }
  },

  /** A 1950s fish-market truck: rounded cab, pontoon wings, tall grille, a flatbed of iced crates and a fish on the roof. */
  fishtruck(k, { body, trim, glass }) {
    const wheels = { radius: 0.47, width: 0.4, x: 0.9, zf: -1.45, zr: 1.4 }
    const deep = shade(body, 0.7)
    const crate = shade(WOOD, 1.25)
    k.box(1.5, 0.28, 4.2, 0, 0.12, 0.15, DARK, { bevel: 0.04 })
    const bonnet = k.shell({ z: [-2.26, -0.92], top: [-2.26, 0.66, -2.16, 0.84, -1.6, 0.94, -0.92, 1.0], bottom: [-2.26, 0.22, -2.1, 0.12, -0.92, 0.12], width: [-2.26, 0.38, -2.1, 0.48, -1.3, 0.55, -0.92, 0.6], rt: 0.2, rb: 0.06, tumble: 0.92, color: body })
    k.shell({
      z: [-2.16, -0.56],
      top: [-2.16, 0.16, -1.98, 0.48, -1.62, 0.64, -1.28, 0.64, -0.94, 0.46, -0.56, 0.14],
      bottom: [-2.16, 0.06, -1.98, 0.36, -1.62, 0.52, -1.28, 0.52, -0.94, 0.34, -0.56, 0.04],
      width: 0.25,
      rt: 0.12,
      rb: 0.03,
      tumble: 0.95,
      color: body,
      cx: 0.86,
      pair: true,
      M: 2,
    })
    const cab = k.shell({ z: [-1.0, 0.24], top: [-1.0, 1.04, -0.88, 1.46, -0.68, 1.7, 0.18, 1.76, 0.24, 1.7], bottom: 0.12, width: [-1.0, 0.86, -0.5, 0.95, 0.24, 0.95], rt: 0.32, rb: 0.06, tumble: 0.88, color: body, grooves: [-0.04] })
    k.decal(cab, 'front', -0.7, 0.7, 1.24, 1.58, glass, { nu: 4 })
    k.decal(cab, 'side', -0.8, 0.04, 1.2, 1.54, glass, { nu: 2 })
    k.decal(cab, 'rear', -0.45, 0.45, 1.2, 1.5, glass, { nu: 2 })
    k.pair((s) => k.box(0.3, 0.05, 0.9, s * 0.86, 0.1, -0.12, DARK, { bevel: 0.015 }))
    noseGrille(k, bonnet, 0.6, 0.3, 0.76, { frame: CHROME, bars: 4 })
    sweep(k, [[-0.95, 0.14, -2.2], [-0.8, 0.14, -2.3], [0.8, 0.14, -2.3], [0.95, 0.14, -2.2]], 0.05, CHROME)
    const head = []
    k.pair((s) => head.push(roundLamp(k, s * 0.82, 0.66, -1.92, 0.1, HEADLIGHT, { housing: CHROME, depth: 0.16 })))
    // Flatbed with slatted sides, crates of fish on ice.
    k.box(1.95, 0.12, 2.25, 0, 0.62, 1.22, WOOD)
    k.pair((s) => {
      k.box(0.07, 0.32, 2.25, s * 0.94, 0.84, 1.22, WOOD)
      k.box(0.08, 0.04, 2.27, s * 0.94, 0.98, 1.22, deep)
    })
    k.box(1.95, 0.32, 0.07, 0, 0.84, 2.31, WOOD)
    k.box(1.97, 0.04, 0.08, 0, 0.98, 2.31, deep)
    k.box(1.95, 0.5, 0.07, 0, 0.93, 0.14, deep)
    for (const [x, z] of [[-0.45, 0.75], [0.45, 0.75], [-0.45, 1.65], [0.45, 1.65]]) {
      k.box(0.7, 0.36, 0.62, x, 0.86, z, crate, { bevel: 0.02 })
      k.box(0.62, 0.04, 0.54, x, 1.05, z, ICE)
      k.fine(() => {
        k.gem(0.13, x - 0.12, 1.09, z, '#a9c3d1', [1.8, 0.6, 0.7])
        k.gem(0.13, x + 0.13, 1.09, z + 0.1, '#ff9f6b', [1.8, 0.6, 0.7])
      })
    }
    // The mascot: a big fish on a stand.
    k.box(0.08, 0.14, 0.08, 0, 1.76, -0.38, DARK)
    k.lathe([[0, -0.55], [0.16, -0.4], [0.24, -0.1], [0.22, 0.2], [0.11, 0.45], [0, 0.52]], 0, 1.97, -0.38, trim, { axis: 'x', segs: 10 })
    k.box(0.3, 0.1, 0.05, 0.6, 2.06, -0.38, trim, { r: [0, 0, 0.6] })
    k.box(0.3, 0.1, 0.05, 0.6, 1.88, -0.38, trim, { r: [0, 0, -0.6] })
    k.box(0.4, 0.08, 0.04, 0.0, 2.2, -0.38, shade(trim, 0.75), { top: [0.4, 1] })
    k.pair((s) => {
      k.gem(0.06, -0.4, 2.02, -0.38 + s * 0.13, WHITE)
      k.gem(0.035, -0.42, 2.02, -0.38 + s * 0.17, INK)
    })
    const tail = [roundLamp(k, -0.7, 0.84, 2.36, 0.06, TAILLIGHT, { dir: 1, housing: CHROME, depth: 0.05 }), roundLamp(k, 0.7, 0.84, 2.36, 0.06, TAILLIGHT, { dir: 1, housing: CHROME, depth: 0.05 })]
    sideMirrors(k, 0.92, 1.25, -0.7, DARK)
    const exhausts = tailpipes(k, [[-0.65, 0.0, 2.3]], { r: 0.05 })
    return { wheels, size: [2.15, 2.4, 4.8], exhausts, head, tail }
  },

  /** A desert trophy truck: long-travel coilovers, huge flared arches, a raked cab, bed cage with a spare and a light bar. */
  trophy(k, { body, trim, glass }) {
    const wheels = { radius: 0.58, width: 0.5, x: 1.05, zf: -1.45, zr: 1.45 }
    const ar = 0.66
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      wells: false,
      z: [-2.26, 2.2],
      top: [-2.26, 0.64, -2.1, 0.84, -1.8, 0.92, -1.45, 0.96, -0.72, 0.98, 0.5, 0.98, 0.56, 0.88, 2.2, 0.88],
      bottom: [-2.26, 0.5, -2.05, 0.3, 2.0, 0.3, 2.2, 0.46],
      width: [-2.26, 0.8, -2.0, 1.0, -1.45, 1.22, -0.8, 1.0, 0.8, 1.0, 1.45, 1.22, 2.0, 1.02, 2.2, 0.9],
      rt: [-2.2, 0.14, 0.5, 0.14, 0.58, 0.04],
      rb: 0.1,
      tumble: 0.95,
      paint: paints(deck(DARK, 0.58, 3), archBand(wheels, ar, DARK, { w: 0.07 })),
      cabin: {
        z: [-0.74, 0.52],
        top: [-0.74, 0.96, -0.3, 1.46, -0.1, 1.56, 0.42, 1.57, 0.52, 1.5],
        bottom: 0.9,
        width: [-0.74, 0.9, 0.52, 0.9],
        tumble: 0.8,
        rt: 0.14,
        rb: 0.02,
        roof: [-0.1, 0.46],
        belt: 0.98,
        tailColor: body,
      },
    })
    k.decal(gh, 'rear', -0.5, 0.5, 1.12, 1.42, glass, { nu: 2 })
    k.box(1.3, 0.2, 3.8, 0, 0.12, 0, DARK, { bevel: 0.04 })
    k.box(1.1, 0.08, 0.7, 0, 0.1, -1.95, STEEL, { r: [0.35, 0, 0] })
    k.pair((s) => {
      for (const z of [wheels.zf, wheels.zr]) {
        tube(k, [s * 0.5, 0.66, z - 0.08], [s * 0.9, 0.0, z - 0.08], 0.09, trim)
        k.box(0.7, 0.07, 0.12, s * 0.62, 0.0, z + 0.12, DARK)
      }
    })
    k.box(0.5, 0.1, 0.5, 0, sh.topAt(-1.1, 0) + 0.04, -1.1, DARK, { top: [0.8, 0.6], bevel: 0.02 })
    k.box(1.5, 0.12, 0.18, 0, 1.66, -0.3, DARK, { bevel: 0.03 })
    for (let i = -2; i <= 2; i += 1) k.cyl(0.065, 0.02, i * 0.28, 1.66, -0.4, HEADLIGHT, { axis: 'z', segs: 10, glow: true })
    tyre(k, 0.48, 0.28, 0, 1.04, 1.3, CHROME, { axis: 'y' })
    k.pair((s) => {
      sweep(k, [[s * 0.75, 0.9, 0.6], [s * 0.75, 1.5, 0.56], [s * 0.7, 1.58, 0.6]], 0.04, trim)
      tube(k, [s * 0.7, 1.58, 0.6], [s * 0.75, 0.92, 2.05], 0.04, trim)
    })
    tube(k, [-0.7, 1.58, 0.6], [0.7, 1.58, 0.6], 0.04, trim)
    k.decal(sh, 'side', -2.0, 2.0, 0.42, 0.5, trim, { nu: 5 })
    roundel(k, sh, -0.1, 0.66, 0.2, WHITE)
    roundel(k, sh, -0.1, 0.66, 0.13, trim, { off: 0.016 })
    k.pair((s) => k.box(0.1, 0.12, 0.06, s * 0.5, 0.42, -2.25, '#ff3b4e'))
    noseGrille(k, sh, 1.0, 0.56, 0.72, { frame: DARK })
    const head = lampPair(k, sh, 'front', 0.62, 0.92, 0.66, 0.8, { inset: 0.15 })
    const tail = lampPair(k, sh, 'rear', 0.75, 0.95, 0.55, 0.8, { inset: 0.05 })
    sideMirrors(k, 0.92, 1.18, -0.6, DARK)
    const exhausts = tailpipes(k, [[0.55, 0.4, 2.22]], { r: 0.07 })
    return { wheels, size: [2.5, 1.8, 4.6], exhausts, head, tail }
  },

  /** A neon street racer: a low wedge with neon lines and underglow, slim light strips and a swan-neck wing (neon = trim). */
  neon(k, { body, trim, glass }) {
    const wheels = { radius: 0.44, width: 0.44, x: 0.95, zf: -1.35, zr: 1.35 }
    const deep = shade(body, 0.7)
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      gap: 0.06,
      z: [-2.16, 2.16],
      top: [-2.16, 0.02, -2.05, 0.2, -1.7, 0.38, -1.35, 0.54, -0.9, 0.5, -0.6, 0.52, 0.5, 0.58, 1.35, 0.62, 1.9, 0.58, 2.16, 0.46],
      bottom: [-2.16, -0.14, -1.95, -0.26, 1.95, -0.26, 2.16, -0.12],
      width: [-2.16, 0.7, -2.0, 0.9, -1.35, 1.04, -0.6, 0.97, 0.5, 0.97, 1.35, 1.05, 1.9, 0.98, 2.16, 0.86],
      rt: 0.14,
      rb: 0.08,
      tumble: 0.9,
      belly: 0.9,
      crown: [-1.7, -0.02, -1.35, -0.07, -0.7, -0.03, 1.0, -0.04, 1.35, -0.06, 2.0, -0.02],
      grooves: [-0.58],
      cabin: {
        z: [-0.64, 1.72],
        top: [-0.64, 0.5, 0.0, 0.88, 0.3, 0.98, 0.7, 0.98, 1.1, 0.86, 1.72, 0.6],
        bottom: 0.46,
        width: [-0.64, 0.8, 0.4, 0.8, 1.72, 0.7],
        tumble: 0.7,
        rt: 0.18,
        rb: 0.02,
        roof: [0.25, 0.85],
        belt: 0.52,
      },
    })
    k.decal(sh, 'side', -1.75, 1.75, 0.12, 0.15, trim, { nu: 6, glow: true })
    k.pair((s) => k.box(0.04, 0.03, 2.4, s * 0.84, -0.27, 0, trim, { glow: true }))
    k.box(1.5, 0.03, 0.04, 0, -0.27, -1.98, trim, { glow: true })
    k.box(1.5, 0.03, 0.04, 0, -0.27, 1.98, trim, { glow: true })
    k.decal(sh, 'top', 0.3, 0.5, -1.15, -0.8, INK, { mirror: true, nu: 1, nv: 2 })
    k.decal(sh, 'side', 0.55, 1.0, -0.06, 0.12, INK, { nu: 2 })
    rearWing(k, { span: 1.9, chord: 0.42, y: 0.98, z: 1.92, deckY: sh.topAt(1.88, 0.42), color: deep, swan: true, standX: 0.42 })
    k.box(1.9, 0.025, 0.025, 0, 1.0, 2.14, trim, { glow: true })
    k.extrude([[-0.14, 0], [0.12, 0], [0.12, 0.03], [-0.14, 0.03]], -0.95, 0.95, DARK, { at: [0, -0.28, -2.0] })
    noseGrille(k, sh, 0.9, -0.2, -0.05)
    const head = lampPair(k, sh, 'front', 0.36, 0.86, 0.17, 0.24, { skew: 0.05, taper: 0.3, inset: 0.4 })
    k.decal(sh, 'rear', -0.86, 0.86, 0.33, 0.41, INK, { nu: 6, off: 0.006 })
    k.decal(sh, 'rear', -0.82, 0.82, 0.35, 0.39, TAILLIGHT, { nu: 6, glow: true })
    const tail = [-0.55, 0.55].map((x) => [x, 0.37, (sh.rearZ(x, 0.37) ?? 2.1) + 0.03])
    k.decal(sh, 'rear', -0.7, 0.7, -0.24, -0.06, INK, { nu: 3 })
    k.fine(() => {
      for (const x of [-0.45, -0.15, 0.15, 0.45]) k.box(0.03, 0.14, 0.3, x, -0.18, (sh.rearZ(x, -0.18) ?? 2.1) - 0.1, DARK)
    })
    sideMirrors(k, sh.xAt(-0.45, 0.5) - 0.06, 0.6, -0.45, body, { size: 0.9 })
    const exhausts = tailpipes(k, [[-0.12, -0.12, 2.16], [0.12, -0.12, 2.16]], { r: 0.06 })
    return { wheels, size: [2.1, 1.15, 4.4], exhausts, head, tail }
  },

  /** A pirate ship on wheels: planked hull with a pointed bow, cannons, a stern castle, mast, billowing sail and flag. */
  pirate(k, { body, trim }) {
    const wheels = { radius: 0.5, width: 0.44, x: 0.95, zf: -1.3, zr: 1.3 }
    const deep = shade(body, 0.66)
    const { sh } = roadBody(k, { body }, {
      wheels,
      z: [-2.72, 1.96],
      top: [-2.72, 1.02, -2.2, 0.9, -1.0, 0.82, 1.0, 0.84, 1.6, 0.92, 1.96, 0.96],
      bottom: [-2.72, 0.92, -2.3, 0.36, -1.8, 0.02, -1.0, -0.14, 1.5, -0.14, 1.96, 0.12],
      width: [-2.72, 0.04, -2.3, 0.5, -1.6, 0.92, -0.5, 1.02, 1.0, 1.0, 1.6, 0.95, 1.96, 0.86],
      rt: 0.05,
      rb: 0.3,
      belly: 0.55,
      tumble: 0.96,
      crown: 0.02,
      paint: deck(WOOD),
    })
    for (const y of [0.2, 0.4, 0.6]) k.decal(sh, 'side', -2.25, 1.85, y - 0.012, y + 0.012, deep, { nu: 8 })
    k.decal(sh, 'side', -2.4, 1.9, 0.72, 0.8, trim, { nu: 8 })
    const castle = k.shell({ z: [1.0, 1.95], top: [1.0, 1.32, 1.95, 1.4], bottom: 0.76, width: [1.0, 0.94, 1.95, 0.86], rt: 0.04, rb: 0.02, tumble: 0.97, color: body, paint: deck(WOOD) })
    k.box(1.9, 0.08, 0.06, 0, 1.36, 0.98, trim)
    for (const x of [-0.45, 0, 0.45]) {
      k.decal(castle, 'rear', x - 0.15, x + 0.15, 0.96, 1.2, trim, { nu: 1, off: 0.008 })
      k.decal(castle, 'rear', x - 0.12, x + 0.12, 0.99, 1.17, AMBER, { nu: 1, glow: true, off: 0.014 })
    }
    torus(k, 0.2, 0.025, 0, 1.42, 0.92, trim, { axis: 'z' })
    k.fine(() => {
      for (let i = 0; i < 4; i += 1) k.box(0.025, 0.46, 0.025, 0, 1.42, 0.92, WOOD, { r: [0, 0, (i * Math.PI) / 4] })
    })
    for (const z of [0.45, 0.0]) k.lathe([[0.15, 0], [0.18, 0.18], [0.15, 0.36], [0, 0.37]], -0.6, 0.84, z, WOOD, { segs: 10 })
    k.box(0.5, 0.3, 0.34, 0.5, 0.98, 0.3, shade(WOOD, 0.8), { bevel: 0.03 })
    k.box(0.52, 0.05, 0.36, 0.5, 1.05, 0.3, trim)
    k.pair((s) => {
      for (const z of [-0.5, 0.55]) {
        k.box(0.04, 0.26, 0.3, s * ((sh.xAt(z, 0.55) ?? 1) + 0.01), 0.55, z, trim)
        k.lathe([[0.1, 0], [0.09, 0.3], [0.11, 0.32], [0.11, 0.36], [0.07, 0.36], [0.07, 0.3]], s * 0.85, 0.55, z, [DARK, DARK, DARK, INK, INK], { axis: 'x', segs: 10, r: s < 0 ? [0, 0, Math.PI] : [0, 0, 0] })
      }
    })
    // Mast, yards, billowing sail with a red band, crow's nest and flag.
    k.cyl(0.07, 1.45, 0, 1.52, -0.15, WOOD, { segs: 8 })
    k.box(1.6, 0.06, 0.06, 0, 2.0, -0.12, WOOD)
    k.box(1.5, 0.06, 0.06, 0, 1.22, -0.12, WOOD)
    const sail = [[0.0, -0.36], [-0.1, -0.12], [-0.12, 0.12], [-0.08, 0.36], [-0.04, 0.36], [-0.08, 0.12], [-0.06, -0.12], [0.04, -0.36]]
    k.extrude(sail, -0.7, 0.7, CREAM, { at: [0, 1.61, -0.1] })
    k.extrude([[-0.135, -0.07], [-0.135, 0.07], [-0.1, 0.07], [-0.1, -0.07]], -0.66, 0.66, '#c7313d', { at: [0, 1.61, -0.1], smooth: false })
    k.lathe([[0.16, 0], [0.17, 0.12], [0.14, 0.12]], 0, 2.04, -0.15, WOOD, { segs: 10 })
    k.box(0.03, 0.18, 0.32, 0, 2.15, 0.2, INK)
    k.gem(0.04, 0, 2.15, 0.2, WHITE)
    tube(k, [0, 0.98, -2.5], [0, 1.18, -3.08], 0.04, WOOD)
    k.gem(0.12, 0, 0.66, -2.52, trim, [0.8, 1.2, 1])
    const head = []
    k.pair((s) => {
      k.gem(0.09, s * 0.36, 0.98, -2.0, HEADLIGHT, [1, 1.2, 1], { glow: true, detail: 1 })
      head.push([s * 0.36, 0.98, -2.1])
    })
    const tail = lampPair(k, sh, 'rear', 0.55, 0.75, 0.42, 0.58, { inset: 0.2 })
    const exhausts = tailpipes(k, [[0, 0.3, 1.98]], { color: DARK, r: 0.07 })
    return { wheels, size: [2.3, 2.25, 5.1], exhausts, head, tail }
  },

  /** A hover-rod: a chopped hot rod with a chrome blower and zoomies, glowing hover pods over the wheels and a jet. */
  hotrod(k, { body, trim, glass }) {
    const wheels = { radius: 0.46, width: 0.46, x: 0.95, zf: -1.3, zr: 1.35 }
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      arches: [],
      wells: false,
      z: [-1.9, 1.96],
      top: [-1.9, 0.56, -1.8, 0.72, -0.62, 0.78, -0.3, 0.74, 0.9, 0.72, 1.6, 0.7, 1.96, 0.52],
      bottom: [-1.9, 0.22, -1.7, 0.06, 1.7, 0.06, 1.96, 0.22],
      width: [-1.9, 0.38, -1.7, 0.45, -0.7, 0.52, -0.3, 0.62, 1.0, 0.64, 1.6, 0.6, 1.96, 0.45],
      rt: 0.16,
      rb: 0.1,
      tumble: 0.9,
      cabin: {
        z: [-0.28, 0.98],
        top: [-0.28, 0.72, -0.06, 0.98, 0.15, 1.04, 0.75, 1.04, 0.98, 0.74],
        bottom: 0.68,
        width: 0.6,
        tumble: 0.85,
        rt: 0.1,
        rb: 0.02,
        roof: [0.15, 0.75],
        roofColor: trim,
        belt: 0.74,
      },
    })
    const by = sh.topAt(-1.0, 0)
    k.box(0.56, 0.3, 0.7, 0, by + 0.13, -1.0, CHROME, { bevel: 0.05 })
    k.box(0.5, 0.2, 0.36, 0, by + 0.36, -1.08, DARK, { top: [0.8, 0.7], bevel: 0.03 })
    k.box(0.36, 0.06, 0.04, 0, by + 0.4, -1.27, INK)
    k.pair((s) => {
      k.fine(() => {
        for (let i = 0; i < 3; i += 1) sweep(k, [[s * 0.45, 0.62, -1.3 + i * 0.25], [s * 0.62, 0.56, -1.3 + i * 0.25], [s * 0.74, 0.42, -1.24 + i * 0.25]], 0.042, CHROME, { segs: 6 })
      })
    })
    for (const z of [wheels.zf, wheels.zr]) {
      k.shell({ z: [z - 0.7, z + 0.7], top: [z - 0.7, 0.4, z - 0.4, 0.62, z + 0.4, 0.62, z + 0.7, 0.42], bottom: [z - 0.7, 0.36, z - 0.4, 0.53, z + 0.4, 0.53, z + 0.7, 0.38], width: 0.27, rt: 0.08, rb: 0.03, color: trim, cx: 0.95, pair: true, M: 1, step: 0.5 })
      k.pair((s) => {
        k.box(0.03, 0.04, 0.9, s * 1.225, 0.55, z, HOVER, { glow: true })
        k.box(0.4, 0.03, 0.04, s * 0.95, 0.36, z - 0.66, HOVER, { glow: true })
        k.box(0.4, 0.03, 0.04, s * 0.95, 0.38, z + 0.66, HOVER, { glow: true })
        k.box(0.3, 0.06, 0.1, s * 0.66, 0.5, z, CHROME)
      })
    }
    for (let i = 0; i < 3; i += 1) k.decal(sh, 'side', -0.75, 0.4 - i * 0.25, 0.22 + i * 0.1, 0.3 + i * 0.1, AMBER, { nu: 4, taper: 0.95, skew: 0.04, off: 0.012 })
    k.lathe([[0.26, -0.3], [0.3, -0.1], [0.3, 0.25], [0.24, 0.3], [0.18, 0.2]], 0, 0.62, 2.2, [DARK, DARK, trim, INK], { axis: 'z', segs: 12 })
    k.cyl(0.18, 0.02, 0, 0.62, 2.44, HOVER, { axis: 'z', segs: 12, glow: true })
    k.box(0.58, 0.54, 0.1, 0, 0.45, -1.88, CHROME, { top: [0.8, 1], bevel: 0.03 })
    k.box(0.46, 0.44, 0.04, 0, 0.45, -1.93, INK, { top: [0.8, 1] })
    k.fine(() => {
      for (let i = -1; i <= 1; i += 1) k.box(0.03, 0.4, 0.03, i * 0.12, 0.45, -1.955, CHROME)
    })
    const head = []
    k.pair((s) => head.push(roundLamp(k, s * 0.55, 0.58, -1.78, 0.11, HEADLIGHT, { housing: CHROME, depth: 0.16 })))
    tube(k, [-0.6, 0.12, -2.0], [0.6, 0.12, -2.0], 0.035, CHROME)
    const tail = [roundLamp(k, -0.36, 0.4, 1.96, 0.055, TAILLIGHT, { dir: 1, housing: CHROME, depth: 0.06 }), roundLamp(k, 0.36, 0.4, 1.96, 0.055, TAILLIGHT, { dir: 1, housing: CHROME, depth: 0.06 })]
    return { wheels, size: [2.45, 1.3, 4.5], exhausts: [[0, 0.62, 2.5]], head, tail }
  },

  /** A stretched gold limousine: long notchback body, black roof, chrome strips and bumpers, pennants and a crown. */
  limo(k, { body, trim, glass }) {
    const wheels = { radius: 0.46, width: 0.4, x: 0.92, zf: -1.75, zr: 1.7 }
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-2.76, 2.76],
      top: [-2.76, 0.32, -2.66, 0.55, -2.4, 0.66, -1.75, 0.72, -1.15, 0.74, 1.6, 0.76, 2.4, 0.74, 2.66, 0.66, 2.76, 0.5],
      bottom: [-2.76, 0.0, -2.6, -0.2, -2.3, -0.28, 2.3, -0.28, 2.6, -0.2, 2.76, 0.0],
      width: [-2.76, 0.8, -2.62, 0.98, -1.75, 1.04, 1.7, 1.04, 2.62, 0.98, 2.76, 0.84],
      rt: 0.14,
      rb: 0.1,
      tumble: 0.95,
      crown: 0.03,
      grooves: [-1.05, -0.15, 0.75],
      step: 0.38,
      cabin: {
        z: [-1.16, 1.78],
        top: [-1.16, 0.72, -0.62, 1.22, -0.42, 1.3, 1.3, 1.32, 1.5, 1.24, 1.78, 0.76],
        bottom: 0.68,
        width: [-1.16, 0.92, 1.78, 0.9],
        tumble: 0.82,
        rt: 0.12,
        rb: 0.02,
        roof: [-0.42, 1.46],
        roofColor: trim,
        pillars: [-0.15, 0.75],
        belt: 0.74,
      },
    })
    k.decal(sh, 'side', -2.5, 2.5, 0.42, 0.45, CHROME, { nu: 8 })
    handles(k, sh, [-0.75, 0.2, 1.1], 0.6)
    const ry = gh.topAt(0.45, 0) - 0.01
    k.lathe([[0.4, 0], [0.4, 0.2], [0.36, 0.2], [0.36, 0.04]], 0, ry, 0.45, GOLD, { segs: 10 })
    k.lathe([[0.36, 0.04], [0.34, 0.2], [0.2, 0.28], [0, 0.3]], 0, ry, 0.45, VELVET, { segs: 10 })
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2
      const cx = Math.cos(a) * 0.38
      const cz = 0.45 + Math.sin(a) * 0.38
      k.box(0.14, 0.2, 0.05, cx, ry + 0.28, cz, GOLD, { top: [0.15, 1], r: [0, Math.PI / 2 - a, 0] })
      k.gem(0.04, cx, ry + 0.4, cz, '#ff3b4e')
    }
    k.gem(0.08, 0, ry + 0.36, 0.45, GOLD, [1, 1, 1], { detail: 1 })
    k.pair((s) => {
      tube(k, [s * 0.82, 0.68, -2.3], [s * 0.82, 1.05, -2.3], 0.015, CHROME)
      k.box(0.02, 0.15, 0.24, s * 0.82, 0.98, -2.2, VELVET, { top: [1, 0.5] })
    })
    k.gem(0.06, 0, sh.topAt(-2.45, 0) + 0.06, -2.45, GOLD, [1, 1.4, 1.6])
    noseGrille(k, sh, 1.1, 0.2, 0.5, { frame: CHROME, bars: 4 })
    bar(k, -1.04, 1.04, -2.74, 0.04, 0.16, 0.14, CHROME)
    bar(k, -1.04, 1.04, 2.74, 0.04, 0.16, 0.14, CHROME)
    const head = lampPair(k, sh, 'front', 0.6, 0.9, 0.36, 0.5, { inset: 0.15 })
    const tail = lampPair(k, sh, 'rear', 0.62, 0.92, 0.4, 0.54, { inset: 0.1 })
    plateOn(k, sh, 'rear', 0.22)
    sideMirrors(k, sh.xAt(-1.0, 0.72) - 0.06, 0.82, -1.0, body)
    const exhausts = tailpipes(k, [[-0.55, -0.22, 2.76], [0.55, -0.22, 2.76]], { r: 0.05 })
    return { wheels, size: [2.15, 1.9, 5.6], exhausts, head, tail }
  },

  /** A dragon: a scaled body, horned head with burning eyes, folded wings, a spined back and a curling tail. */
  dragon(k, { body, trim }) {
    const wheels = { radius: 0.5, width: 0.46, x: 0.98, zf: -1.25, zr: 1.3 }
    const deep = shade(body, 0.66)
    const scale = shade(body, 0.86)
    const { sh } = roadBody(k, { body }, {
      wheels,
      z: [-1.62, 1.78],
      top: [-1.62, 0.84, -1.25, 0.8, -0.5, 0.78, 0.4, 0.8, 1.3, 0.8, 1.78, 0.6],
      bottom: [-1.62, 0.22, -1.35, 0.0, 1.5, 0.0, 1.78, 0.22],
      width: [-1.62, 0.55, -1.25, 0.98, -0.5, 0.86, 0.5, 0.9, 1.3, 1.02, 1.78, 0.6],
      rt: 0.36,
      rb: 0.12,
      tumble: 0.78,
      belly: 0.86,
      crown: 0.06,
      paint: paints(lower(0.12, trim), (q) => (q.kind !== 'bottom' && (q.i + q.j) % 2 ? scale : null)),
    })
    const hd = k.shell({ z: [-2.62, -1.3], top: [-2.62, 0.74, -2.45, 0.92, -2.0, 1.08, -1.6, 0.98, -1.3, 0.92], bottom: [-2.62, 0.52, -2.4, 0.46, -2.0, 0.55, -1.6, 0.42, -1.3, 0.3], width: [-2.62, 0.24, -2.45, 0.34, -2.1, 0.47, -1.75, 0.4, -1.3, 0.62], rt: 0.2, rb: 0.1, tumble: 0.82, color: body })
    k.box(0.6, 0.1, 0.45, 0, 0.47, -2.36, deep, { bevel: 0.03 })
    k.fine(() =>
      k.pair((s) => {
        for (const z of [-2.52, -2.4, -2.28]) k.box(0.04, 0.08, 0.04, s * 0.26, 0.55, z, WHITE, { top: [0.2, 0.2] })
      }),
    )
    const head = []
    k.pair((s) => {
      k.box(0.22, 0.07, 0.3, s * 0.3, 1.08, -2.0, deep, { r: [0, 0, s * -0.3] })
      k.gem(0.1, s * 0.34, 0.95, -2.2, HEADLIGHT, [1, 0.8, 1], { glow: true, detail: 1 })
      head.push([s * 0.34, 0.95, -2.3])
      k.gem(0.04, s * 0.14, 0.76, -2.6, FLAME, [1, 1, 1], { glow: true })
      k.lathe([[0.07, 0], [0.05, 0.25], [0, 0.5]], s * 0.28, 1.04, -1.8, trim, { segs: 6, r: [0.95, 0, s * -0.25] })
      k.extrude([[0, 0], [0.35, 0.05], [0.1, 0.3]], -0.02, 0.02, trim, { at: [s * 0.45, 0.92, -1.75], r: [0, 0, s * -0.5], smooth: false })
      // Folded wings: a membrane leaning out from the shoulders, a bone with a claw.
      k.extrude([[-0.6, 0], [0.9, 0], [0.4, 0.75], [-0.2, 0.62]], -0.02, 0.02, deep, { at: [s * 0.78, 0.78, 0.2], r: [0, 0, s * -0.55], smooth: false })
      tube(k, [s * 0.75, 0.82, -0.4], [s * 1.05, 1.35, 0.25], 0.04, trim)
      k.gem(0.07, s * 1.05, 1.38, 0.28, trim)
      k.fine(() => {
        for (const dx of [-0.12, 0, 0.12]) k.box(0.05, 0.05, 0.18, s * (0.95 + dx), 0.12, -1.72, trim, { top: [0.4, 0.4] })
      })
    })
    const spikes = [[-1.95, 0.24], [-1.5, 0.3], [-1.0, 0.32], [-0.5, 0.34], [0.0, 0.32], [0.5, 0.3], [1.0, 0.26], [1.45, 0.2]]
    for (const [z, h] of spikes) {
      const y = z < -1.3 ? hd.topAt(z, 0) : sh.topAt(z, 0)
      k.extrude([[-0.16, 0], [0.16, 0], [0.06, h]], -0.03, 0.03, trim, { at: [0, y - 0.03, z], smooth: false })
    }
    sweep(k, [[0, 0.5, 1.6], [0, 0.55, 2.0], [0, 0.7, 2.35], [0, 0.92, 2.6], [0, 1.08, 2.7]], [0.32, 0.24, 0.16, 0.09, 0.04], body, { segs: 8 })
    k.gem(0.2, 0, 1.12, 2.74, trim, [1.2, 0.25, 1])
    const tail = lampPair(k, sh, 'rear', 0.36, 0.56, 0.36, 0.46, { inset: 0.2 })
    const exhausts = tailpipes(k, [[-0.4, 0.3, 1.76], [0.4, 0.3, 1.76]], { color: deep, r: 0.08 })
    return { wheels, size: [2.3, 1.5, 5.5], exhausts, head, tail }
  },

  /** A kraken: a great spotted mantle, glowing eyes, a tentacle curled over every wheel, a curled bumper and two trailing. */
  kraken(k, { body, trim }) {
    const wheels = { radius: 0.5, width: 0.46, x: 1.0, zf: -1.2, zr: 1.25 }
    const deep = shade(body, 0.68)
    const glowSpot = '#5ff6ff'
    const { sh } = roadBody(k, { body }, {
      wheels,
      gap: 0.06,
      color: deep,
      z: [-1.86, 1.92],
      top: [-1.86, 0.26, -1.5, 0.62, 1.5, 0.62, 1.92, 0.32],
      bottom: [-1.86, 0.06, -1.55, -0.1, 1.55, -0.1, 1.92, 0.06],
      width: [-1.86, 0.5, -1.4, 0.86, 1.4, 0.9, 1.92, 0.6],
      rt: 0.18,
      rb: 0.1,
      tumble: 0.9,
    })
    const m = k.shell({ z: [-1.0, 1.86], top: [-1.0, 0.75, -0.6, 1.35, 0.2, 1.72, 1.0, 1.66, 1.6, 1.3, 1.86, 0.9], bottom: 0.5, width: [-1.0, 0.55, -0.5, 0.86, 0.4, 0.96, 1.2, 0.86, 1.86, 0.4], rt: 0.9, rb: 0.02, tumble: 0.62, crown: 0.08, color: body })
    for (const [x, z, r] of [[-0.45, 0.1, 0.12], [0.5, 0.5, 0.1], [0.05, 1.0, 0.11], [-0.55, 1.1, 0.09]]) k.gem(r, x, m.topAt(z, x) + 0.01, z, trim, [1, 0.45, 1], { detail: 1 })
    for (const [x, z] of [[0.3, -0.3], [-0.7, 0.6], [-0.2, 1.4]]) k.gem(0.06, x, m.topAt(z, x) + 0.01, z, glowSpot, [1, 0.6, 1], { glow: true })
    const head = []
    k.pair((s) => {
      k.gem(0.2, s * 0.42, 0.88, -0.86, HEADLIGHT, [1, 1, 0.7], { glow: true, detail: 1 })
      k.gem(0.09, s * 0.42, 0.88, -1.0, INK, [0.6, 1.4, 0.6], { detail: 1 })
      head.push([s * 0.42, 0.88, -1.04])
      k.box(0.36, 0.08, 0.2, s * 0.42, 1.12, -0.82, deep, { r: [0, 0, s * 0.25], bevel: 0.03 })
    })
    sweep(k, [[-1.0, 0.45, -1.4], [-0.95, 0.24, -1.6], [-0.5, 0.2, -1.84], [0, 0.2, -1.9], [0.5, 0.2, -1.84], [0.95, 0.24, -1.6], [1.0, 0.45, -1.4]], [0.06, 0.12, 0.14, 0.14, 0.14, 0.12, 0.06], body, { segs: 7 })
    k.fine(() => {
      for (const x of [-0.5, -0.17, 0.17, 0.5]) k.gem(0.055, x, 0.2, -2.02, trim, [1, 1, 0.5])
    })
    for (const zw of [wheels.zf, wheels.zr]) {
      k.pair((s) => {
        const pts = []
        const rad = []
        for (let i = 0; i <= 6; i += 1) {
          const a = 2.7 - i * 0.4
          pts.push([s * 1.0, 0.1 + Math.sin(a) * 0.72, zw + Math.cos(a) * 0.72])
          rad.push(0.15 - i * 0.013)
        }
        sweep(k, pts, rad, body, { segs: 6 })
        k.fine(() => {
          for (const i of [1, 3, 5]) k.gem(rad[i] * 0.45, s * (1.0 + rad[i] * 0.9), pts[i][1], pts[i][2], trim, [0.45, 1, 1])
        })
      })
    }
    k.pair((s) => sweep(k, [[s * 0.45, 0.4, 1.8], [s * 0.5, 0.35, 2.15], [s * 0.55, 0.55, 2.45], [s * 0.5, 0.82, 2.55], [s * 0.42, 0.95, 2.42]], [0.14, 0.12, 0.09, 0.07, 0.05], body, { segs: 7 }))
    const tail = lampPair(k, sh, 'rear', 0.55, 0.78, 0.2, 0.32, { inset: 0.2 })
    const exhausts = tailpipes(k, [[0, 0.42, 1.95]], { color: deep, r: 0.1 })
    return { wheels, size: [2.4, 1.8, 4.6], exhausts, head, tail }
  },
}
