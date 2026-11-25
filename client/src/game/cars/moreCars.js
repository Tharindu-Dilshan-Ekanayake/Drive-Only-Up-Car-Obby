import { lower, opening } from './carBuilders'
import {
  archBand,
  bar,
  BLACK,
  CHROME,
  DARK,
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
  STEEL,
  sweep,
  tailpipes,
  TAILLIGHT,
  torus,
  tube,
  tyre,
  WHITE,
  HEADLIGHT,
} from './carKit'
import { diffuser, sideVent, splitter } from './sportsCars'

/**
 * The "more cars" wave: six more original road cars - a rugged off-roader, a retro bubble
 * coupe, a sports estate, an open cruiser, a drift coupe and a camper van. Same contract
 * as sportsCars.js (no real manufacturer's look, badges or names).
 */

/** A rounded bumper that wraps the corners: a tube along `pts` ([x, z] pairs) at height y. */
function wrapBumper(k, pts, y, r, color) {
  sweep(k, pts.map(([x, z]) => [x, y, z]), r, color, { segs: 6 })
}

export const MORE_BUILDERS = {
  /** Ridgeback: a boxy off-road SUV - flared arches, bull bar, snorkel, roof rails with a gear box and a tailgate spare. */
  ridgeback(k, { body, trim, glass }) {
    const wheels = { radius: 0.5, width: 0.44, x: 0.9, zf: -1.4, zr: 1.38 }
    const ar = 0.58
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      gap: 0.08,
      z: [-2.12, 2.1],
      top: [-2.12, 0.5, -2.05, 0.7, -1.95, 0.82, -1.0, 0.88, 2.0, 0.9, 2.1, 0.86],
      bottom: [-2.12, -0.05, -2.0, -0.26, -1.8, -0.3, 1.8, -0.3, 2.0, -0.26, 2.1, -0.1],
      width: [-2.12, 0.8, -2.0, 0.96, -1.5, 1.0, 0, 0.98, 1.5, 1.0, 2.1, 0.96],
      rt: 0.12,
      rb: 0.1,
      tumble: 0.97,
      belly: 0.94,
      crown: 0.03,
      grooves: [-0.45, 0.52, 1.5],
      paint: paints(archBand(wheels, ar, BLACK, { w: 0.07 }), lower(-0.1, BLACK)),
      cabin: {
        z: [-0.8, 2.06],
        top: [-0.8, 0.88, -0.4, 1.4, -0.2, 1.5, 1.9, 1.5, 2.06, 1.42],
        bottom: 0.84,
        width: [-0.8, 0.92, -0.4, 0.93, 2.06, 0.92],
        tumble: 0.9,
        rt: 0.12,
        rb: 0.02,
        roof: [-0.2, 2.1],
        pillars: [0.5, 1.2],
        belt: 0.88,
        sideEnd: 1.78,
        sail: body,
        tailColor: body,
      },
    })
    // Bonnet louvres, door handles, tailgate window.
    k.decal(sh, 'top', 0.18, 0.4, -1.55, -1.1, INK, { mirror: true, nu: 1, nv: 2 })
    handles(k, sh, [-0.1, 0.9], 0.74, BLACK)
    k.decal(gh, 'rear', -0.62, 0.62, 1.08, 1.36, glass, { nu: 2, inset: 0.15, off: 0.014 })
    // Nose: round lamps, a grille, a steel bull bar on a black bumper.
    const head = []
    k.pair((s) => {
      const z = sh.frontZ(s * 0.72, 0.6) ?? -2.08
      head.push(roundLamp(k, s * 0.72, 0.6, z - 0.01, 0.13, HEADLIGHT, { housing: BLACK, depth: 0.1 }))
    })
    noseGrille(k, sh, 0.84, 0.38, 0.72, { frame: BLACK, bars: 3, bar: STEEL })
    noseGrille(k, sh, 1.1, 0.08, 0.24)
    bar(k, -0.98, 0.98, -2.15, -0.1, 0.2, 0.24, BLACK)
    sweep(k, [[-0.64, -0.08, -2.2], [-0.66, 0.5, -2.3], [0.66, 0.5, -2.3], [0.64, -0.08, -2.2]], 0.036, STEEL)
    tube(k, [0, 0.5, -2.3], [0, 0.0, -2.2], 0.03, STEEL)
    k.pair((s) => k.cyl(0.07, 0.07, s * 0.36, 0.0, -2.27, HEADLIGHT, { axis: 'z', segs: 8, glow: true }))
    // Snorkel up the right A pillar.
    const sx = sh.xAt(-0.95, 0.7) ?? 0.9
    sweep(k, [[sx + 0.05, 0.55, -0.98], [sx + 0.07, 0.95, -0.9], [sx + 0.0, 1.3, -0.55], [sx - 0.02, 1.5, -0.44]], 0.04, BLACK)
    k.box(0.12, 0.1, 0.14, sx - 0.02, 1.54, -0.44, BLACK, { bevel: 0.03 })
    // Roof rails, cross bars and a gear box.
    const rail = (s) => [0.0, 0.6, 1.2, 1.85].map((z) => [s * 0.66, gh.topAt(z, s * 0.66) + 0.07, z])
    k.pair((s) => {
      sweep(k, rail(s), 0.026, DARK, { segs: 5 })
      k.fine(() => {
        for (const z of [0.0, 0.6, 1.2, 1.85]) k.box(0.05, 0.06, 0.05, s * 0.66, gh.topAt(z, s * 0.66) + 0.03, z, BLACK)
      })
    })
    for (const z of [0.3, 1.5]) tube(k, [-0.66, gh.topAt(z, 0) + 0.09, z], [0.66, gh.topAt(z, 0) + 0.09, z], 0.024, DARK, { segs: 5 })
    k.box(0.86, 0.22, 0.62, 0, gh.topAt(0.9, 0) + 0.22, 0.9, DARK, { bevel: 0.04 })
    k.fine(() => k.box(0.7, 0.04, 0.5, 0, gh.topAt(0.9, 0) + 0.34, 0.9, trim, { bevel: 0.01 }))
    // The spare on the tailgate, tail lamps, bumper and plate.
    k.box(0.16, 0.16, 0.1, 0, 0.62, 2.14, DARK)
    tyre(k, 0.42, 0.28, 0, 0.62, 2.26, trim, { axis: 'z' })
    const tail = lampPair(k, sh, 'rear', 0.72, 0.95, 0.26, 0.8, { inset: 0.05 })
    bar(k, -0.98, 0.98, 2.14, -0.12, 0.2, 0.22, BLACK)
    plateOn(k, sh, 'rear', 0.1, 0.4, 0.1)
    sideMirrors(k, sh.xAt(-0.72, 0.82) - 0.04, 0.99, -0.72, BLACK, { size: 1.1 })
    const exhausts = tailpipes(k, [[0.6, -0.2, 2.1]], { r: 0.05 })
    return { wheels, size: [2.05, 1.9, 4.75], exhausts, head, tail }
  },

  /** Pebble: a retro bubble coupe - round fenders, round lamps, wrap-round chrome bumpers and a cream roof. */
  pebble(k, { body, trim, glass }) {
    const wheels = { radius: 0.38, width: 0.3, x: 0.74, zf: -1.05, zr: 1.0 }
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      gap: 0.06,
      z: [-1.7, 1.68],
      top: [-1.7, 0.22, -1.6, 0.44, -1.35, 0.6, -1.05, 0.68, -0.7, 0.58, -0.35, 0.54, 0.3, 0.55, 0.7, 0.62, 1.0, 0.68, 1.4, 0.56, 1.68, 0.3],
      bottom: [-1.7, -0.1, -1.55, -0.24, -1.3, -0.26, 1.3, -0.26, 1.55, -0.22, 1.68, -0.05],
      width: [-1.7, 0.5, -1.55, 0.74, -1.05, 0.88, -0.5, 0.78, 0.2, 0.76, 0.6, 0.8, 1.0, 0.88, 1.45, 0.76, 1.68, 0.52],
      rt: 0.22,
      rb: 0.12,
      tumble: 0.88,
      belly: 0.9,
      crown: 0.02,
      grooves: [-0.5, 0.42],
      paint: lower(-0.14, shade(body, 0.62)),
      cabin: {
        z: [-0.62, 1.2],
        top: [-0.62, 0.58, -0.2, 0.96, 0.25, 1.1, 0.65, 1.08, 1.0, 0.92, 1.2, 0.72],
        bottom: 0.52,
        width: [-0.62, 0.64, -0.2, 0.7, 0.6, 0.72, 1.0, 0.66, 1.2, 0.52],
        tumble: 0.72,
        rt: 0.3,
        rb: 0.02,
        roof: [-0.15, 1.0],
        roofColor: trim,
        pillars: [0.4],
        belt: 0.56,
      },
    })
    k.decal(sh, 'top', -0.02, 0.02, -1.6, -0.7, CHROME, { nu: 1, nv: 3 })
    k.decal(sh, 'side', -0.9, 0.85, 0.3, 0.325, CHROME, { nu: 5 })
    handles(k, sh, [-0.05], 0.48, CHROME)
    k.fine(() => {
      for (let i = 0; i < 4; i += 1) k.decal(sh, 'top', -0.3, 0.3, 1.25 + i * 0.08, 1.29 + i * 0.08, INK, { nu: 2 })
    })
    // Round lamps on the fenders, wrap-round chrome bumpers with over-riders.
    const head = []
    k.pair((s) => {
      const z = sh.frontZ(s * 0.56, 0.5) ?? -1.6
      head.push(roundLamp(k, s * 0.56, 0.5, z - 0.09, 0.14, HEADLIGHT, { housing: CHROME, depth: 0.2 }))
    })
    wrapBumper(k, [[-0.8, -1.5], [-0.74, -1.68], [-0.4, -1.78], [0.4, -1.78], [0.74, -1.68], [0.8, -1.5]], -0.08, 0.05, CHROME)
    wrapBumper(k, [[-0.8, 1.46], [-0.74, 1.64], [-0.4, 1.74], [0.4, 1.74], [0.74, 1.64], [0.8, 1.46]], -0.08, 0.05, CHROME)
    k.pair((s) => {
      k.gem(0.05, s * 0.34, 0.0, -1.76, CHROME, [1, 1.3, 1], { detail: 1 })
      k.gem(0.05, s * 0.34, 0.0, 1.72, CHROME, [1, 1.3, 1], { detail: 1 })
    })
    k.gem(0.045, 0, 0.5, -1.62, CHROME, [1, 0.8, 1.4], { detail: 1 })
    const tail = []
    k.pair((s) => {
      const z = sh.rearZ(s * 0.62, 0.42) ?? 1.62
      tail.push(roundLamp(k, s * 0.62, 0.42, z + 0.05, 0.075, TAILLIGHT, { dir: 1, housing: CHROME, depth: 0.12 }))
    })
    plateOn(k, sh, 'rear', 0.1, 0.4, 0.1)
    sideMirrors(k, sh.xAt(-0.55, 0.52) - 0.04, 0.62, -0.5, body, { size: 0.8 })
    const exhausts = tailpipes(k, [[0.3, -0.15, 1.72]], { r: 0.04 })
    return { wheels, size: [1.85, 1.4, 3.7], exhausts, head, tail }
  },

  /** Longroof: a fast estate - low stance, a roof that runs to the tail, rails, a roof-end lip, a ducktail and twin pipes. */
  longroof(k, { body, trim, glass }) {
    const wheels = { radius: 0.45, width: 0.44, x: 0.92, zf: -1.5, zr: 1.45 }
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      gap: 0.06,
      z: [-2.4, 2.4],
      top: [-2.4, 0.16, -2.32, 0.36, -2.1, 0.5, -1.5, 0.6, -0.8, 0.62, 0.4, 0.66, 1.45, 0.7, 2.1, 0.72, 2.3, 0.7, 2.4, 0.62],
      bottom: [-2.4, -0.08, -2.28, -0.24, -2.0, -0.3, 2.0, -0.3, 2.28, -0.24, 2.4, -0.1],
      width: [-2.4, 0.7, -2.3, 0.9, -1.95, 0.98, -1.5, 1.02, 0, 1.0, 1.45, 1.03, 2.1, 1.0, 2.4, 0.9],
      rt: 0.14,
      rb: 0.1,
      tumble: 0.94,
      belly: 0.9,
      crown: 0.02,
      grooves: [-0.7, 0.35, 1.3],
      paint: lower(-0.17, BLACK),
      cabin: {
        z: [-0.85, 2.32],
        top: [-0.85, 0.64, -0.3, 1.0, 0.1, 1.16, 0.6, 1.2, 1.5, 1.18, 2.0, 1.14, 2.32, 0.98],
        bottom: 0.6,
        width: [-0.85, 0.86, 0.4, 0.88, 2.32, 0.82],
        tumble: 0.74,
        rt: 0.18,
        rb: 0.02,
        roof: [0.1, 2.05],
        pillars: [0.38, 1.25],
        belt: 0.66,
        sideEnd: 2.1,
        sail: body,
        tailColor: body,
      },
    })
    k.decal(sh, 'side', -0.9, 0.9, 0.0, 0.025, trim, { nu: 4 })
    k.decal(gh, 'side', -0.8, 2.0, 1.0, 1.02, CHROME, { nu: 5 })
    handles(k, sh, [-0.3, 0.8], 0.52, BLACK)
    sideVent(k, sh, -0.95, -0.68, 0.18, 0.4, { skew: 0.05, taper: 0.4 })
    k.decal(sh, 'top', 0.2, 0.42, -1.5, -1.05, INK, { mirror: true, nu: 1, nv: 2 })
    // Roof rails following the roof line, a lip over the tailgate glass and a ducktail.
    k.pair((s) => {
      sweep(k, [0.2, 0.8, 1.4, 2.0].map((z) => [s * 0.5, gh.topAt(z, s * 0.5) + 0.05, z]), 0.022, trim, { segs: 5 })
      k.fine(() => {
        for (const z of [0.2, 1.1, 2.0]) k.box(0.04, 0.05, 0.05, s * 0.5, gh.topAt(z, s * 0.5) + 0.02, z, BLACK)
      })
    })
    k.extrude([[-0.15, 0.0], [0.1, 0.02], [0.24, -0.05], [0.12, -0.05], [-0.1, -0.03]], -0.5, 0.5, body, { at: [0, gh.topAt(2.06, 0), 2.06] })
    k.extrude([[-0.2, 0], [0.12, 0.0], [0.16, 0.07], [0.1, 0.07], [-0.2, 0.03]], -0.8, 0.8, body, { at: [0, sh.topAt(2.3, 0) - 0.02, 2.3] })
    const head = lampPair(k, sh, 'front', 0.52, 0.92, 0.22, 0.34, { skew: 0.03, taper: 0.35, inset: 0.3, drl: [0.55, 0.9, 0.19, 0.205, 0.03] })
    noseGrille(k, sh, 1.0, 0.0, 0.14, { frame: trim, bars: 1, bar: shade(trim, 0.6), inset: 0.2 })
    noseGrille(k, sh, 0.8, -0.24, -0.08)
    splitter(k, sh, 1.7, -0.28)
    const tail = lampPair(k, sh, 'rear', 0.45, 0.94, 0.4, 0.52, { taper: 0.3 })
    k.decal(sh, 'rear', -0.45, 0.45, 0.45, 0.47, TAILLIGHT, { nu: 3, glow: true })
    plateOn(k, sh, 'rear', 0.22)
    diffuser(k, sh, 1.3, -0.28, -0.1, 4)
    sideMirrors(k, sh.xAt(-0.62, 0.62) - 0.06, 0.74, -0.6, body)
    const exhausts = tailpipes(k, [[-0.56, -0.2, 2.4], [0.56, -0.2, 2.4]], { r: 0.06 })
    return { wheels, size: [2.05, 1.5, 4.85], exhausts, head, tail }
  },

  /** Palm Cruiser: an open-top cruiser - low windscreen, bucket seats, a tonneau, tail fins with bullet lamps, chrome and whitewall-white rims. */
  palmcruiser(k, { body, trim, glass }) {
    const wheels = { radius: 0.46, width: 0.4, x: 0.92, zf: -1.5, zr: 1.4 }
    const seat = '#1d7f86'
    const { sh } = roadBody(k, { body, glass }, {
      wheels,
      gap: 0.06,
      z: [-2.36, 2.32],
      top: [-2.36, 0.22, -2.28, 0.46, -2.06, 0.62, -1.5, 0.7, -0.9, 0.7, -0.3, 0.66, 0.4, 0.66, 1.4, 0.7, 1.95, 0.72, 2.2, 0.66, 2.32, 0.54],
      bottom: [-2.36, -0.04, -2.26, -0.24, -2.05, -0.3, 2.0, -0.3, 2.25, -0.22, 2.32, -0.06],
      width: [-2.36, 0.74, -2.26, 0.94, -1.5, 1.02, 0, 0.98, 1.4, 1.04, 2.0, 1.0, 2.32, 0.86],
      rt: 0.16,
      rb: 0.1,
      tumble: 0.94,
      belly: 0.9,
      crown: 0.02,
      grooves: [-0.3, 0.55],
      paint: paints(opening(-0.3, 1.02, 0.7), lower(-0.16, shade(body, 0.6))),
    })
    k.decal(sh, 'side', -0.95, 0.88, 0.34, 0.37, CHROME, { nu: 6 })
    k.decal(sh, 'side', -0.95, 0.88, 0.37, 0.5, trim, { nu: 6 })
    handles(k, sh, [0.15], 0.58, CHROME)
    k.decal(sh, 'top', -0.02, 0.02, 1.1, 2.2, CHROME, { nu: 1, nv: 3 })
    k.decal(sh, 'top', -0.02, 0.02, -2.2, -0.5, CHROME, { nu: 1, nv: 4 })
    // Cockpit: two bucket seats, a dash, a wheel, a padded tonneau behind, a low raked screen.
    k.pair((s) => {
      k.box(0.46, 0.14, 0.54, s * 0.36, 0.7, 0.38, seat, { bevel: 0.04 })
      k.box(0.46, 0.46, 0.12, s * 0.36, 0.94, 0.7, seat, { bevel: 0.05, r: [0.18, 0, 0], top: [0.92, 1] })
      k.box(0.26, 0.14, 0.1, s * 0.36, 1.24, 0.76, seat, { bevel: 0.04 })
    })
    k.box(1.56, 0.16, 0.36, 0, 0.7, -0.14, body, { bevel: 0.05 })
    k.box(1.3, 0.025, 0.04, 0, 0.79, -0.28, CHROME)
    torus(k, 0.15, 0.018, -0.36, 0.98, 0.0, DARK, { axis: 'z', rot: [-1.0, 0, 0] })
    k.box(1.4, 0.12, 0.5, 0, 0.76, 1.3, trim, { bevel: 0.05, top: [0.94, 0.9] })
    k.box(1.46, 0.46, 0.03, 0, 0.93, -0.18, glass, { r: [0.66, 0, 0], top: [0.9, 1] })
    sweep(k, [[-0.78, 0.7, -0.3], [-0.74, 1.14, 0.0], [0.74, 1.14, 0.0], [0.78, 0.7, -0.3]], 0.02, CHROME, { caps: false })
    // Tail fins carrying bullet lamps.
    k.pair((s) => {
      const x = s * 0.88
      const [a, b] = s < 0 ? [x - 0.05, x + 0.05] : [x + 0.05, x - 0.05]
      k.extrude([[0.95, 0.62], [1.45, 0.68], [1.9, 0.86], [2.26, 1.1], [2.36, 1.08], [2.36, 0.78], [2.24, 0.6]], Math.min(a, b), Math.max(a, b), body, { smooth: false })
    })
    // Nose: a wide chrome grille between round lamps, bumper bar with bullet guards.
    const head = []
    k.pair((s) => {
      const z = sh.frontZ(s * 0.76, 0.5) ?? -2.3
      head.push(roundLamp(k, s * 0.76, 0.5, z - 0.08, 0.13, HEADLIGHT, { housing: CHROME, depth: 0.2 }))
    })
    noseGrille(k, sh, 1.0, 0.12, 0.44, { frame: CHROME, bars: 3, bar: CHROME, inset: 0.35 })
    bar(k, -0.98, 0.98, -2.4, -0.06, 0.12, 0.16, CHROME)
    k.pair((s) => k.gem(0.055, s * 0.5, 0.0, -2.46, CHROME, [1, 1.2, 1.4], { detail: 1 }))
    k.gem(0.05, 0, 0.78, -2.18, CHROME, [1, 0.8, 1.8], { detail: 1 })
    const tail = []
    k.pair((s) => {
      tail.push(roundLamp(k, s * 0.88, 0.82, 2.38, 0.07, TAILLIGHT, { dir: 1, housing: CHROME, depth: 0.12 }))
    })
    bar(k, -0.98, 0.98, 2.38, -0.06, 0.12, 0.16, CHROME)
    plateOn(k, sh, 'rear', 0.14)
    sideMirrors(k, sh.xAt(-0.2, 0.62) - 0.02, 0.78, -0.2, CHROME, { size: 0.8 })
    const exhausts = tailpipes(k, [[-0.54, -0.12, 2.44], [0.54, -0.12, 2.44]], { r: 0.05 })
    return { wheels, size: [2.1, 1.45, 4.9], exhausts, head, tail }
  },

  /** Slidewinder: a low drift coupe - wide flared arches, vented bonnet, a ducktail and a swan-neck GT wing, canards, tow straps. */
  slidewinder(k, { body, trim, glass }) {
    const wheels = { radius: 0.45, width: 0.42, x: 0.9, zf: -1.45, zr: 1.4 }
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      gap: 0.06,
      z: [-2.3, 2.26],
      top: [-2.3, 0.1, -2.24, 0.28, -2.0, 0.44, -1.45, 0.58, -0.8, 0.6, -0.3, 0.6, 0.6, 0.62, 1.4, 0.68, 1.95, 0.7, 2.26, 0.62],
      bottom: [-2.3, -0.1, -2.15, -0.26, -1.9, -0.3, 1.9, -0.3, 2.15, -0.26, 2.26, -0.1],
      width: [-2.3, 0.7, -2.2, 0.94, -1.45, 1.1, -0.7, 0.98, 0.5, 0.97, 1.4, 1.1, 2.0, 1.04, 2.26, 0.92],
      rt: 0.14,
      rb: 0.08,
      tumble: 0.9,
      belly: 0.9,
      crown: [-1.8, 0.0, -1.45, -0.05, -0.9, 0.0, 1.0, 0.0, 1.4, -0.05, 2.0, 0.0],
      grooves: [-0.5, 0.5],
      paint: paints(archBand(wheels, 0.51, BLACK, { w: 0.06 }), lower(-0.14, BLACK)),
      cabin: {
        z: [-0.55, 1.5],
        top: [-0.55, 0.58, -0.1, 0.9, 0.3, 1.02, 0.9, 1.02, 1.25, 0.92, 1.5, 0.72],
        bottom: 0.55,
        width: [-0.55, 0.84, 0.4, 0.86, 1.5, 0.8],
        tumble: 0.72,
        rt: 0.2,
        rb: 0.02,
        roof: [0.3, 1.1],
        roofColor: BLACK,
        pillars: [0.4],
        belt: 0.6,
        sideEnd: 1.25,
        sail: body,
      },
    })
    k.decal(sh, 'top', 0.2, 0.52, -1.42, -1.05, INK, { mirror: true, nu: 1, nv: 2 })
    sideVent(k, sh, -0.86, -0.56, 0.18, 0.4, { skew: 0.08, taper: 0.4 })
    k.decal(sh, 'side', -0.86, 0.8, -0.1, -0.03, trim, { nu: 4 })
    roundel(k, sh, 0.32, 0.3, 0.13, WHITE)
    handles(k, sh, [-0.18], 0.5, BLACK)
    const head = lampPair(k, sh, 'front', 0.5, 0.94, 0.2, 0.3, { skew: 0.05, taper: 0.55, inset: 0.4, drl: [0.55, 0.94, 0.17, 0.185, 0.05] })
    noseGrille(k, sh, 0.7, 0.0, 0.14, { frame: trim, inset: 0.2 })
    noseGrille(k, sh, 1.3, -0.24, -0.06, { inset: 0.2 })
    splitter(k, sh, 1.9, -0.3, trim)
    // Canards on the nose corners.
    k.pair((s) => k.extrude([[-0.15, 0], [0.12, 0], [0.12, 0.025], [-0.1, 0.02]], s * 0.8, s * 1.08, BLACK, { at: [0, -0.12, -2.1], r: [0, 0, s * 0.2] }))
    // Tow straps: a loop on the nose and one at the tail.
    sweep(k, [[0.5, -0.1, -2.26], [0.62, -0.1, -2.42], [0.62, -0.22, -2.5], [0.46, -0.22, -2.44], [0.4, -0.12, -2.28]], 0.022, trim, { segs: 5, caps: false })
    sweep(k, [[-0.5, -0.12, 2.22], [-0.62, -0.12, 2.38], [-0.62, -0.24, 2.46], [-0.46, -0.24, 2.4], [-0.4, -0.14, 2.24]], 0.022, trim, { segs: 5, caps: false })
    // Ducktail and a swan-neck wing on tall stands.
    k.extrude([[-0.3, 0], [0.14, 0.02], [0.17, 0.13], [0.1, 0.13], [-0.3, 0.04]], -0.9, 0.9, body, { at: [0, sh.topAt(2.1, 0) - 0.03, 2.1] })
    rearWing(k, { span: 2.0, chord: 0.46, y: gh.topAt(1.3, 0) + 0.22, z: 1.92, deckY: sh.topAt(1.92, 0.6), color: trim, angle: 0.18, standX: 0.62, plates: BLACK, thick: 0.07, swan: true })
    const tail = lampPair(k, sh, 'rear', 0.5, 0.98, 0.4, 0.5, { taper: 0.4, inset: 0.3 })
    k.decal(sh, 'rear', -0.5, 0.5, 0.44, 0.46, TAILLIGHT, { nu: 3, glow: true })
    plateOn(k, sh, 'rear', 0.2)
    diffuser(k, sh, 1.2, -0.28, -0.1, 4)
    sideMirrors(k, sh.xAt(-0.5, 0.58) - 0.06, 0.7, -0.46, BLACK, { size: 0.85 })
    const exhausts = tailpipes(k, [[-0.22, -0.2, 2.26], [0.22, -0.2, 2.26]], { r: 0.07 })
    return { wheels, size: [2.2, 1.35, 4.9], exhausts, head, tail }
  },

  /** Roamer: a camper van - tall box body, a pop-top roof with a window, a rolled awning, a rear ladder and a bike on the back. */
  roamer(k, { body, trim, glass }) {
    const wheels = { radius: 0.46, width: 0.4, x: 0.9, zf: -1.45, zr: 1.4 }
    const stripe = '#e2493a'
    const { sh, gh } = roadBody(k, { body, glass }, {
      wheels,
      z: [-2.25, 2.25],
      top: [-2.25, 0.3, -2.18, 0.58, -2.0, 0.78, -1.7, 0.88, 2.15, 0.9, 2.25, 0.84],
      bottom: [-2.25, -0.02, -2.12, -0.2, -1.95, -0.28, 1.95, -0.28, 2.15, -0.2, 2.25, -0.06],
      width: [-2.25, 0.8, -2.15, 0.96, -1.7, 1.0, 2.15, 1.0, 2.25, 0.94],
      rt: 0.14,
      rb: 0.1,
      tumble: 0.98,
      belly: 0.93,
      crown: 0.02,
      grooves: [-0.7, 0.4],
      paint: lower(-0.12, DARK),
      cabin: {
        z: [-1.78, 2.2],
        top: [-1.78, 0.88, -1.3, 1.44, -1.05, 1.68, -0.8, 1.74, 2.05, 1.74, 2.2, 1.66],
        bottom: 0.84,
        width: [-1.78, 0.92, -1.2, 0.97, 2.2, 0.97],
        tumble: 0.94,
        rt: 0.16,
        rb: 0.02,
        roof: [-1.0, 2.1],
        roofColor: trim,
        pillars: [-0.72],
        belt: 0.88,
        sideEnd: -0.76,
        sail: body,
        tailColor: body,
      },
    })
    // Livery: a cream waist stripe, side windows, a rear window.
    k.decal(gh, 'side', -0.65, 2.1, 0.96, 1.1, trim, { nu: 4 })
    k.decal(gh, 'side', -0.55, 0.3, 1.2, 1.6, glass, { nu: 2, inset: 0.15, off: 0.012 })
    k.decal(gh, 'side', 0.5, 1.5, 1.2, 1.6, glass, { nu: 2, inset: 0.15, off: 0.012 })
    k.decal(gh, 'rear', -0.7, 0.7, 1.2, 1.54, glass, { nu: 2, inset: 0.15, off: 0.012 })
    k.decal(sh, 'side', -0.6, 2.0, 0.5, 0.62, trim, { nu: 4 })
    handles(k, sh, [-1.15, -0.3], 0.74, BLACK)
    // Pop-top: a canvas skirt, a lid and a window on its nose.
    const rt = gh.topAt(0.6, 0) + 0.02
    k.box(1.46, 0.12, 1.9, 0, rt + 0.06, 0.55, shade(trim, 0.8), { bevel: 0.02 })
    k.box(1.6, 0.14, 2.0, 0, rt + 0.19, 0.55, trim, { bevel: 0.05, top: [0.94, 0.92] })
    k.box(0.9, 0.09, 0.02, 0, rt + 0.18, -0.46, glass)
    // Rolled awning on the right with striped end caps.
    const ax = (gh.xAt(0.4, 1.5) ?? 0.9) + 0.06
    k.cyl(0.06, 2.1, ax, 1.62, 0.55, trim, { axis: 'z', segs: 8 })
    k.fine(() => {
      for (let i = 0; i < 5; i += 1) k.cyl(0.066, 0.18, ax, 1.62, -0.35 + i * 0.4, stripe, { axis: 'z', segs: 8 })
    })
    // Nose: round lamps, a bumper and grille.
    const head = []
    k.pair((s) => {
      const z = sh.frontZ(s * 0.66, 0.52) ?? -2.15
      head.push(roundLamp(k, s * 0.66, 0.52, z - 0.01, 0.14, HEADLIGHT, { housing: CHROME, depth: 0.1 }))
    })
    noseGrille(k, sh, 0.62, 0.38, 0.62, { frame: CHROME, bars: 2, bar: CHROME })
    bar(k, -0.98, 0.98, -2.2, -0.04, 0.2, 0.2, CHROME)
    plateOn(k, sh, 'front', 0.18)
    // Rear: a ladder on the right, a bike on a rack, tail lamps.
    const lx = 0.58
    k.pair((s) => tube(k, [lx + s * 0.13, 0.65, 2.3], [lx + s * 0.13, 1.66, 2.3], 0.022, STEEL, { segs: 5 }))
    k.fine(() => {
      for (let i = 0; i < 5; i += 1) tube(k, [lx - 0.13, 0.75 + i * 0.2, 2.3], [lx + 0.13, 0.75 + i * 0.2, 2.3], 0.018, STEEL, { segs: 4 })
    })
    const bike = '#e2493a'
    k.pair((s) => torus(k, 0.3, 0.032, s * 0.5, 0.36, 2.52, DARK, { axis: 'z', segs: 12, tubeSegs: 4 }))
    sweep(k, [[-0.5, 0.36, 2.52], [-0.12, 0.62, 2.52], [0.3, 0.64, 2.52], [0.5, 0.36, 2.52]], 0.028, bike, { segs: 5, caps: false })
    tube(k, [-0.12, 0.62, 2.52], [0.0, 0.36, 2.52], 0.026, bike, { segs: 5 })
    tube(k, [0.3, 0.64, 2.52], [0.34, 0.86, 2.52], 0.02, DARK, { segs: 4 })
    tube(k, [0.22, 0.88, 2.52], [0.46, 0.88, 2.52], 0.02, DARK, { segs: 4 })
    k.box(1.7, 0.08, 0.34, 0, -0.12, 2.38, DARK, { bevel: 0.02 })
    k.pair((s) => tube(k, [s * 0.55, -0.1, 2.26], [s * 0.55, 0.3, 2.5], 0.022, DARK, { segs: 4 }))
    const tail = lampPair(k, sh, 'rear', 0.78, 0.96, 0.3, 0.8, { inset: 0.04 })
    sideMirrors(k, sh.xAt(-1.2, 0.84) - 0.04, 1.0, -1.2, CHROME, { size: 1.0 })
    const exhausts = tailpipes(k, [[-0.7, -0.2, 2.24]], { r: 0.05 })
    return { wheels, size: [2.05, 2.2, 4.9], exhausts, head, tail }
  },
}
