/**
 * Grand Tour, zone 3 - Tropical Island (bright midday): off the snowy summit's observatory
 * plaza and out over a chain of tropical islands in a high volcanic lagoon - turquoise water,
 * white sand, palms - then up a cliff past a waterfall onto the upper lagoon, through a
 * jungle tunnel and a giant shell, and up the volcano's flank in hairpins to a plaza on its
 * shoulder, where the Desert Canyon (the volcano's dry lee side) takes over.
 *
 * Roads (sections 14-20 of the Grand Tour), narrow island roads (`W` 9.5 m; the wider bits
 * - crab sandbars, the lighthouse bend, hairpins - at most 12 m; single-lane spots 4.2 m):
 * - Lagoon Causeway: a long, nearly flat causeway low over the Lower Lagoon - a boost, the
 *   first SAND bar (loose: it slides a little), rolling coconuts, a boardwalk and a rope bridge.
 * - Palm Hop: palm springs (bounce pads) hopping two channels between islands, crabs
 *   scuttling across a sandbar, a second rope bridge.
 * - Reef Lighthouse: coral spike strips on the reef, a long banked bend round the lighthouse
 *   on its reef islet, three crabs, a single-lane boardwalk past the seaplane dock.
 * - Waterfall Gap: the climb up the cliff - swinging palm logs, coral, a pair of bends - and
 *   a palm-spring jump across the chasm where the Upper Lagoon pours out through a gap in the
 *   cliff (the falls drop beside your flight).
 * - Jungle Tunnel: a boardwalk on the Upper Lagoon, then a tunnel of vines
 *   (barriers) with coconuts rolling down it, and a rope bridge over a jungle ravine.
 * - Shell Bay: boosts into a loop through a giant shell, crabs, coral and a banked climb.
 * - Volcano Climb: two hairpins up the volcano's flank, lava boulders rolling down the
 *   steep leg between them (glowing lava streams far below), a single-lane lava ridge and
 *   the shoulder plaza.
 *
 * Signature: SAND (`SAND` pieces: collider kind 'sand', a little less grip than asphalt - the
 * car drifts slightly wide but keeps all its drive; drawn as sand) and island hopping. Obstacle
 * looks (same physics as the originals): `buoys` + `look: 'coconut'`, `buoys` + `heavy` +
 * `look: 'boulder'` (lava boulders), `hammer` + `look: 'palmlog'` (bamboo gantry),
 * `sweeper` + `look: 'crab'`, spike strips with `look: 'coral'`, bounce pads with
 * `look: 'spring'` (palm springs). Every piece gives its width (the zone doesn't lean on the
 * builder's default), and the single-lane spots taper from and back to `W`.
 *
 * The scenery (client/src/game/world/scenery/grandTour/tropicZone.jsx +
 * client/src/game/world/tropic/tropicGeometry.js) builds the islands round the zone's roads
 * and reads `stage.decor.tropic` (path-index ranges, below) for the lagoons and set pieces.
 */

import { sweepers } from '../pieces.js'

/** The zone's road width (m), and its wide bits' (crab sandbars, bends, hairpins). */
const W = 9.5
const WIDE = 11
const HAIRPIN = 12
/** Loose sand: a little less grip (collider kind 'sand'), drawn as sand. */
const SAND = { kind: 'sand', style: 'sand' }
/**
 * Giant crabs: the sliding containers dressed as crabs, each scuttling to and fro on ONE
 * half of a `width` m road (`[at, phase, period, side]`, side +1 right / -1 left): it comes
 * to within 0.3 m of its kerb (too narrow to get pinned in) and never past the middle, so
 * the other half - over 5 m - is always open. Alternate the sides for a slalom.
 */
const crabs = (list, width) => {
  const half = (width - 1.2) / 2
  const travel = 1.6
  const lane = half - 0.3 - 1.3 - travel / 2
  return list.map(([at, phase, period, side]) => ({ ...sweepers([[at, phase, period]], travel)[0], lane: side * lane, look: 'crab' }))
}
/**
 * Rolling coconuts down a piece (light, like buoys; a soft knock), each keeping to one side
 * (`lanes`: shares of the width, mostly alternating) - the other side is the way up.
 */
const coconuts = (interval, speed) => ({ type: 'buoys', look: 'coconut', at: 0.98, interval, speed, knock: 0.35, lanes: [-0.27, 0.27, -0.26, 0.28, 0.27, -0.27] })
/** Spike strips styled as coral: `[at, side, cover]` each (at most 45%: always >= 4.5 m clear). */
const coral = (list) => list.map(([at, side, cover = 0.45]) => ({ at, side, cover, look: 'coral' }))
/** A palm spring (bounce pad) across a pad of the road's width. */
const SPRING = { type: 'bounce', look: 'spring', at: 0.72, size: [W - 1, 4] }

export function tropicZone(b, cp, next) {
  const decor = {
    lagoons: [],
    sand: [],
    boardwalks: [],
    bridges: [],
    springs: [],
    reefs: [],
    lighthouses: [],
    docks: [],
    cliffs: [],
    falls: [],
    tunnels: [],
    shells: [],
    volcano: [],
    ridges: [],
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
   * A single-lane (4.2 m) stretch: tapers from `W` down and back out, open-edged (no curbs, so
   * no kerb end ever faces you). `girder`: steel girders drawn under it (the lava ridge);
   * plank rope bridges get rope rails and posts from the scenery instead.
   */
  const single = (len, rise, { style = 'planks', girder = false, ...opts } = {}) => {
    const third = len / 3
    const edge = { curbs: false, style, ...(girder ? { girder: true } : {}) }
    b.straight(third, rise / 3, { width: [W, 4.2], ...edge })
    b.straight(third, rise / 3, { width: 4.2, ...edge, ...opts })
    b.straight(third, rise / 3, { width: [4.2, W], ...edge })
  }
  /** A rope bridge of planks (single lane). */
  const ropeBridge = (len, rise, opts = {}) => span(decor.bridges, () => single(len, rise, opts))
  /** A palm spring pad and the jump it throws you over. */
  const spring = (gap, rise) => {
    span(decor.springs, () => b.straight(18, 0, { width: W, style: 'planks', fixed: true, triggers: [SPRING] }))
    b.gap(gap, rise, { width: W })
  }

  // Lagoon Causeway: off the summit onto a causeway low over the Lower Lagoon - a boost, a
  // flat sand bar (feel it slide), coconuts rolling down an island, a boardwalk and the
  // first rope bridge.
  // (Each road's lagoon is its own basin, a few metres above the last: water `depth` m
  // under the road's lowest point, sand bars and reefs between the basins.)
  st(30, 0.5, { coins: { n: 3 } })
  span(
    decor.lagoons,
    () => {
      st(50, 0.5, { width: [W, WIDE], coins: { n: 4 } })
      st(90, 1, { width: WIDE, triggers: [{ type: 'boost', at: 0.25 }], coins: { n: 6, weave: 2.5 } })
      cv(-50, 70, 0.5, { width: WIDE, bank: 6, coins: { n: 4, lane: 2.5 } })
      span(decor.sand, () => st(60, 0, { width: WIDE, ...SAND, coins: { n: 4 } }))
      st(20, 0, { width: [WIDE, W] })
      cv(60, 50, 0.5, { bank: 6, coins: { n: 4, lane: -2.5 } })
      // (Coconuts roll down the island between low sea walls: a knock never throws you in.)
      st(20, 0.5, { width: [W, WIDE], barrier: true })
      st(70, 1.5, { width: WIDE, barrier: true, obstacles: [coconuts(4, 8)], coins: { n: 4, weave: 2.5 } })
      st(20, 0, { width: [WIDE, W], barrier: true })
      st(40, 0, { items: 0.5 })
      span(decor.boardwalks, () => st(60, 0.5, { style: 'planks', coins: { n: 4 } }))
      st(20, 0)
      ropeBridge(42, 0.5)
      st(30, 0.5)
    },
    { depth: 4.5 },
  )
  b.checkpoint(cp(), 'Palm Hop')

  // Palm Hop: palm springs hop two channels between the islands, giant crabs scuttle
  // across a sandbar, and a rope bridge to the next island.
  span(
    decor.lagoons,
    () => {
      st(30, 0.5, { coins: { n: 3 } })
      cv(-70, 45, 0.5, { bank: 8, coins: { n: 4, lane: 2.5 } })
      st(36, 0, { coins: { n: 3 } })
      spring(22, 0)
      st(40, 0, { fixed: true, coins: { n: 3 } })
      spring(24, 0)
      st(30, 0)
      cv(80, 40, 0.5, { width: [W, WIDE], bank: 8, coins: { n: 5 } })
      span(decor.sand, () => st(70, 0.5, { width: WIDE, ...SAND, obstacles: crabs([[0.3, 0, 3.2, 1], [0.7, 1.7, 3, -1]], WIDE), coins: { n: 4, weave: 2.5 } }))
      st(50, 0.5, { width: [WIDE, W], items: 0.5 })
      st(50, 0.5, { coins: { n: 4 } })
      ropeBridge(48, 0.5)
      st(30, 0.5)
    },
    { depth: 4.5 },
  )
  b.checkpoint(cp(), 'Reef Lighthouse')

  // Reef Lighthouse: coral spike strips along the reef, a long banked bend round the
  // lighthouse on its reef islet, three crabs, and a single-lane boardwalk past the
  // seaplane dock.
  span(
    decor.lagoons,
    () => {
      st(30, 0.5, { width: [W, WIDE], coins: { n: 3 } })
      span(decor.reefs, () => st(80, 1, { width: WIDE, spikes: coral([[0.3, 1], [0.72, -1]]), coins: { n: 5 } }))
      span(decor.lighthouses, () => cv(150, 46, 1, { width: WIDE, bank: 8, coins: { n: 8, lane: 2.5, from: 0.08, to: 0.92 } }))
      st(70, 1, { width: WIDE, obstacles: crabs([[0.25, 0, 3, -1], [0.5, 1.4, 2.8, 1], [0.75, 2.8, 3, -1]], WIDE), coins: { n: 4, weave: 2.5 } })
      st(40, 0.5, { width: [WIDE, W], items: 0.5 })
      cv(-90, 50, 0.5, { bank: 6, coins: { n: 4 } })
      st(60, 0.5, { coins: { n: 4 } })
      span(decor.docks, () => ropeBridge(45, 0.5))
    },
    { depth: 4.5 },
  )
  // Out of the lagoon and onto the foot of the cliff.
  st(30, 1.5)
  b.checkpoint(cp(), 'Waterfall Gap')

  // Waterfall Gap: up the cliff - swinging palm logs, coral, a pair of bends - then a palm
  // spring across the chasm where the Upper Lagoon pours out through a gap in the cliff.
  span(decor.cliffs, () => {
    st(30, 1, { coins: { n: 3 } })
    st(80, 6, {
      fixed: true,
      barrier: true,
      obstacles: [
        { type: 'hammer', look: 'palmlog', at: 0.3, phase: 0.4, period: 4 },
        { type: 'hammer', look: 'palmlog', at: 0.72, phase: 2, period: 3.8 },
      ],
      coins: { n: 5 },
    })
    cv(-90, 40, 4, { bank: 10, coins: { n: 5, lane: 1.5 } })
    st(60, 4, { spikes: coral([[0.4, 1], [0.75, -1]]), coins: { n: 4 } })
    cv(80, 40, 3, { bank: 8, items: 0.5 })
    st(40, 2, { coins: { n: 3 } })
  })
  span(decor.falls, () => spring(24, 3))
  st(40, 1, { fixed: true, coins: { n: 3 } })
  st(40, 1)
  st(50, 1, { coins: { n: 4 } })
  b.checkpoint(cp(), 'Jungle Tunnel')

  // Jungle Tunnel: a boardwalk along the Upper Lagoon, a beach,
  // then into the jungle through a tunnel of vines (barriers) with coconuts rolling down
  // it, and a rope bridge over a ravine.
  span(
    decor.lagoons,
    () => {
      st(30, 0.5, { coins: { n: 3 } })
      span(decor.boardwalks, () => st(70, 0.5, { style: 'planks', triggers: [{ type: 'boost', at: 0.4 }], coins: { n: 5 } }))
      cv(-60, 50, 0.5, { bank: 6, coins: { n: 4 } })
      st(50, 0.5, { coins: { n: 3 } })
    },
    { depth: 4 },
  )
  st(30, 1, { width: [W, 10] })
  span(decor.tunnels, () => {
    st(70, 4, { width: 10, barrier: true, obstacles: [coconuts(3.8, 9)], coins: { n: 4, weave: 2 } })
    cv(50, 60, 2, { width: 10, barrier: true })
    st(60, 3, { width: 10, barrier: true, coins: { n: 3 } })
  })
  st(30, 1, { width: [10, W] })
  cv(-70, 40, 3, { bank: 8, items: 0.5, coins: { n: 5 } })
  st(50, 2, { coins: { n: 4 } })
  ropeBridge(48, 2)
  st(30, 1)
  b.checkpoint(cp(), 'Shell Bay')

  // Shell Bay: boosts into a loop through a giant shell, crabs, coral and a banked climb.
  st(30, 1, { coins: { n: 3 } })
  st(50, 0, { width: [W, 10], triggers: [{ type: 'boost', at: 0.3 }, { type: 'boost', at: 0.85 }], coins: { n: 4 } })
  span(decor.shells, () => b.loop(11.5, { width: 10, shift: 14 }))
  st(40, 1, { width: [10, W], coins: { n: 5 } })
  cv(-70, 40, 2, { width: [W, WIDE], bank: 8, coins: { n: 4 } })
  st(80, 3, { width: WIDE, obstacles: crabs([[0.3, 0.5, 2.6, 1], [0.7, 2.1, 2.5, -1]], WIDE), coins: { n: 4, weave: 2.5 } })
  st(40, 1, { width: [WIDE, W], items: 0.5 })
  cv(60, 40, 2, { bank: 8 })
  st(60, 3, { spikes: coral([[0.45, -1]]), coins: { n: 3 } })
  st(40, 2, { coins: { n: 3 } })
  b.checkpoint(cp(), 'Volcano Climb')

  // Volcano Climb: two hairpins up the volcano's flank, lava boulders rolling down the
  // steep leg between them, a banked bend, a single-lane ridge across a lava field, and the
  // plaza on the volcano's shoulder.
  span(decor.volcano, () => {
    st(30, 2, { width: [W, HAIRPIN], coins: { n: 3 } })
    st(50, 4, { width: HAIRPIN, coins: { n: 4 } })
    cv(170, 24, 6, { width: HAIRPIN, bank: 10, chord: 1.25, coins: { n: 6, lane: 3, arc: -6, from: 0.06, to: 0.94 } })
    st(20, 2, { width: [HAIRPIN, W] })
    st(70, 10, { obstacles: [{ type: 'buoys', heavy: true, look: 'boulder', at: 0.98, interval: 3.8, speed: 11 }], coins: { n: 5, weave: 2 } })
    st(20, 2, { width: [W, HAIRPIN] })
    cv(-170, 24, 6, { width: HAIRPIN, bank: 10, chord: 1.25, coins: { n: 6, lane: -3, arc: 6, from: 0.06, to: 0.94 } })
    st(60, 6, { width: HAIRPIN, spikes: [{ at: 0.5, side: 1, cover: 0.4 }], coins: { n: 4, lane: -2.5 } })
    cv(70, 40, 5, { width: HAIRPIN, bank: 10, items: 0.5, coins: { n: 5, lane: 2.5 } })
    st(40, 3, { width: [HAIRPIN, W] })
  })
  span(decor.ridges, () => single(48, 4, { style: 'grate', girder: true }))
  st(50, 3, { coins: { n: 3 } })
  b.checkpoint(cp(), next)
  return decor
}
