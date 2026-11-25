/**
 * Grand Tour, zone 4 - Desert Canyon (golden-red sunset; the FINISH of the whole tour): off
 * the volcano's shoulder plaza and away from the cone into its dry lee - red-orange
 * sandstone canyons and mesas - climbing all the way through a ghost town and an old mine,
 * over a gorge and up the tallest mesa to the Grand Tour's finish, high above everything
 * the tour has crossed, lit by the low sun.
 *
 * Roads (sections 21-27 of the Grand Tour, then the summit), narrow dusty roads (`W` 9.2 m;
 * the wider bits - the river bed, main street, the storm ridge, hairpins - at most 12 m;
 * single-lane spots 4.2 m). The hardest zone, step by step:
 * - Mesa Road: out across the volcano's lee - tumbleweeds bowling down the road, cactus
 *   caltrops along a cliff-edge ledge, and under the first natural rock arch.
 * - Dry Riverbed: down in a dry wash - loose sand, sandstone boulders rolling down it, a
 *   single-lane timber trestle over a side gully and a second arch.
 * - Ghost Town: main street between false-front saloons, tumbleweeds rolling down it, a
 *   banked bend round the water tower, caltrops by the boardwalks.
 * - Old Mine: mine carts rattling across the road on rails, ore buckets swinging from mine
 *   cranes, a barriered mine tunnel and a single-lane rail trestle.
 * - Dust Storm: a high ridge in a sandstorm (thick dust in the air): gusts shoving you to
 *   alternate sides along two runs, then a single-lane ledge along the cliff.
 * - Canyon Jump: caltrops, a boost and a timber trampoline that throws you across the big
 *   gorge; boulders under the third rock arch.
 * - Sunset Climb: three hairpins up the face of the tallest mesa - boulders rolling down a
 *   leg, an ore bucket swinging over a hairpin's exit, caltrops - a single-lane ledge, and
 *   the Grand Tour's finish plaza on the mesa top, under a great sandstone arch.
 *
 * Signature: the canyon itself (cliff-edge ledges, arches, the gorge) and its dust.
 * Obstacle looks (same physics as the originals; drawn by the zone's scenery from a
 * draw-only copy of the sim, client/src/game/track/obstacleSim.js SEPARATE_LOOKS):
 * `buoys` + `look: 'tumbleweed'` (light, a soft knock, one side at a time), `buoys` +
 * `heavy` + `look: 'sandstone'` (boulders), `hammer` + `look: 'bucket'` (an ore bucket on
 * a timber mine crane), `traffic` + `look: 'minecart'` (mine carts on rails out of mine
 * adits); spike strips with `look: 'cactus'` (cactus caltrops), the trampoline with
 * `look: 'timber'`, wind gusts with `look: 'dust'` (sand-coloured chevrons). Loose sand in
 * the river bed is the Tropical Island's `SAND` (collider kind 'sand').
 *
 * The scenery (client/src/game/world/scenery/grandTour/canyonZone.jsx +
 * client/src/game/world/canyon/canyonGeometry.js) builds the canyon round the zone's roads
 * and reads `stage.decor.canyon` (path-index ranges, below) for the set pieces.
 */

import { crossing } from '../pieces.js'

/** The zone's road width (m), its wide bits' and its hairpins'. */
const W = 9.2
const WIDE = 11
const STORM = 10
const HAIRPIN = 12
/** Loose sand (collider kind 'sand': a little less lateral grip), drawn as sand. */
const SAND = { kind: 'sand', style: 'sand' }

/**
 * Tumbleweeds bowling down a piece (light balls, a soft knock), each keeping to one side
 * (`lanes`: shares of the width, mostly alternating) - the other side is the way up.
 */
const tumbleweeds = (interval, speed) => ({ type: 'buoys', look: 'tumbleweed', at: 0.98, interval, speed, knock: 0.3, lanes: [-0.27, 0.27, -0.26, 0.28, 0.27, -0.27] })
/** Sandstone boulders rolling down a piece (the heavy balls: one side at a time). */
const boulders = (interval, speed) => ({ type: 'buoys', heavy: true, look: 'sandstone', at: 0.98, interval, speed })
/** Spike strips styled as cactus caltrops: `[at, side, cover]` each (always >= 4.5 m clear). */
const caltrops = (list) => list.map(([at, side, cover = 0.45]) => ({ at, side, cover, look: 'cactus' }))
/** An ore bucket swinging across the road from a timber mine crane (a hammer). */
const bucket = (at, phase, period) => ({ type: 'hammer', look: 'bucket', at, phase, period })
/** Mine carts crossing the road on rails, both ways, out of a mine adit on each side. */
const carts = (at, opts = {}) => crossing(at, { interval: 4, speed: 4.6, gap: 0.12, ...opts }).map((o) => ({ ...o, look: 'minecart', knock: 0.85 }))
/** Dust-storm gusts across a `width` m road: `[at, dir]` each (dir 1 = to your right). */
const gusts = (width, list) => list.map(([at, dir]) => ({ type: 'wind', look: 'dust', at, dir, size: [width, 14], power: 1 }))
/** The timber trampoline that throws you over the gorge. */
const TRAMPOLINE = { type: 'bounce', look: 'timber', at: 0.75, size: [STORM - 1, 4], power: 1.25 }

export function canyonZone(b, cp) {
  const decor = {
    arches: [],
    ledges: [],
    rivers: [],
    trestles: [],
    towns: [],
    mines: [],
    tunnels: [],
    storms: [],
    gorges: [],
    mesas: [],
    finish: [],
  }
  const mark = () => b.stage.path.length - 1
  const from = () => b.stage.path.length
  /** Runs `fn` (pieces) and records its path range in `list` (extra fields in `extra`). */
  const span = (list, fn, extra = {}) => {
    const a = from()
    fn()
    const r = { from: a, to: mark(), ...extra }
    list.push(r)
    return r
  }
  /** Straight / curve at the zone's width unless the piece says otherwise. */
  const st = (len, rise, opts = {}) => b.straight(len, rise, { width: W, ...opts })
  const cv = (deg, radius, rise, opts = {}) => b.curve(deg, radius, rise, { width: W, ...opts })
  /**
   * A single-lane (4.2 m) stretch: tapers from `W` down and back out, open-edged (no curbs,
   * so no kerb end ever faces you), timber girders drawn under it (trestles and ledges).
   */
  const single = (len, rise, { style = 'planks', ...opts } = {}) => {
    const third = len / 3
    const edge = { curbs: false, style, girder: true }
    b.straight(third, rise / 3, { width: [W, 4.2], ...edge })
    b.straight(third, rise / 3, { width: 4.2, ...edge, ...opts })
    b.straight(third, rise / 3, { width: [4.2, W], ...edge })
  }
  const trestle = (len, rise, opts = {}) => span(decor.trestles, () => single(len, rise, opts))

  // Mesa Road: out across the volcano's lee - tumbleweeds bowling down the road, cactus
  // caltrops along a cliff-edge ledge (the canyon drops away on the right), the first rock arch.
  st(30, 1, { coins: { n: 3 } })
  st(70, 3, { coins: { n: 4 } })
  cv(50, 60, 2, { bank: 6, coins: { n: 4, lane: -2 } })
  st(60, 2, { coins: { n: 4 } })
  st(80, 4, { obstacles: [tumbleweeds(3.6, 8)], coins: { n: 4, weave: 2 } })
  cv(-60, 55, 3, { bank: 8, coins: { n: 4, lane: 2 } })
  span(decor.ledges, () => st(90, 4, { spikes: caltrops([[0.35, -1], [0.75, 1]]), coins: { n: 5 } }), { side: 1 })
  st(40, 1, { items: 0.5 })
  cv(40, 60, 2, { bank: 6, coins: { n: 3 } })
  span(decor.arches, () => st(50, 2, { coins: { n: 3 } }))
  b.checkpoint(cp(), 'Dry Riverbed')

  // Dry Riverbed: down in a dry wash - loose sand, sandstone boulders rolling down it - a
  // single-lane timber trestle over a side gully, a banked bend and the second arch.
  st(30, 1, { coins: { n: 3 } })
  span(decor.rivers, () => {
    st(50, 1, { width: [W, WIDE] })
    st(80, 2, { width: WIDE, ...SAND, coins: { n: 5, weave: 2.5 } })
    cv(-70, 50, 2, { width: WIDE, bank: 6, coins: { n: 4, lane: 2.5 } })
    st(80, 4, { width: WIDE, obstacles: [boulders(4.2, 10)], coins: { n: 4, weave: 2 } })
    st(20, 0.5, { width: [WIDE, W] })
  })
  st(30, 1)
  trestle(48, 1)
  st(30, 1)
  cv(70, 45, 3, { bank: 8, coins: { n: 4 } })
  span(decor.arches, () => st(60, 3, { spikes: caltrops([[0.5, -1]]), coins: { n: 4 } }))
  st(40, 2, { items: 0.5 })
  b.checkpoint(cp(), 'Ghost Town')

  // Ghost Town: main street between the saloons, tumbleweeds rolling down it, a banked bend
  // round the water tower, caltrops by the boardwalks.
  st(30, 1, { coins: { n: 3 } })
  cv(-40, 70, 1, { coins: { n: 3 } })
  span(decor.towns, () => {
    st(40, 0.5, { width: [W, WIDE] })
    st(110, 2, { width: WIDE, obstacles: [tumbleweeds(2.8, 9)], coins: { n: 6, weave: 2.5 } })
    cv(90, 34, 2, { width: WIDE, bank: 8, coins: { n: 5, lane: 2.5 } })
    st(70, 2, { width: WIDE, spikes: caltrops([[0.3, 1], [0.7, -1]]), coins: { n: 4 } })
    st(20, 0.5, { width: [WIDE, W] })
  })
  st(50, 2, { items: 0.5 })
  cv(-60, 50, 3, { bank: 8, coins: { n: 4 } })
  st(60, 3, { coins: { n: 4 } })
  b.checkpoint(cp(), 'Old Mine')

  // Old Mine: mine carts across the road on rails, ore buckets swinging from the mine
  // cranes, a barriered mine tunnel and a single-lane rail trestle.
  st(30, 1, { coins: { n: 3 } })
  span(decor.mines, () => {
    st(70, 0.5, { obstacles: carts(0.35), coins: { n: 4, from: 0.6 } })
    cv(60, 45, 2, { bank: 8, coins: { n: 4 } })
    st(80, 4, { obstacles: [bucket(0.3, 0.4, 4), bucket(0.72, 2, 3.8)], coins: { n: 5 } })
    st(40, 0.5, { obstacles: carts(0.4, { interval: 3.8, phase: 1 }), coins: { n: 2, from: 0.75 } })
  })
  st(30, 1, { width: [W, 10] })
  span(decor.tunnels, () => {
    st(80, 3, { width: 10, barrier: true, obstacles: [tumbleweeds(3.4, 9)], coins: { n: 4, weave: 2 } })
    cv(-50, 60, 2, { width: 10, barrier: true })
    st(40, 1, { width: 10, barrier: true, coins: { n: 3 } })
  })
  st(30, 1, { width: [10, W] })
  trestle(48, 2)
  st(40, 2, { items: 0.5 })
  b.checkpoint(cp(), 'Dust Storm')

  // Dust Storm: a high ridge in a sandstorm - gusts from alternate sides along two runs,
  // a banked bend between, then a single-lane ledge along the cliff.
  st(30, 2, { width: [W, STORM], coins: { n: 3 } })
  span(decor.storms, () => {
    st(90, 6, { width: STORM, triggers: gusts(STORM, [[0.2, 1], [0.5, -1], [0.8, 1]]), coins: { n: 6 } })
    cv(-70, 55, 4, { width: STORM, bank: 12, coins: { n: 5 } })
    st(90, 6, { width: STORM, triggers: gusts(STORM, [[0.22, -1], [0.55, 1], [0.85, -1]]), coins: { n: 6 } })
    cv(70, 55, 4, { width: [STORM, W], bank: 12, coins: { n: 5 } })
  })
  st(40, 3, { items: 0.5 })
  span(decor.ledges, () => single(48, 3, { style: 'asphalt' }), { side: -1 })
  st(40, 2, { coins: { n: 3 } })
  b.checkpoint(cp(), 'Canyon Jump')

  // Canyon Jump: caltrops, a boost and a timber trampoline that throws you across the big
  // gorge; boulders under the third rock arch.
  st(30, 1, { coins: { n: 3 } })
  cv(50, 50, 2, { bank: 8, coins: { n: 4 } })
  st(60, 2, { spikes: caltrops([[0.4, 1], [0.8, -1]]), coins: { n: 4 } })
  st(40, 0, { width: [W, STORM], triggers: [{ type: 'boost', at: 0.4 }] })
  span(decor.gorges, () => {
    st(20, 0, { width: STORM, style: 'planks', fixed: true, triggers: [TRAMPOLINE] })
    b.gap(40, 6, { width: STORM })
  })
  st(50, 2, { width: [STORM, WIDE], coins: { n: 4 } })
  st(40, 1, { width: [WIDE, W] })
  cv(-80, 45, 3, { bank: 8, coins: { n: 4 } })
  span(decor.arches, () => st(70, 4, { obstacles: [boulders(3.8, 11)], coins: { n: 4, weave: 2 } }))
  st(40, 2, { items: 0.5 })
  b.checkpoint(cp(), 'Sunset Climb')

  // Sunset Climb: three hairpins up the face of the tallest mesa - boulders down the leg
  // between the first two, an ore bucket over the second's exit, caltrops - a single-lane
  // ledge, and the finish on the mesa top.
  span(decor.mesas, () => {
    st(30, 2, { width: [W, HAIRPIN], coins: { n: 3 } })
    st(50, 4, { width: HAIRPIN, coins: { n: 4 } })
    cv(170, 24, 6, { width: HAIRPIN, bank: 10, chord: 1.25, coins: { n: 6, lane: 3, arc: -6, from: 0.06, to: 0.94 } })
    st(20, 2, { width: [HAIRPIN, W] })
    st(70, 10, { obstacles: [boulders(3.8, 11)], coins: { n: 5, weave: 2 } })
    st(20, 2, { width: [W, HAIRPIN] })
    cv(-170, 24, 6, { width: HAIRPIN, bank: 10, chord: 1.25, coins: { n: 6, lane: -3, arc: 6, from: 0.06, to: 0.94 } })
    st(60, 6, { width: HAIRPIN, obstacles: [bucket(0.5, 1, 3.6)], coins: { n: 4 } })
    cv(170, 24, 6, { width: HAIRPIN, bank: 10, chord: 1.25, coins: { n: 6, lane: 3, arc: -6, from: 0.06, to: 0.94 } })
    st(20, 2, { width: [HAIRPIN, W] })
    st(60, 8, { spikes: caltrops([[0.4, 1], [0.75, -1]]), coins: { n: 4 } })
  })
  span(decor.ledges, () => single(48, 4, { style: 'asphalt' }), { side: 1 })
  st(40, 2, { width: [W, 12], coins: { n: 3 } })
  span(decor.finish, () => b.finish('Sunset Mesa'))
  return decor
}
