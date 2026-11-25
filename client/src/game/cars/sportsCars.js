import { lower, opening } from './carBuilders'
import {
  archBand,
  bar,
  BLACK,
  CHROME,
  handles,
  INK,
  lampPair,
  noseGrille,
  paints,
  plateOn,
  rearWing,
  roadBody,
  roundel,
  roundLamp,
  shade,
  sideMirrors,
  sweep,
  tailpipes,
  TAILLIGHT,
  torus,
  WHITE,
} from './carKit'

/**
 * The sports-car wave: eight original designs with real sports-car proportions (no real
 * manufacturer's look, badges or names). Same contract as carBuilders.js; `electric`
 * cars have no exhausts.
 */

/** Diffuser: a dark panel low on the tail with vertical fins. */
export function diffuser(k, sh, w, y0, y1, fins = 4) {
  k.decal(sh, 'rear', -w / 2, w / 2, y0, y1, INK, { nu: 4 })
  k.fine(() => {
    for (let i = 0; i < fins; i += 1) {
      const x = -w / 2 + ((i + 0.5) * w) / fins
      const fy0 = y0 + (y1 - y0) * 0.35
      k.box(0.025, y1 - fy0, 0.26, x, (fy0 + y1) / 2, (sh.rearZ(x, y1 - 0.02) ?? 2) - 0.1, BLACK)
    }
  })
}

/** A splitter lip under the nose, `w` wide at height y. */
export function splitter(k, sh, w, y, color = BLACK) {
  const z = sh.frontZ(0, y + 0.05) ?? -2
  k.extrude([[-0.12, 0], [0.16, 0], [0.16, 0.035], [-0.1, 0.03]], -w / 2, w / 2, color, { at: [0, y, z + 0.06] })
}

/** Side vent / intake: a dark slanted patch on both sides. */
export function sideVent(k, sh, z0, z1, y0, y1, { skew = 0, taper = 0, color = INK } = {}) {
  k.decal(sh, 'side', z0, z1, y0, y1, color, { nu: 3, skew, taper, off: 0.012 })
}

export const SPORTS_BUILDERS = {
  /** Squall: a rally-bred hot hatch - wide black flares, honeycomb grille, a contrast roof and a big roof wing. */
  squall(k, { body, trim, glass }) {
    const wheels = { radius: 0.43, width: 0.42, x: 0.9, zf: -1.25, zr: 1.25 }
    const ar = 0.5
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-2.0, 1.96],
      top: [-2.0, 0.08, -1.92, 0.27, -1.7, 0.44, -1.25, 0.58, -0.8, 0.58, -0.56, 0.6, 0.6, 0.64, 1.25, 0.68, 1.78, 0.64, 1.96, 0.54],
      bottom: [-2.0, -0.08, -1.86, -0.26, -1.6, -0.3, 1.6, -0.3, 1.86, -0.22, 1.96, -0.08],
      width: [-2.0, 0.66, -1.9, 0.88, -1.6, 0.97, -1.25, 1.03, -0.75, 0.96, 0.6, 0.96, 1.25, 1.04, 1.7, 0.98, 1.96, 0.86],
      rt: 0.15,
      rb: 0.1,
      tumble: 0.93,
      belly: 0.9,
      crown: [-1.6, 0.0, -1.0, -0.02, 1.0, 0.0],
      grooves: [-0.6, 0.45],
      paint: paints(archBand(wheels, ar, BLACK, { w: 0.07 }), lower(-0.16, BLACK)),
      cabin: {
        z: [-0.62, 1.86],
        top: [-0.62, 0.6, -0.12, 0.97, 0.18, 1.17, 0.5, 1.21, 1.25, 1.2, 1.5, 1.11, 1.86, 0.7],
        bottom: 0.56,
        width: [-0.62, 0.84, 0.3, 0.84, 1.4, 0.82, 1.86, 0.76],
        tumble: 0.76,
        rt: 0.18,
        rb: 0.02,
        roof: [0.18, 1.48],
        roofColor: BLACK,
        pillars: [0.45],
        belt: 0.6,
      },
    })
    k.decal(sh, 'top', 0.26, 0.38, -1.4, -0.95, INK, { mirror: true, nu: 1, nv: 2 })
    sideVent(k, sh, -0.3, 1.35, 0.04, 0.16, { skew: 0.22, taper: 0.7, color: trim })
    handles(k, sh, [-0.2, 0.75], 0.48, BLACK)
    const head = lampPair(k, sh, 'front', 0.46, 0.84, 0.25, 0.36, { skew: 0.03, taper: 0.3, inset: 0.3, drl: [0.5, 0.82, 0.215, 0.232, 0.03] })
    noseGrille(k, sh, 0.86, 0.06, 0.22, { frame: BLACK })
    noseGrille(k, sh, 1.42, -0.27, -0.06)
    k.pair((s) => k.cyl(0.05, 0.02, s * 0.62, -0.17, (sh.frontZ(s * 0.62, -0.17) ?? -1.9) - 0.012, WHITE, { axis: 'z', segs: 10, glow: true }))
    splitter(k, sh, 1.7, -0.3)
    rearWing(k, { span: 1.76, chord: 0.4, y: gh.topAt(1.45, 0) + 0.2, z: 1.62, deckY: gh.topAt(1.55, 0.4), color: BLACK, angle: 0.16, standX: 0.4 })
    const tail = lampPair(k, sh, 'rear', 0.52, 0.9, 0.42, 0.56, { taper: 0.3 })
    plateOn(k, sh, 'rear', 0.16)
    diffuser(k, sh, 1.2, -0.28, -0.1, 4)
    sideMirrors(k, sh.xAt(-0.5, 0.6) - 0.06, 0.7, -0.5, body)
    k.box(0.1, 0.06, 0.1, -0.55, -0.24, -2.0, '#e2263d')
    const exhausts = tailpipes(k, [[-0.11, -0.2, 1.97], [0.11, -0.2, 1.97]], { r: 0.055 })
    return { wheels, size: [2.05, 1.5, 4.0], exhausts, head, tail }
  },

  /** Thunderhead: a classic muscle car - long bonnet with a scoop, quad round lamps in a full-width grille, fastback and stripes. */
  thunderhead(k, { body, trim, glass }) {
    const wheels = { radius: 0.46, width: 0.46, x: 0.92, zf: -1.45, zr: 1.4 }
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-2.36, 2.3],
      top: [-2.36, 0.32, -2.3, 0.48, -2.15, 0.56, -1.45, 0.61, -0.55, 0.63, 0.3, 0.61, 1.4, 0.66, 2.05, 0.64, 2.3, 0.52],
      bottom: [-2.36, 0.04, -2.25, -0.2, -2.0, -0.28, 2.0, -0.28, 2.3, -0.06],
      width: [-2.36, 0.86, -2.25, 0.96, -1.45, 1.0, -0.4, 0.96, 0.6, 0.97, 1.4, 1.04, 2.1, 0.98, 2.3, 0.92],
      rt: 0.1,
      rb: 0.1,
      tumble: 0.96,
      belly: 0.92,
      crown: [-2.0, 0.02, -1.0, 0.03, 0.5, 0.0],
      grooves: [-0.5, 0.65],
      cabin: {
        z: [-0.56, 2.0],
        top: [-0.56, 0.61, -0.05, 0.98, 0.25, 1.12, 0.6, 1.14, 0.95, 1.08, 1.6, 0.8, 2.0, 0.66],
        bottom: 0.57,
        width: [-0.56, 0.84, 0.5, 0.84, 1.5, 0.8, 2.0, 0.74],
        tumble: 0.74,
        rt: 0.14,
        rb: 0.02,
        roof: [0.25, 0.95],
        roofColor: trim,
        belt: 0.62,
        sideEnd: 1.15,
        sail: body,
      },
    })
    // Racing stripes over bonnet, roof and deck.
    k.decal(sh, 'top', 0.1, 0.3, -2.2, -0.6, trim, { mirror: true, nu: 1, nv: 5 })
    k.decal(sh, 'top', 0.1, 0.3, 1.9, 2.25, trim, { mirror: true, nu: 1, nv: 2 })
    const sy = sh.topAt(-1.2, 0)
    k.box(0.5, 0.11, 0.7, 0, sy + 0.05, -1.2, body, { top: [0.85, 0.55], bevel: 0.03 })
    k.box(0.4, 0.06, 0.02, 0, sy + 0.06, -1.56, INK)
    noseGrille(k, sh, 1.62, 0.16, 0.42, { frame: CHROME, bars: 1, bar: shade(CHROME, 0.7) })
    const head = []
    for (const x of [0.7, 0.48]) {
      k.pair((s) => {
        const z = sh.frontZ(s * x, 0.3) ?? -2.3
        const c = roundLamp(k, s * x, 0.3, z - 0.02, 0.075, '#fff6c8', { housing: CHROME, depth: 0.05, cup: true })
        if (x === 0.7) head.push(c)
      })
    }
    bar(k, -1.0, 1.0, -2.34, 0.06, 0.12, 0.1, CHROME)
    bar(k, -0.98, 0.98, 2.3, 0.06, 0.12, 0.1, CHROME)
    k.extrude([[-0.2, 0], [0.12, 0.0], [0.14, 0.06], [-0.18, 0.02]], -0.9, 0.9, body, { at: [0, sh.topAt(2.15, 0) - 0.01, 2.15] })
    sideVent(k, sh, 0.62, 0.86, 0.22, 0.42, { skew: 0.04 })
    k.decal(sh, 'rear', -0.88, 0.88, 0.32, 0.5, CHROME, { nu: 4, off: 0.008 })
    const tail = lampPair(k, sh, 'rear', 0.22, 0.84, 0.35, 0.47, { inset: 0.05, bezel: BLACK })
    plateOn(k, sh, 'rear', 0.16)
    sideMirrors(k, sh.xAt(-0.45, 0.62) - 0.06, 0.72, -0.45, CHROME, { size: 0.9 })
    handles(k, sh, [0.45], 0.5)
    const exhausts = tailpipes(k, [[-0.6, -0.24, 2.3], [0.6, -0.24, 2.3]], { r: 0.06 })
    return { wheels, size: [2.1, 1.35, 4.7], exhausts, head, tail }
  },

  /** Tidecutter: a four-door sports saloon - slim lamps, a wide low grille, chrome window line, lip spoiler and quad pipes. */
  tidecutter(k, { body, glass }) {
    const wheels = { radius: 0.45, width: 0.42, x: 0.9, zf: -1.45, zr: 1.45 }
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-2.42, 2.38],
      top: [-2.42, 0.14, -2.34, 0.34, -2.1, 0.5, -1.45, 0.62, -0.75, 0.66, 0.4, 0.68, 1.45, 0.72, 2.1, 0.72, 2.3, 0.66, 2.38, 0.56],
      bottom: [-2.42, -0.06, -2.28, -0.24, -2.0, -0.3, 2.0, -0.3, 2.28, -0.24, 2.38, -0.08],
      width: [-2.42, 0.7, -2.32, 0.9, -2.0, 0.97, -1.45, 1.0, 0, 0.98, 1.45, 1.01, 2.1, 0.97, 2.38, 0.86],
      rt: 0.16,
      rb: 0.1,
      tumble: 0.94,
      belly: 0.9,
      crown: 0.02,
      grooves: [-0.75, 0.35, 1.25],
      paint: lower(-0.18, shade(body, 0.6)),
      cabin: {
        z: [-0.8, 1.9],
        top: [-0.8, 0.66, -0.25, 1.02, 0.1, 1.2, 0.5, 1.24, 1.0, 1.2, 1.42, 1.0, 1.9, 0.74],
        bottom: 0.62,
        width: [-0.8, 0.84, 0.4, 0.86, 1.9, 0.78],
        tumble: 0.74,
        rt: 0.16,
        rb: 0.02,
        roof: [0.1, 1.05],
        pillars: [0.35],
        belt: 0.68,
        sideEnd: 1.42,
        sail: body,
      },
    })
    k.decal(sh, 'side', -0.75, 1.85, 0.67, 0.695, CHROME, { nu: 6 })
    handles(k, sh, [-0.35, 0.75], 0.52, CHROME)
    const head = lampPair(k, sh, 'front', 0.52, 0.9, 0.3, 0.38, { skew: 0.02, taper: 0.35, inset: 0.3, drl: [0.55, 0.88, 0.27, 0.285, 0.02] })
    noseGrille(k, sh, 1.0, 0.1, 0.28, { frame: CHROME, bars: 2, bar: shade(CHROME, 0.6), inset: 0.2 })
    noseGrille(k, sh, 0.7, -0.24, -0.1)
    k.decal(sh, 'front', 0.58, 0.86, -0.2, -0.04, INK, { nu: 2, inset: 0.3, mirror: true })
    k.extrude([[-0.08, 0], [0.12, 0.0], [0.13, 0.03], [-0.08, 0.015]], -0.8, 0.8, body, { at: [0, sh.topAt(2.25, 0) - 0.005, 2.25] })
    const tail = lampPair(k, sh, 'rear', 0.42, 0.92, 0.5, 0.6, { taper: 0.3 })
    k.decal(sh, 'rear', -0.42, 0.42, 0.535, 0.555, TAILLIGHT, { nu: 3, glow: true })
    plateOn(k, sh, 'rear', 0.24)
    diffuser(k, sh, 1.1, -0.28, -0.12, 3)
    sideMirrors(k, sh.xAt(-0.62, 0.66) - 0.06, 0.76, -0.62, body)
    const exhausts = tailpipes(k, [[-0.66, -0.22, 2.38], [-0.5, -0.22, 2.38], [0.5, -0.22, 2.38], [0.66, -0.22, 2.38]], { r: 0.045 })
    return { wheels, size: [2.05, 1.45, 4.8], exhausts, head, tail }
  },

  /** Spindrift: a track-day roadster - open cockpit with roll hoops and headrest humps, oval intake, ducktail wing. */
  spindrift(k, { body, trim, glass }) {
    const wheels = { radius: 0.42, width: 0.42, x: 0.88, zf: -1.2, zr: 1.15 }
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      gap: 0.06,
      z: [-1.96, 1.92],
      top: [-1.96, 0.1, -1.88, 0.27, -1.6, 0.43, -1.2, 0.57, -0.7, 0.51, -0.4, 0.53, 0.6, 0.53, 1.15, 0.61, 1.7, 0.59, 1.92, 0.49],
      bottom: [-1.96, -0.08, -1.8, -0.24, 1.7, -0.24, 1.92, -0.08],
      width: [-1.96, 0.62, -1.84, 0.84, -1.5, 0.95, -1.2, 1.0, -0.6, 0.9, 0.4, 0.92, 1.15, 1.0, 1.7, 0.94, 1.92, 0.8],
      rt: 0.2,
      rb: 0.1,
      tumble: 0.9,
      crown: [-1.6, -0.02, -1.2, -0.06, -0.8, -0.03, 0.8, -0.02, 1.15, -0.06],
      paint: paints(opening(-0.36, 0.66, 0.66), lower(-0.14, BLACK)),
    })
    // Headrest humps, roll hoops, seats, wheel, a low screen.
    k.shell({ z: [0.6, 1.55], top: [0.6, 0.55, 0.76, 0.86, 1.0, 0.83, 1.55, 0.58], bottom: 0.45, width: [0.6, 0.17, 0.76, 0.2, 1.55, 0.06], rt: 0.15, rb: 0.02, color: body, cx: 0.34, pair: true, M: 2 })
    k.pair((s) => sweep(k, [[s * 0.5, 0.5, 0.66], [s * 0.5, 0.86, 0.66], [s * 0.4, 0.96, 0.68], [s * 0.2, 0.96, 0.68], [s * 0.18, 0.5, 0.66]], 0.025, CHROME, { caps: false }))
    const red = '#b8262b'
    k.pair((s) => {
      k.box(0.44, 0.5, 0.14, s * 0.32, 0.66, 0.54, red, { bevel: 0.05, r: [-0.2, 0, 0] })
      k.box(0.42, 0.1, 0.4, s * 0.32, 0.42, 0.3, red, { bevel: 0.03 })
    })
    torus(k, 0.14, 0.018, -0.32, 0.66, -0.12, BLACK, { axis: 'z', rot: [-1.1, 0, 0] })
    k.box(1.2, 0.26, 0.03, 0, 0.66, -0.42, glass, { r: [-0.6, 0, 0], top: [0.9, 1] })
    sweep(k, [[-0.62, 0.53, -0.36], [-0.58, 0.77, -0.5], [0.58, 0.77, -0.5], [0.62, 0.53, -0.36]], 0.018, BLACK, { caps: false })
    noseGrille(k, sh, 0.9, -0.2, 0.06, { inset: 0.55 })
    const head = lampPair(k, sh, 'front', 0.5, 0.8, 0.22, 0.34, { inset: 0.55, skew: 0.02 })
    splitter(k, sh, 1.6, -0.26)
    sideVent(k, sh, -0.62, -0.4, 0.06, 0.32, { skew: 0.1, taper: 0.5 })
    roundel(k, sh, 0.12, 0.18, 0.18, WHITE)
    rearWing(k, { span: 1.5, chord: 0.3, y: 0.84, z: 1.72, deckY: sh.topAt(1.7, 0.4), color: trim, angle: 0.18, standX: 0.38 })
    const tail = lampPair(k, sh, 'rear', 0.48, 0.78, 0.34, 0.46, { inset: 0.55 })
    plateOn(k, sh, 'rear', 0.12, 0.38, 0.1)
    diffuser(k, sh, 1.0, -0.24, -0.08, 3)
    sideMirrors(k, sh.xAt(-0.4, 0.5) - 0.06, 0.6, -0.42, body, { size: 0.85 })
    const exhausts = tailpipes(k, [[-0.1, -0.16, 1.93], [0.1, -0.16, 1.93]], { r: 0.05 })
    return { wheels, size: [2.0, 1.2, 3.9], exhausts, head, tail }
  },

  /** Meridian GT: a front-engined grand tourer - very long bonnet, cabin set back, fastback, side vents and quad pipes. */
  meridian(k, { body, trim, glass }) {
    const wheels = { radius: 0.46, width: 0.46, x: 0.94, zf: -1.5, zr: 1.45 }
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      gap: 0.06,
      z: [-2.42, 2.36],
      top: [-2.42, 0.14, -2.34, 0.3, -2.1, 0.45, -1.5, 0.6, -0.9, 0.57, -0.4, 0.59, 0.5, 0.62, 1.45, 0.67, 2.05, 0.63, 2.36, 0.54],
      bottom: [-2.42, -0.06, -2.3, -0.26, -2.0, -0.3, 2.0, -0.3, 2.36, -0.1],
      width: [-2.42, 0.7, -2.32, 0.9, -2.0, 0.98, -1.5, 1.04, -0.6, 0.97, 0.6, 0.98, 1.45, 1.07, 2.05, 1.0, 2.36, 0.86],
      rt: 0.16,
      rb: 0.1,
      tumble: 0.92,
      belly: 0.9,
      crown: [-2.0, 0.0, -1.5, -0.04, -0.9, 0.02, 0.2, 0.0, 1.45, -0.06, 2.0, -0.02],
      grooves: [-0.36, 0.76],
      cabin: {
        z: [-0.42, 2.1],
        top: [-0.42, 0.59, 0.05, 0.93, 0.35, 1.06, 0.75, 1.08, 1.1, 1.0, 1.7, 0.77, 2.1, 0.65],
        bottom: 0.55,
        width: [-0.42, 0.8, 0.6, 0.82, 1.6, 0.78, 2.1, 0.7],
        tumble: 0.72,
        rt: 0.16,
        rb: 0.02,
        roof: [0.35, 1.05],
        belt: 0.59,
        sideEnd: 1.25,
        sail: body,
      },
    })
    k.decal(sh, 'side', -0.36, 1.25, 0.585, 0.605, CHROME, { nu: 5 })
    k.decal(gh, 'side', -0.3, 1.25, 1.0, 1.02, CHROME, { nu: 4 })
    sideVent(k, sh, -0.92, -0.6, 0.18, 0.38, { skew: 0.05, taper: 0.4 })
    k.decal(sh, 'side', -0.9, -0.62, 0.27, 0.29, CHROME, { nu: 2, skew: 0.05, off: 0.016 })
    handles(k, sh, [0.4], 0.5)
    const head = lampPair(k, sh, 'front', 0.5, 0.88, 0.28, 0.38, { skew: 0.05, taper: 0.4, inset: 0.35, drl: [0.55, 0.85, 0.255, 0.27, 0.05] })
    noseGrille(k, sh, 0.98, 0.0, 0.24, { frame: trim, bars: 3, bar: shade(trim, 0.8), inset: 0.45 })
    splitter(k, sh, 1.6, -0.28)
    k.extrude([[-0.12, 0], [0.12, 0.0], [0.13, 0.045], [-0.1, 0.02]], -0.84, 0.84, body, { at: [0, sh.topAt(2.2, 0) - 0.01, 2.2] })
    const tail = lampPair(k, sh, 'rear', 0.5, 0.92, 0.44, 0.54, { taper: 0.35, inset: 0.3 })
    plateOn(k, sh, 'rear', 0.2)
    diffuser(k, sh, 1.1, -0.28, -0.12, 4)
    sideMirrors(k, sh.xAt(-0.3, 0.6) - 0.06, 0.7, -0.3, body)
    const exhausts = tailpipes(k, [[-0.72, -0.2, 2.36], [-0.56, -0.2, 2.36], [0.56, -0.2, 2.36], [0.72, -0.2, 2.36]], { r: 0.048 })
    return { wheels, size: [2.15, 1.3, 4.8], exhausts, head, tail }
  },

  /** Razorline: a mid-engined supercar - low wedge, cab-forward canopy, big side intakes, louvred engine cover and a wing. */
  razorline(k, { body, trim, glass }) {
    const wheels = { radius: 0.46, width: 0.5, x: 0.96, zf: -1.4, zr: 1.4 }
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      gap: 0.06,
      z: [-2.3, 2.3],
      top: [-2.3, 0.0, -2.2, 0.17, -1.8, 0.34, -1.4, 0.57, -1.0, 0.43, -0.75, 0.44, 0.3, 0.6, 1.4, 0.64, 2.0, 0.58, 2.3, 0.48],
      bottom: [-2.3, -0.14, -2.1, -0.28, 2.1, -0.28, 2.3, -0.14],
      width: [-2.3, 0.72, -2.15, 0.92, -1.4, 1.06, -0.7, 0.98, 0.4, 0.95, 1.4, 1.1, 2.0, 1.04, 2.3, 0.94],
      rt: 0.14,
      rb: 0.08,
      tumble: 0.88,
      belly: 0.88,
      crown: [-1.8, -0.02, -1.4, -0.09, -1.0, -0.03, 1.0, -0.03, 1.4, -0.08, 2.0, -0.03],
      cabin: {
        z: [-1.02, 1.28],
        top: [-1.02, 0.43, -0.45, 0.83, -0.1, 0.98, 0.35, 1.0, 0.7, 0.93, 1.28, 0.66],
        bottom: 0.39,
        width: [-1.02, 0.82, -0.2, 0.84, 0.6, 0.8, 1.28, 0.6],
        tumble: 0.66,
        rt: 0.2,
        rb: 0.02,
        roof: [-0.1, 0.56],
        roofColor: trim,
        belt: 0.45,
        sideEnd: 0.56,
        sail: trim,
      },
    })
    sideVent(k, sh, 0.32, 1.0, 0.06, 0.44, { skew: -0.12, taper: 0.45 })
    k.fine(() => {
      for (let i = 0; i < 5; i += 1) {
        const z = 1.42 + i * 0.1
        k.decal(sh, 'top', -0.5, 0.5, z, z + 0.04, INK, { nu: 3 })
      }
    })
    k.decal(sh, 'top', 0.18, 0.42, -1.1, -0.85, INK, { mirror: true, nu: 1, nv: 2 })
    const head = lampPair(k, sh, 'front', 0.5, 0.94, 0.19, 0.27, { skew: 0.07, taper: 0.55, inset: 0.4 })
    noseGrille(k, sh, 0.42, -0.22, 0.02, { x: 0.58, mirror: true, inset: 0.2 })
    noseGrille(k, sh, 0.5, -0.24, -0.06)
    splitter(k, sh, 1.8, -0.3)
    rearWing(k, { span: 1.92, chord: 0.4, y: 0.98, z: 1.95, deckY: sh.topAt(1.95, 0.5), color: trim, angle: 0.14, standX: 0.5 })
    k.decal(sh, 'rear', -0.92, 0.92, 0.36, 0.47, INK, { nu: 6, off: 0.006 })
    const tail = lampPair(k, sh, 'rear', 0.56, 0.96, 0.38, 0.45, { taper: 0.4, inset: 0.3 })
    k.decal(sh, 'rear', -0.5, 0.5, 0.1, 0.32, INK, { nu: 3 })
    diffuser(k, sh, 1.3, -0.28, -0.08, 5)
    sideMirrors(k, gh.xAt(-0.75, 0.5) ?? 0.9, 0.62, -0.72, body, { size: 0.85 })
    const exhausts = tailpipes(k, [[-0.09, 0.16, 2.3], [0.09, 0.16, 2.3]], { r: 0.065 })
    return { wheels, size: [2.2, 1.15, 4.6], exhausts, head, tail }
  },

  /** Aetherwing: a hypercar - teardrop canopy, roof scoop, a shark fin and an active wing raised high on stalks, huge diffuser. */
  aetherwing(k, { body, trim, glass }) {
    const wheels = { radius: 0.47, width: 0.52, x: 0.98, zf: -1.45, zr: 1.5 }
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      gap: 0.06,
      z: [-2.44, 2.46],
      top: [-2.44, 0.0, -2.32, 0.15, -1.9, 0.35, -1.45, 0.58, -1.0, 0.43, -0.7, 0.45, 0.4, 0.59, 1.5, 0.65, 2.1, 0.57, 2.46, 0.45],
      bottom: [-2.44, -0.16, -2.2, -0.3, 2.2, -0.3, 2.46, -0.14],
      width: [-2.44, 0.7, -2.3, 0.94, -1.45, 1.08, -0.8, 0.98, 0.4, 0.96, 1.5, 1.12, 2.1, 1.06, 2.46, 0.92],
      rt: 0.14,
      rb: 0.08,
      tumble: 0.86,
      belly: 0.88,
      crown: [-1.9, -0.02, -1.45, -0.1, -1.0, -0.03, 1.0, -0.03, 1.5, -0.09, 2.1, -0.03],
      paint: lower(-0.16, BLACK),
      cabin: {
        z: [-1.06, 1.5],
        top: [-1.06, 0.45, -0.5, 0.85, -0.1, 0.98, 0.35, 0.99, 0.8, 0.88, 1.5, 0.6],
        bottom: 0.41,
        width: [-1.06, 0.76, -0.2, 0.8, 0.7, 0.72, 1.5, 0.4],
        tumble: 0.62,
        rt: 0.26,
        rb: 0.02,
        roof: [-0.1, 0.62],
        belt: 0.47,
        sideEnd: 0.62,
        sail: BLACK,
      },
    })
    const ry = gh.topAt(0.2, 0)
    k.box(0.34, 0.12, 0.5, 0, ry + 0.04, 0.25, body, { top: [0.8, 0.7], bevel: 0.04 })
    k.box(0.24, 0.07, 0.02, 0, ry + 0.06, 0.0, INK)
    const fy0 = gh.topAt(0.75, 0) - 0.03
    const fy1 = sh.topAt(2.3, 0) - 0.02
    k.extrude([[0.75, fy0], [2.3, fy1], [2.3, fy1 + 0.14], [0.9, fy0 + 0.07]], -0.015, 0.015, body, { smooth: false })
    k.decal(sh, 'side', -0.95, 1.6, 0.0, 0.03, trim, { nu: 6 })
    sideVent(k, sh, 0.5, 1.05, 0.08, 0.44, { skew: -0.1, taper: 0.4 })
    k.decal(sh, 'top', 0.16, 0.44, -1.15, -0.88, INK, { mirror: true, nu: 1, nv: 2 })
    const head = lampPair(k, sh, 'front', 0.5, 0.92, 0.2, 0.27, { skew: 0.08, taper: 0.6, inset: 0.4, drl: [0.46, 0.52, 0.06, 0.24, 0] })
    noseGrille(k, sh, 0.46, -0.24, 0.04, { x: 0.58, mirror: true, inset: 0.15 })
    noseGrille(k, sh, 0.5, -0.26, -0.08)
    splitter(k, sh, 1.9, -0.32)
    k.pair((s) => k.extrude([[-0.15, 0], [0.12, 0], [0.12, 0.025], [-0.1, 0.02]], s * 0.78, s * 1.02, BLACK, { at: [0, -0.08, -2.12], r: [0, 0, s * 0.18] }))
    // The active wing, raised on tall stalks.
    rearWing(k, { span: 2.0, chord: 0.46, y: 1.12, z: 2.14, deckY: sh.topAt(2.14, 0.55), color: trim, angle: 0.2, standX: 0.55, plates: BLACK, thick: 0.065 })
    k.decal(sh, 'rear', -0.94, 0.94, 0.36, 0.4, TAILLIGHT, { nu: 6, glow: true })
    const tail = lampPair(k, sh, 'rear', 0.6, 0.96, 0.33, 0.43, { taper: 0.4, inset: 0.3 })
    diffuser(k, sh, 1.5, -0.3, 0.0, 6)
    sideMirrors(k, gh.xAt(-0.8, 0.5) ?? 0.9, 0.6, -0.78, body, { size: 0.8 })
    const exhausts = tailpipes(k, [[-0.17, 0.2, 2.46], [0.17, 0.2, 2.46]], { r: 0.075 })
    return { wheels, size: [2.25, 1.2, 4.9], exhausts, head, tail }
  },

  /** Lumen: an electric hyper-saloon - closed smooth nose, glowing full-width light bars, glass roof, flush handles, no pipes. */
  lumen(k, { body, trim, glass }) {
    const wheels = { radius: 0.46, width: 0.46, x: 0.94, zf: -1.55, zr: 1.5 }
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-2.5, 2.48],
      top: [-2.5, 0.12, -2.42, 0.31, -2.15, 0.47, -1.55, 0.61, -0.85, 0.63, 0.3, 0.67, 1.5, 0.71, 2.15, 0.69, 2.4, 0.61, 2.48, 0.51],
      bottom: [-2.5, -0.08, -2.35, -0.26, -2.1, -0.3, 2.1, -0.3, 2.35, -0.24, 2.48, -0.08],
      width: [-2.5, 0.72, -2.38, 0.92, -2.0, 1.0, -1.55, 1.03, 0, 1.0, 1.5, 1.04, 2.1, 1.0, 2.48, 0.88],
      rt: 0.2,
      rb: 0.1,
      tumble: 0.92,
      belly: 0.88,
      crown: 0.02,
      grooves: [-0.85, 0.3, 1.2],
      paint: lower(-0.17, BLACK),
      cabin: {
        z: [-0.92, 2.2],
        top: [-0.92, 0.63, -0.3, 1.03, 0.1, 1.2, 0.7, 1.24, 1.3, 1.16, 1.8, 0.9, 2.2, 0.71],
        bottom: 0.59,
        width: [-0.92, 0.86, 0.4, 0.88, 1.6, 0.82, 2.2, 0.74],
        tumble: 0.74,
        rt: 0.2,
        rb: 0.02,
        roof: [0.1, 1.3],
        roofColor: glass,
        pillars: [0.32],
        belt: 0.65,
      },
    })
    k.decal(sh, 'front', -0.9, 0.9, 0.37, 0.395, trim, { nu: 8, glow: true })
    const head = lampPair(k, sh, 'front', 0.6, 0.9, 0.3, 0.355, { skew: 0.02, taper: 0.3, inset: 0.3 })
    noseGrille(k, sh, 1.3, -0.22, -0.11, { inset: 0.3 })
    k.decal(sh, 'side', -1.95, 1.9, -0.13, -0.11, trim, { nu: 6, glow: true })
    handles(k, sh, [-0.5, 0.65], 0.53, BLACK)
    k.decal(sh, 'rear', -0.92, 0.92, 0.56, 0.585, trim, { nu: 8, glow: true })
    const tail = lampPair(k, sh, 'rear', 0.62, 0.94, 0.47, 0.55, { taper: 0.25, inset: 0.3 })
    plateOn(k, sh, 'rear', 0.24)
    diffuser(k, sh, 1.2, -0.28, -0.12, 4)
    sideMirrors(k, sh.xAt(-0.75, 0.64) - 0.06, 0.74, -0.75, body, { size: 0.85 })
    return { wheels, size: [2.15, 1.4, 5.0], exhausts: [], electric: true, head, tail }
  },
}
