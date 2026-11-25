/**
 * Stage 1 - Sky Docks. From the pier up through the harbour's cranes to Crane Summit:
 * 29 long sections (~400-900 m each; ~16.9 km and ~1,350 m of climb in all), each built
 * round one obstacle idea that it introduces, develops and then mixes with something
 * you've already met. Between them: steep humps (hills) to get air over, squeezes where
 * the road narrows to 6.5-7.5 m, and single-lane spots - one car at a time - over a ~4 m
 * girder bridge or through a gap between two container stacks. It opens with the Stunt
 * Bowl and the sweeper deck; the last eight roads (Cargo Ladder to Summit Rush) were
 * added above Crane Climb, so sections 0-20 and their checkpoints keep their numbers. Every
 * straight and bend is `STRETCH` times what its spec says (pieces marked `fixed` - the hammer,
 * boom and gauntlet stretches whose rhythm was tuned, pads, deck run-ins - keep their length).
 * And every road is laid `WIDTH_SCALE` as wide as its spec says (12 m -> 9.36 m): see below.
 *
 * Built once on import (deterministic), so the client and the server agree on every
 * checkpoint, coin and obstacle.
 */

import { START_GATE } from '../lobby.js'
import { placeAdventure } from '../adventure.js'
import { addExitPortal } from '../chapters.js'
import { createTrackBuilder, scaledWidth } from '../track.js'
import skyDocks from './skyDocks.meta.js'

/**
 * Rows of bollards across the road: each row leaves one wide gap, alternating sides,
 * so you weave left-right-left through them.
 */
function bollardField(from, to, rows, width) {
  const out = []
  const lanes = [-width * 0.38, -width * 0.19, 0, width * 0.19, width * 0.38]
  for (let r = 0; r < rows; r += 1) {
    const at = from + ((to - from) * r) / Math.max(1, rows - 1)
    const gap = r % 2 === 0 ? [0, 1] : [3, 4]
    lanes.forEach((lane, i) => {
      if (!gap.includes(i)) out.push({ type: 'bollard', at, lane })
    })
  }
  return out
}

/**
 * Wind zones: a big harbour fan at the roadside and the gust it blows across the road
 * (`dir` 1 = towards your right). Returns `{ obstacles, triggers }` to spread into a piece.
 */
function windZones(width, zones) {
  return {
    obstacles: zones.map(([at, dir]) => ({ type: 'fan', at, lane: -dir * (width / 2 + 2.4), dir })),
    triggers: zones.map(([at, dir]) => ({ type: 'wind', at, dir, size: [width, 14], power: 1 })),
  }
}

/**
 * A container gate: two stacks of containers either side of a single-lane gap (`gap` m,
 * centred `lane` m right of the road's centre) with one more across the top - one car
 * at a time. Static: line up and go. (On the narrowed road an off-centre gap stays within
 * 0.7 m of the middle: the stacks then fill the rest of the road and overhang its edge by
 * no more than that.)
 */
const slot = (at, { lane = 0, gap = 4.2, length = 12 } = {}) => ({ type: 'slot', at, lane, gap, length })

/**
 * A bollard gate: a row of bollards across the road leaving one single-lane gap (`gap` m,
 * centred `lane` m right of the centre line) - one car at a time. Static.
 */
const bollardGate = (at, { lane = 0, gap = 4.2, width = 12 } = {}) => {
  const out = []
  const edge = width / 2 - 0.8
  for (const side of [-1, 1]) {
    for (let x = lane + side * (gap / 2 + 0.55); Math.abs(x) <= edge; x += side * 1.25) out.push({ type: 'bollard', at, lane: x })
  }
  return out
}

/** Pistons punching out of the side walls: `[at, side, phase]`. */
const pistons = (list) => list.map(([at, side, phase]) => ({ type: 'piston', at, side, phase, period: 3 }))

/**
 * Cross traffic: a two-way crossing (forklifts, or `vehicle: 'truck'` cargo trucks, out
 * of a shed on each side). `at` is the first lane; the return lane runs 7% of the piece
 * further on, half a cycle later.
 */
const crossing = (at, { interval = 3.4, speed = 5.5, phase = 0, dir = 1, vehicle } = {}) => [
  { type: 'traffic', at, dir, interval, speed, phase, vehicle },
  { type: 'traffic', at: at + 0.07, dir: -dir, interval, speed, phase: phase + interval / 2, vehicle },
]

/**
 * A row of cargo drones strafing across the road in mirror image (both in, both out),
 * so there is always a way through: at the edges when they meet, down the middle
 * when they part. On a road under 9 m that edge lane would be too narrow for a car, so
 * there it's one drone strafing across the middle, out to 2 m short of either edge: pass
 * on the side it has left (as it crosses the middle there's ~2.4 m either side).
 */
const droneRow = (at, width, { period = 3.2, phase = 0, knock } = {}) =>
  (width < 9
    ? [{ type: 'drone', at, lane: 0, sweep: Math.round((width / 2 - 2) * 100) / 100, period, phase }]
    : [
        { type: 'drone', at, lane: -width / 4, sweep: width / 4 - 1, period, phase },
        { type: 'drone', at, lane: width / 4, sweep: width / 4 - 1, period, phase: phase + Math.PI },
      ]
  ).map((o) => (knock ? { ...o, knock } : o))

/**
 * How much longer (and, at the same slopes, higher) every straight and bend comes out than
 * its spec below: the specs read as the layout, the stretch gives each road between two
 * checkpoints about 20% more to drive. Gaps, loops, pads, plazas and round decks keep their size.
 */
const STRETCH = 1.25

/**
 * How wide every road comes out against its spec below (the builder's `widthScale`): the
 * standard 12 m road is laid 9.36 m, 16 -> 12.5, 14 -> 10.9, 11 -> 8.6, 9 -> 7. Narrow
 * enough that the obstacles bite - no room to drive round them - while a careful line
 * always gets through. Single-lane 4.2 m spots, plazas, the round decks, loops and the
 * glass flume keep their size; the cargo-door roads stay 16 m (three doors of >= 4.2 m) and
 * the turntable's gap 12 m (its deck has to bridge it). The specs read at the old widths;
 * whatever lays things out across the road (bollard rows, drones, gusts, gates, pads) is
 * given the width as built, `W(spec)`, and offsets from the centre line `X(spec)`.
 */
const WIDTH_SCALE = 0.78
const W = (w) => scaledWidth(w, WIDTH_SCALE)
const X = (x) => Math.round(x * WIDTH_SCALE * 100) / 100
/**
 * Sliding containers' `travel` on the narrowed road. They always stop 2 m or more short of
 * the curbs (room for a car beside one at the end of its slide - shoved, never pinned) and
 * leave 3.5 m or more either side as they pass the middle: `road` on the 10.9 m container
 * roads (2.7 m short, 3.5 m either side), `wide` on 12.5 m roads (2.1 m, 4.3 m).
 */
const SWEEP = { road: 1.8, wide: 4.4 }
/**
 * The rolling buoys' lanes (shares of the road width right of centre, in turn): the
 * obstacle's own, with the two near the middle moved a little off it, so on the narrowed
 * road there's always 3.7 m or more beside one.
 */
const BUOY_LANES = [-0.3, 0.25, -0.12, 0.35, -0.38, 0.14]
/**
 * The crane booms' half length on the narrowed (10.9 m) boom roads: a 4.8 m bar (it was
 * 8.4 m on the 14 m road), so as it lines up with the road there's a long enough moment
 * to go past even in the widest car - its circle still takes all but ~2 m of the road.
 */
const BOOM_HALF = 2.4

function build() {
  const b = createTrackBuilder({ id: 'sky-docks', name: 'Sky Docks', start: START_GATE, stretch: STRETCH, widthScale: WIDTH_SCALE })
  let cps = 0
  const cp = () => `Checkpoint ${(cps += 1)}`

  // 0 - Warm-up: straight off the pier into the Stunt Bowl - a round arena with two
  // kickers either side of the road and a quarter-pipe rim to ride and launch off (or
  // just drive on through) - then the sweeper deck, a long bar turning at bumper height
  // round a hub in the middle of a round platform: time it and slip past either side.
  // Then out over the water, a boost pad, long sweeping bends.
  b.straight(14, 0, { coins: { n: 2 } })
    .arena({ coins: { n: 4, from: 0.25, to: 0.75 } })
    // (The sweeper deck's run-in and run-out are the deck road's full 12 m - the lanes either
    // side of the hub, where you wait for the arm, start on them - tapering back after.)
    .straight(14, 0, { curbs: false, rawWidth: true, coins: { n: 2 } })
    .spinner()
    .straight(12, 0, { fixed: true, width: [12, 12], rawWidth: 'start' })
    .straight(60, 6, { width: [12, 16], coins: { n: 6, weave: 3 } })
    .curve(60, 45, 6, { width: 16, bank: 8, coins: { n: 6, lane: -2 } })
    .straight(50, 5, { width: 16, style: 'planks', items: 0.5 })
    .curve(-70, 45, 6, { width: [16, 12], bank: 8, coins: { n: 6 } })
    .straight(60, 6, { triggers: [{ type: 'boost', at: 0.35 }], coins: { n: 5, from: 0.5 } })
    .curve(45, 50, 4)
    .straight(60, 4, { coins: { n: 4 } })
    .straight(34, 1, { width: 12, coins: { n: 3, from: 0.2, to: 0.8 } })
    .checkpoint(cp(), 'Bollard Slalom')

  // 1 - Bollard Slalom: three fields, the last one tighter.
  b.stunt(70, 3)
  b.straight(90, 8, { obstacles: bollardField(0.2, 0.85, 3, W(12)), coins: { n: 6, weave: 3.5 } })
    .curve(90, 30, 8, { width: 14, bank: 10, coins: { n: 6 } })
    .straight(60, 6, { width: [14, 12], obstacles: bollardField(0.3, 0.8, 2, W(12)) })
    .curve(-60, 40, 6, { coins: { n: 4 } })
    .straight(80, 8, { style: 'grate', obstacles: bollardField(0.15, 0.85, 4, W(12)), coins: { n: 6, weave: 3.5 } })
    .straight(20, 2, { items: 0.5 })
    // A container gate to finish: one car at a time.
    .straight(30, 1, { coins: { n: 3, from: 0.3, to: 0.7 } })
    .checkpoint(cp(), 'Hammer Alley')

  // 2 - Hammer Alley: giant hammers swing right across the road - a row of three, then
  // two out of step with a pair of drones between them. A hit throws you off the road:
  // go while the head is up at one side.
  b.straight(36, 3, { width: 11, coins: { n: 3 } })
  b.straight(90, 10, {
    fixed: true,
    width: 11,
    style: 'planks',
    obstacles: [
      { type: 'hammer', at: 0.22, phase: 0, period: 3.2 },
      { type: 'hammer', at: 0.5, phase: 1.1, period: 3.2 },
      { type: 'hammer', at: 0.78, phase: 2.2, period: 3.2 },
    ],
    coins: { n: 7 },
  })
    .curve(-90, 34, 8, { width: 11, bank: 12, coins: { n: 6, lane: 2 } })
    .straight(70, 7, {
      fixed: true,
      width: [11, 9],
      style: 'planks',
      obstacles: [
        { type: 'hammer', at: 0.22, phase: 0.8, period: 3 },
        ...droneRow(0.5, W(10), { period: 3.4, phase: 0.5 }),
        { type: 'hammer', at: 0.8, phase: 2.6, period: 3 },
      ],
      coins: { n: 5 },
    })
    .curve(70, 40, 6, { width: [9, 12] })
    // A single-lane girder bridge (4.2 m, no curbs) up to the checkpoint.
    .squeeze(60, 6, { narrow: 4.2, open: true, items: 0.6 })
    .checkpoint(cp(), 'Container Shuffle')

  // 3 - Container Shuffle: sliding containers, then containers either side of a hammer.
  // (The containers stop ~2.7 m short of the curbs - `travel` - so they shove you about
  // rather than sweep you off. The container roads are 10.9 m, wider than the standard:
  // as one passes the middle there's 3.5 m either side, room for the widest car.)
  b.stunt(70, 3, { exitWidth: 14 })
  b.straight(100, 10, {
    width: 14,
    style: 'grate',
    obstacles: [
      { type: 'sweeper', at: 0.18, phase: 0, period: 5, travel: SWEEP.road },
      { type: 'sweeper', at: 0.42, phase: 1.8, period: 4.6, travel: SWEEP.road },
      { type: 'sweeper', at: 0.64, phase: 0.6, period: 4.2, travel: SWEEP.road },
      { type: 'sweeper', at: 0.86, phase: 2.4, period: 4.8, travel: SWEEP.road },
    ],
    coins: { n: 8, weave: 3 },
  })
    .curve(70, 30, 6, { width: 14, bank: 10, coins: { n: 5 } })
    .straight(80, 8, {
      width: 14,
      style: 'grate',
      obstacles: [
        { type: 'sweeper', at: 0.25, phase: 1, period: 4.4, travel: SWEEP.road },
        { type: 'hammer', at: 0.5, phase: 1, period: 3.2 },
        { type: 'sweeper', at: 0.75, phase: 2.2, period: 4.4, travel: SWEEP.road },
      ],
      coins: { n: 5 },
    })
    .curve(-60, 36, 5, { width: [14, 12] })
    .straight(30, 2, { items: 0.5 })
    .squeeze(42, 3, { narrow: 4.2, open: true })
    .checkpoint(cp(), 'Cargo Doors')

  // 4 - Cargo Doors: three roller doors across the road and only one is open - a
  // different one every time. Close up, the open door's lamp turns green and its
  // shutter lifts; the others just stop you dead (softly). Three gantries.
  b.straight(30, 2, { width: [12, 16], rawWidth: 'end', coins: { n: 3 } })
    .straight(70, 5, { width: 16, rawWidth: true, obstacles: [{ type: 'doors', at: 0.62 }], coins: { n: 4, from: 0.1, to: 0.4 } })
    .curve(80, 36, 6, { width: 16, rawWidth: true, bank: 8, coins: { n: 6 } })
    .straight(90, 7, {
      width: 16,
      rawWidth: true,
      style: 'grate',
      obstacles: [
        { type: 'doors', at: 0.3 },
        { type: 'doors', at: 0.82 },
      ],
      coins: { n: 3, from: 0.45, to: 0.65 },
    })
    .curve(-60, 36, 5, { width: [16, 12], rawWidth: 'start' })
    .hills(1, { items: 0.5 })
    .straight(16, 1)
    .straight(34, 1, { width: 12, coins: { n: 3, lane: -1.2, from: 0.3, to: 0.7 } })
    .checkpoint(cp(), 'Bounce Pads')

  // 5 - Bounce Pads: three trampolines over three gaps.
  b.straight(40, 3, { coins: { n: 5 }, triggers: [{ type: 'boost', at: 0.4 }] })
    .straight(20, 0, { width: 10, style: 'grate', fixed: true, triggers: [{ type: 'bounce', at: 0.75, size: [W(9), 4] }] })
    .gap(22, 4)
    .straight(30, 1, { coins: { n: 4 }, triggers: [{ type: 'boost', at: 0.3 }] })
    .straight(16, 0, { width: 10, style: 'grate', fixed: true, triggers: [{ type: 'bounce', at: 0.7, size: [W(9), 4] }] })
    .gap(20, 4)
    .straight(40, 3, { coins: { n: 4 } })
    .curve(-60, 30, 4, { bank: 10, items: 0.5 })
    .straight(30, 2, { triggers: [{ type: 'boost', at: 0.5 }] })
    .straight(16, 0, { width: 10, style: 'grate', fixed: true, triggers: [{ type: 'bounce', at: 0.7, size: [W(9), 4] }] })
    .gap(24, 5)
    .straight(40, 3, { width: [11, 12], coins: { n: 5 } })
    .straight(36, 2, { coins: { n: 3 } })
    .checkpoint(cp(), 'Driftwood Crossing')

  // 6 - Driftwood Crossing: two bridges of loose floating planks with gaps between them,
  // no curbs. The dark planks with amber side lights give under you - tilting to one
  // side or dipping, near end first - and float back up once you've gone: keep to the
  // middle and keep rolling. A fixed wooden jetty bends between the two bridges.
  const plank = (mode, side = 1) => ({ mode, side })
  const bridge1 = { 2: plank('sink'), 5: plank('tilt', -1), 8: plank('sink') }
  const bridge2 = { 1: plank('tilt', 1), 3: plank('tilt', -1), 6: plank('sink'), 8: plank('tilt', 1), 11: plank('sink') }
  b.straight(30, 1, { width: [12, 9], coins: { n: 3 } })
    .pontoons(84, 2, { width: 8.5, moving: (k) => bridge1[k] || null, coins: { n: 5 } })
    .straight(14, 0.5, { width: 9, style: 'planks', curbs: false })
    .curve(-70, 30, 3, { width: 9, style: 'planks', curbs: false, coins: { n: 4 } })
    .straight(14, 0.5, { width: 9, style: 'planks', curbs: false })
    .pontoons(96, 3, { width: 7.5, moving: (k) => bridge2[k] || null, coins: { n: 6 } })
    .straight(30, 2, { width: [9, 12], items: 0.5 })
    .curve(50, 40, 3)
    .straight(30, 2, { coins: { n: 3 } })
    .squeeze(42, 2, { narrow: 4.2, open: true, style: 'planks' })
    .checkpoint(cp(), 'Wind Tunnel')

  // 7 - Wind Tunnel: giant fans blow you across a narrower road.
  const wind1 = windZones(W(10), [
    [0.2, 1],
    [0.5, -1],
    [0.8, 1],
  ])
  const wind2 = windZones(W(9), [
    [0.25, -1],
    [0.6, 1],
    [0.85, -1],
  ])
  b.stunt(70, 3)
  b.straight(30, 2, { width: [12, 10] })
    .straight(100, 10, { width: 10, ...wind1, coins: { n: 7 } })
    .curve(80, 32, 8, { width: [10, 9], bank: 10, coins: { n: 5 } })
    .straight(90, 9, { width: 9, ...wind2, coins: { n: 6 } })
    .straight(30, 2, { items: 0.5 })
    .checkpoint(cp(), 'Forklift Crossing')

  // 8 - Forklift Crossing: forklifts, then cargo trucks, shuttle across the road between
  // two sheds, in both directions. Read the gaps - or ease off and let them pass: a hit
  // carries you off the road.
  b.straight(60, 3, { width: [12, 14], coins: { n: 3 } })
    .straight(80, 6, { fixed: true, width: 14, obstacles: [{ type: 'traffic', at: 0.55, dir: 1, interval: 3.6, speed: 5 }], coins: { n: 4, from: 0.1, to: 0.4 } })
    .curve(-80, 34, 6, { width: 14, bank: 10, coins: { n: 5 } })
    .straight(100, 8, {
      fixed: true,
      width: 14,
      style: 'grate',
      obstacles: [...crossing(0.3, { phase: 0.6 }), ...crossing(0.75, { phase: 2, dir: -1, interval: 4.4, speed: 6, vehicle: 'truck' })],
      coins: { n: 3, from: 0.45, to: 0.6 },
    })
    .curve(60, 36, 5, { width: [14, 12] })
    .squeeze(45, 3, { narrow: 4.2, open: true, items: 0.5 })
    .checkpoint(cp(), 'Crane Spinner')

  // 9 - Crane Spinner: rotating booms at road height.
  b.straight(26, 2, { width: [12, 14] })
    .straight(70, 7, {
      fixed: true,
      width: 14,
      obstacles: [
        { type: 'boom', at: 0.28, speed: 1.0, half: BOOM_HALF },
        { type: 'boom', at: 0.72, speed: -1.25, half: BOOM_HALF },
      ],
      coins: { n: 6, lane: -3.5 },
    })
    .curve(90, 32, 8, { width: 14, bank: 12, coins: { n: 6 } })
    .straight(80, 8, {
      fixed: true,
      width: 14,
      style: 'grate',
      obstacles: [
        { type: 'boom', at: 0.3, speed: 1.1, half: BOOM_HALF },
        { type: 'boom', at: 0.75, speed: -1.0, half: BOOM_HALF },
      ],
      coins: { n: 5, lane: 3.5 },
    })
    .curve(-50, 40, 4, { width: [14, 12] })
    .straight(30, 3, { items: 0.5 })
    .straight(34, 1, { width: 12, obstacles: bollardGate(0.5, { lane: X(1.2), width: W(12) }), coins: { n: 3, lane: 1.2, from: 0.3, to: 0.7 } })
    .checkpoint(cp(), 'Runaway Buoys')

  // 10 - Runaway Buoys: giant buoys roll down the hill at you, twice. (The ramps are the
  // standard road, 9.4 m, and `lanes` keeps the buoys a little off the middle: whichever
  // lane one takes there's 3.7 m or more to go past it.)
  b.straight(110, 16, {
    width: [15, 12],
    obstacles: [{ type: 'buoys', lanes: BUOY_LANES, at: 0.98, interval: 2.4, speed: 13 }],
    coins: { n: 8, weave: 4 },
  })
    .curve(-90, 30, 6, { width: 12, bank: 12, items: 0.6 })
    .straight(80, 10, {
      width: 12,
      style: 'planks',
      obstacles: [{ type: 'buoys', lanes: BUOY_LANES, at: 0.98, interval: 2.8, speed: 12 }],
      coins: { n: 6, weave: 3 },
    })
    .curve(60, 36, 5)
    .hills(2, { coins: { n: 3 } })
    .straight(16, 1)
    .checkpoint(cp(), 'Piston Punchers')

  // 11 - Piston Punchers: hydraulic rams punch out of the side walls.
  b.stunt(70, 3)
  b.straight(100, 9, {
    style: 'grate',
    obstacles: pistons([
      [0.12, 1, 0],
      [0.35, -1, 1.6],
      [0.58, 1, 3.2],
      [0.81, -1, 4.8],
    ]),
    coins: { n: 6 },
  })
    .curve(-80, 34, 7, { width: 9, bank: 10, style: 'grate', coins: { n: 5 } })
    .straight(80, 7, {
      width: 9,
      style: 'grate',
      // Faster alternation on the narrow girder: left, right, left, right, each a
      // half-beat behind the last (never two at the same spot, so there is always a
      // way past).
      obstacles: pistons([
        [0.2, 1, 0],
        [0.4, -1, 1.5],
        [0.6, 1, 3],
        [0.8, -1, 4.5],
      ]),
      coins: { n: 5 },
    })
    .straight(30, 2, { items: 0.5 })
    .checkpoint(cp(), 'Loop the Dock')

  // 12 - Loop the Dock: boost pads into a loop - and then a bigger one.
  b.straight(50, 0, { width: [12, 11], rawWidth: 'end', triggers: [{ type: 'boost', at: 0.3 }, { type: 'boost', at: 0.85 }], coins: { n: 4 } })
    .loop(11, { width: 11, shift: 14 })
    // Out of the first loop, a pair of drones to slip past.
    .straight(40, 2, { width: [11, 12], rawWidth: 'start', obstacles: droneRow(0.65, W(12), { period: 3.4 }), coins: { n: 5 } })
    .curve(-90, 28, 8, { bank: 14, items: 0.5 })
    .straight(50, 0, { width: [12, 11], rawWidth: 'end', triggers: [{ type: 'boost', at: 0.3 }, { type: 'boost', at: 0.85 }] })
    .loop(12.5, { width: 11, shift: 14 })
    .straight(40, 3, { width: [11, 12], rawWidth: 'start', coins: { n: 5 } })
    .curve(70, 34, 6)
    .checkpoint(cp(), 'Glass Flume')

  // 13 - Glass Flume: a half-pipe under a glass roof. The walls curve up to 75 degrees,
  // so you can ride high round the banked S-bend - that's where the coins are. The ends
  // flare open; the roof is solid glass (you can't fly out).
  b.straight(30, 2, { width: [12, 7], rawWidth: 'end', curbs: false, coins: { n: 3 } })
    .straight(16, 1, { tube: { from: 15, to: 75 } })
    .straight(44, 3, { tube: { glass: true, coins: { n: 4, angle: 30 } }, triggers: [{ type: 'boost', at: 0.45 }] })
    .curve(-100, 32, 5, { bank: 18, tube: { glass: true, coins: { n: 6, angle: 55, side: 'outer' } } })
    .curve(100, 32, 5, { bank: 18, tube: { glass: true, coins: { n: 6, angle: 55, side: 'outer' } } })
    .straight(40, 2, { tube: { glass: true, coins: { n: 4, angle: 30 } } })
    .straight(16, 1, { tube: { from: 75, to: 15 } })
    .straight(30, 2, { width: [7, 12], rawWidth: 'start', curbs: false, items: 0.5 })
    .curve(-60, 36, 4, { curbs: false, coins: { n: 4 } })
    .straight(40, 3, { curbs: false, coins: { n: 3 } })
    .squeeze(40, 2, { narrow: 4.2, open: true, style: 'planks' })
    .checkpoint(cp(), 'Pipe Run')

  // 14 - Pipe Run: steel pipes come rolling down the ramp, each blocking half the road -
  // left, right, left - so you weave up between them.
  b.stunt(70, 3)
  b.straight(30, 2, { width: [12, 13] })
    .straight(110, 12, {
      width: 13,
      obstacles: [{ type: 'pipes', at: 0.98, interval: 3.8, speed: 8 }],
      coins: { n: 7, weave: 3.5 },
    })
    .curve(80, 32, 6, { width: 13, bank: 10, items: 0.6 })
    .straight(90, 11, {
      width: 13,
      style: 'planks',
      obstacles: [{ type: 'pipes', at: 0.98, interval: 3.5, speed: 8.5 }],
      coins: { n: 6, weave: 3.5 },
    })
    .curve(-60, 36, 5, { width: [13, 12] })
    .straight(30, 2)
    .checkpoint(cp(), 'Drawbridges')

  // 15 - Drawbridges & Turntables: time the bridges, ride the turning platform.
  b.straight(40, 3, { style: 'planks', coins: { n: 4 } })
    .gap(26, 0, { bridged: true, obstacles: [{ type: 'drawbridge', at: 0.5, period: 6, phase: 0 }] })
    .straight(40, 4, { style: 'planks', coins: { n: 4 } })
    .curve(-70, 34, 6, { bank: 10 })
    .straight(20, 1, { style: 'planks' })
    .gap(18, 0, { bridged: true, rawWidth: true, obstacles: [{ type: 'turntable', at: 0.5, speed: 0.6 }] })
    .straight(30, 3, { coins: { n: 3 } })
    .gap(26, 0, { bridged: true, obstacles: [{ type: 'drawbridge', at: 0.5, period: 5, phase: 3 }] })
    .straight(30, 2, { style: 'planks' })
    .squeeze(54, 4, { narrow: 4.2, open: true, items: 0.5 })
    .checkpoint(cp(), 'Garage Spiral')

  // 16 - Garage Spiral: a car-park ramp with conveyor belts running against you.
  b.straight(20, 1)
    .curve(540, 22, 30, {
      width: 11,
      bank: 6,
      coins: { n: 14, from: 0.05, to: 0.95 },
      triggers: [
        { type: 'conveyor', at: 0.3, dir: -1, size: [W(10), 16] },
        { type: 'conveyor', at: 0.7, dir: -1, size: [W(10), 16] },
      ],
    })
    .straight(60, 6, { width: [11, 12], style: 'grate', triggers: [{ type: 'conveyor', at: 0.5, dir: -1, size: [W(10), 30] }], coins: { n: 5 } })
    .curve(-60, 34, 5)
    .straight(30, 2, { items: 0.5 })
    .checkpoint(cp(), 'Ballast Run')

  // 17 - Ballast Run: a steep, narrow grating ramp with giant iron ballast balls rolling
  // down it - twice the size of the buoys and far heavier: a hit throws you back down.
  // Read which side each one takes. (The bends match the ramps' slope: no crest kinks.)
  // Both ramps are the standard road (9.4 m), the balls' lanes pushed out towards the kerbs
  // (`spread`: they overhang the edge half a metre) so each leaves 4.5 m clear on the other side.
  b.straight(30, 2, { coins: { n: 3 } })
    .straight(80, 15, {
      style: 'grate',
      obstacles: [{ type: 'buoys', heavy: true, spread: 1.2, at: 0.98, interval: 3.8, speed: 11 }],
      coins: { n: 6, weave: 3 },
    })
    .curve(-80, 30, 8, { bank: 10, items: 0.5 })
    .straight(70, 14, {
      obstacles: [{ type: 'buoys', heavy: true, spread: 1.2, at: 0.98, interval: 3.5, speed: 12 }],
      coins: { n: 5, weave: 2.5 },
    })
    .curve(60, 36, 7)
    // Through a container gate (off-centre this time) to the checkpoint.
    .straight(34, 2, { coins: { n: 3, lane: 1.6, from: 0.4, to: 0.7 } })
    .checkpoint(cp(), 'Drone Yard')

  // 18 - Drone Yard: cargo drones strafe across the road at bumper height, in mirrored
  // pairs, then a pair circling over the middle.
  b.stunt(70, 3)
  b.straight(30, 2, { width: [12, 14] })
    .straight(90, 7, {
      fixed: true,
      width: 14,
      obstacles: [...droneRow(0.25, W(14)), ...droneRow(0.55, W(14), { phase: 1.6 }), ...droneRow(0.85, W(14), { period: 2.8, phase: 0.4 })],
      coins: { n: 6 },
    })
    .curve(-70, 34, 6, { width: 14, bank: 10, coins: { n: 5 } })
    .straight(80, 7, {
      fixed: true,
      width: 14,
      style: 'grate',
      obstacles: [
        { type: 'drone', at: 0.3, pattern: 'circle', radius: X(3.6), period: 4, phase: 0 },
        ...droneRow(0.55, W(14), { period: 2.6, phase: 2.2 }),
        { type: 'drone', at: 0.8, pattern: 'circle', radius: X(3.6), period: -4, phase: 1.5 },
      ],
      coins: { n: 5 },
    })
    .curve(60, 36, 5, { width: [14, 12] })
    .hills(2, { items: 0.4 })
    .straight(16, 1)
    .checkpoint(cp(), 'Lift Hop')

  // 19 - Lift Hop, then the road narrows to girders with oil spills.
  b.straight(30, 2, { coins: { n: 3 } })
    .gap(36, 0, {
      bridged: true,
      obstacles: [
        { type: 'lift', at: 0.25, phase: 0, period: 4, travel: 1.5, length: 17 },
        { type: 'lift', at: 0.75, phase: 0, period: 4, travel: 1.5, length: 17 },
      ],
    })
    .straight(45, 7, { coins: { n: 5 } })
    .curve(-70, 34, 6, { items: 0.5 })
    .straight(60, 6, { width: [10, 7], style: 'grate', triggers: [{ type: 'oil', at: 0.6, size: [X(5), 6] }], coins: { n: 5 } })
    .curve(60, 26, 6, { width: 7, style: 'grate' })
    .straight(40, 6, { width: [6, 4.2], style: 'grate', curbs: false })
    .straight(30, 4, { width: 4.2, style: 'grate', curbs: false, coins: { n: 6 } })
    .straight(30, 3, { items: 0.5 })
    .checkpoint(cp(), 'Crane Climb')

  // 20 - Crane Climb: everything at once on the way to the top - a hammer, a container,
  // rams, wind, drones and a truck crossing. (The run-in to the finish stays clear: it's
  // where this road's pearl and chest go.)
  const finalWind = windZones(W(12), [[0.85, 1]])
  // (The container's road is 10.9 m, as on Container Shuffle: room for the widest car beside it.)
  b.straight(60, 12, {
    width: 14,
    obstacles: [
      { type: 'hammer', at: 0.3, phase: 0.4, period: 3.4 },
      { type: 'sweeper', at: 0.65, phase: 1.2, period: 3, travel: SWEEP.road },
    ],
    coins: { n: 6 },
  })
    .curve(-120, 30, 14, { width: [14, 10], bank: 14, coins: { n: 8 } })
    .straight(70, 9, {
      obstacles: [
        ...pistons([
          [0.3, 1, 0],
          [0.55, -1, 1.3],
        ]),
        ...finalWind.obstacles,
      ],
      triggers: finalWind.triggers,
      coins: { n: 5 },
    })
    // Drones, then a cargo truck crossing; the boost comes after it (never fire you into it).
    .straight(50, 8, {
      obstacles: [...droneRow(0.15, W(12), { period: 3, phase: 1 }), { type: 'traffic', vehicle: 'truck', at: 0.6, dir: -1, interval: 4.6, speed: 6.5, phase: 1 }],
      triggers: [{ type: 'boost', at: 0.92 }],
    })
    .curve(90, 30, 10, { width: [12, 16], bank: 10, coins: { n: 6 } })
    .straight(40, 4, { width: 16, style: 'planks' })
    .checkpoint(cp(), 'Cargo Ladder')

  // ---- The long way up: eight more roads above Crane Climb, ending at Crane Summit. ----

  // 21 - Cargo Ladder: a switchback ladder - four tight hairpins (r 26, banked 12 deg, on a
  // 16 m road) stacked up the slope, the rungs between them at 22% and the bends at 20%
  // (no crest kinks), coins arcing along the racing line. Container traffic on the rungs and
  // spike strips on the way: one against the inside kerb at the third hairpin, others on the
  // rungs - pick the clear lane.
  b.straight(30, 3, { width: [12, 16], coins: { n: 3 } })
    .straight(40, 8.8, {
      width: 16,
      style: 'grate',
      obstacles: [{ type: 'sweeper', at: 0.55, phase: 0.5, period: 4.6, travel: SWEEP.wide }],
      coins: { n: 4, from: 0.1, to: 0.4 },
    })
    .curve(-180, 26, 16.3, { width: 16, bank: 10, chord: 1.25, style: 'grate', coins: { n: 7, lane: -4.6, arc: 9.2, from: 0.06, to: 0.94 } })
    .straight(50, 11, {
      width: 16,
      style: 'grate',
      obstacles: [{ type: 'sweeper', at: 0.7, phase: 2.4, period: 4.2, travel: SWEEP.wide }],
      spikes: [{ at: 0.3, side: -1, cover: 0.45 }],
      coins: { n: 4, from: 0.45, to: 0.9 },
    })
    .curve(180, 26, 16.3, { width: 16, bank: 10, chord: 1.25, style: 'grate', coins: { n: 7, lane: 4.6, arc: -9.2, from: 0.06, to: 0.94 } })
    .straight(50, 11, {
      width: 16,
      style: 'grate',
      obstacles: [{ type: 'hammer', at: 0.55, phase: 0.6, period: 3.4 }],
      spikes: [{ at: 0.2, side: 1, cover: 0.45 }],
      coins: { n: 4, from: 0.1, to: 0.4 },
    })
    .curve(-180, 26, 16.3, { width: 16, bank: 10, chord: 1.25, style: 'grate', spikes: [{ at: 0.5, side: 1, cover: 0.45 }], coins: { n: 7, lane: -4.6, from: 0.06, to: 0.94 } })
    .straight(50, 11, {
      width: 16,
      style: 'grate',
      obstacles: [{ type: 'sweeper', at: 0.6, phase: 1.6, period: 4.4, travel: SWEEP.wide }],
      coins: { n: 4, from: 0.1, to: 0.45 },
    })
    .curve(180, 26, 16.3, { width: 16, bank: 10, chord: 1.25, style: 'grate', coins: { n: 7, lane: 4.6, arc: -9.2, from: 0.06, to: 0.94 } })
    .straight(45, 2, { width: [16, 12], items: 0.5 })
    .squeeze(48, 8, { narrow: 4.2, open: true, style: 'grate' })
    .checkpoint(cp(), 'Wind Ridge')

  // 22 - Wind Ridge: a high crest (10 m, then 9) in a gale - gusts from alternate sides,
  // with a banked bend between the runs and a single-lane girder to finish. Keep to the
  // middle and keep your speed up: the gusts shove a slow car harder.
  const ridge1 = windZones(W(10), [
    [0.2, 1],
    [0.5, -1],
    [0.8, 1],
  ])
  const ridge2 = windZones(W(9), [
    [0.22, -1],
    [0.55, 1],
    [0.85, -1],
  ])
  b.straight(30, 2, { width: [12, 10] })
    .straight(90, 7, { width: 10, ...ridge1, coins: { n: 6 } })
    .curve(-70, 55, 5, { width: [10, 9], bank: 12, coins: { n: 5 } })
    .straight(90, 7, { width: 9, ...ridge2, coins: { n: 6 } })
    .curve(70, 55, 5, { width: [9, 12], bank: 12, coins: { n: 5 } })
    .straight(40, 4, { width: 12, items: 0.5 })
    .squeeze(42, 3, { narrow: 4.2, open: true })
    .checkpoint(cp(), 'Lighthouse Spiral')

  // 23 - Lighthouse Spiral: two full turns round a beacon tower, 24 m of climb a turn.
  // The beams sweep the road at bumper height; a pair of drones strafes on the second turn.
  b.straight(30, 2, { width: [12, 14], coins: { n: 3 } })
    .curve(720, 26, 48, {
      width: 14,
      bank: 6,
      beacon: true,
      coins: { n: 22, from: 0.04, to: 0.96 },
      obstacles: [
        { type: 'boom', at: 0.2, speed: 0.9, half: BOOM_HALF },
        { type: 'boom', at: 0.4, speed: -1.1, half: BOOM_HALF },
        // (A softer knock than the drones' usual fling: on the narrowed, banked spiral a full
        // one leaves you beached on the inside kerb.)
        ...droneRow(0.72, W(14), { period: 3.8, phase: 0.4, knock: 1.4 }),
      ],
    })
    .straight(50, 4, { width: [14, 12], items: 0.5, coins: { n: 3 }, spikes: [{ at: 0.35, side: 1, cover: 0.5 }] })
    .squeeze(42, 3, { narrow: 4.2, open: true, style: 'planks' })
    .checkpoint(cp(), 'Skyline Highway')

  // 24 - Skyline Highway: wide, fast and open - boost pads, a pair of hairpins (a U-turn and
  // back again on a 17 m road, banked 14 deg), spike strips on the straights and one big jump
  // off a trampoline. No moving obstacles; the danger is the drop.
  b.straight(30, 1, { width: [12, 17], coins: { n: 3 } })
    .straight(50, 2, { width: 17, triggers: [{ type: 'boost', at: 0.2 }, { type: 'boost', at: 0.62 }], spikes: [{ at: 0.9, side: 1, cover: 0.5 }], coins: { n: 6, weave: 3.5 } })
    .curve(170, 32, 3, { width: 17, bank: 12, chord: 1.25, coins: { n: 7, lane: 5, arc: -10, from: 0.06, to: 0.94 } })
    .straight(36, 1, { width: 17, spikes: [{ at: 0.45, side: -1, cover: 0.5 }], items: 0.5 })
    .curve(-170, 32, 3, { width: 17, bank: 12, chord: 1.25, coins: { n: 7, lane: -5, arc: 10, from: 0.06, to: 0.94 } })
    .straight(30, 1, { width: [17, 10] })
    .straight(20, 0, { width: 10, style: 'grate', fixed: true, triggers: [{ type: 'bounce', at: 0.75, size: [W(9), 4], power: 1.25 }] })
    .gap(40, 6)
    .straight(50, 2, { width: [10, 16], coins: { n: 5 } })
    .straight(20, 1, { width: [16, 12], items: 0.5 })
    .squeeze(42, 2, { narrow: 4.2, open: true })
    .checkpoint(cp(), 'Sway Bridge')

  // 25 - Sway Bridge: two long spans of loose planks hung high between towers, many of
  // them swaying - tilting to one side or sinking at the near end - with wider gaps
  // between the planks. A grating island with a bend joins the spans.
  const spanOf = (list) => {
    const m = Object.fromEntries(list)
    return (k) => m[k] || null
  }
  const spanA = spanOf([
    [2, plank('tilt', 1)],
    [5, plank('sink')],
    [9, plank('tilt', -1)],
  ])
  const spanB = spanOf([
    [3, plank('tilt', -1)],
    [7, plank('sink')],
    [11, plank('tilt', 1)],
  ])
  b.straight(30, 2, { width: [12, 9], coins: { n: 3 } })
    .pontoons(100, 4, { width: 8, gap: 1, plank: 7, moving: spanA, coins: { n: 5 } })
    .straight(16, 1, { width: 10, style: 'grate', curbs: false })
    .curve(-80, 36, 4, { width: 10, style: 'grate', curbs: false, coins: { n: 5 } })
    .straight(16, 1, { width: 10, style: 'grate', curbs: false })
    .pontoons(100, 4, { width: 7.5, gap: 1, plank: 6, moving: spanB, coins: { n: 6 } })
    .straight(30, 2, { width: [9, 12], items: 0.5 })
    .straight(30, 2, { coins: { n: 3 } })
    .squeeze(40, 2, { narrow: 4.2, open: true, style: 'planks' })
    .checkpoint(cp(), 'Lantern Gauntlet')

  // 26 - Lantern Gauntlet: hammers swing like lanterns over a plank road, with drones
  // strafing between them. Three hammer-and-drone sets, the last one the tightest.
  b.straight(30, 2, { width: [12, 11] })
    .straight(30, 3, { width: 11, items: 0.5 })
    .straight(90, 7, {
      fixed: true,
      width: 11,
      style: 'planks',
      obstacles: [
        { type: 'hammer', at: 0.2, phase: 0.4, period: 3.2 },
        ...droneRow(0.7, W(11), { period: 3.4, phase: 0.8 }),
      ],
      coins: { n: 6 },
    })
    .curve(80, 35, 5, { width: 11, bank: 10, coins: { n: 5 } })
    .straight(100, 7, {
      fixed: true,
      width: 11,
      style: 'planks',
      obstacles: [
        { type: 'hammer', at: 0.18, phase: 1.8, period: 3.1 },
        ...droneRow(0.5, W(11), { period: 3.1, phase: 0 }),
        { type: 'hammer', at: 0.82, phase: 0.2, period: 3.1 },
      ],
      coins: { n: 5 },
    })
    .curve(-70, 35, 5, { width: [11, 10], bank: 10 })
    .straight(70, 5, {
      fixed: true,
      width: 10,
      style: 'planks',
      obstacles: [
        { type: 'hammer', at: 0.2, phase: 0, period: 3 },
        { type: 'hammer', at: 0.75, phase: 1.9, period: 3 },
      ],
      coins: { n: 4 },
    })
    .straight(30, 2, { width: [10, 12], items: 0.5 })
    .straight(34, 2, { width: 12, coins: { n: 3, lane: 1.4, from: 0.3, to: 0.7 } })
    .checkpoint(cp(), 'Storm Gate')

  // 27 - Storm Gate: three sweeper decks in a row, each bar faster than the last and
  // turning the other way, with gusts on the roads between them.
  const stormWind = windZones(W(12), [
    [0.3, 1],
    [0.7, -1],
  ])
  // (Each deck's run-in and run-out are the deck road's 12 m, as on the first one.)
  b.straight(30, 1, { width: [12, 12], rawWidth: 'end' })
    .straight(14, 0, { curbs: false, fixed: true, rawWidth: true })
    .spinner({ speed: -0.9, phase: 1, coins: { n: 3, lane: 4.5, from: 0.3, to: 0.7 } })
    .straight(12, 0, { fixed: true, width: [12, 12], rawWidth: 'start' })
    .straight(44, 5, { width: 12, ...stormWind, coins: { n: 4 } })
    .straight(30, 1, { width: [12, 12], rawWidth: 'end', items: 0.5 })
    .straight(14, 0, { curbs: false, fixed: true, rawWidth: true })
    .spinner({ speed: 1.05, phase: 2.6, coins: { n: 3, lane: -4.5, from: 0.3, to: 0.7 } })
    .straight(12, 0, { fixed: true, width: [12, 12], rawWidth: 'start' })
    .curve(-70, 50, 4, { width: 12, bank: 10, coins: { n: 4 } })
    .straight(44, 5, { width: 12, coins: { n: 3 } })
    .straight(30, 1, { width: [12, 12], rawWidth: 'end', items: 0.5 })
    .straight(14, 0, { curbs: false, fixed: true, rawWidth: true })
    .spinner({ speed: -1.2, phase: 0.3, coins: { n: 3, lane: 4.5, from: 0.3, to: 0.7 } })
    .straight(50, 9, { width: [12, 12], rawWidth: 'start', coins: { n: 4 } })
    .squeeze(42, 3, { narrow: 4.2, open: true })
    .checkpoint(cp(), 'Summit Rush')

  // 28 - Summit Rush: the last push. Boost into a big loop, a long climb past rolling
  // buoys, a drone gate on the way up and a wide boulevard to the finish.
  b.straight(20, 1, { width: [12, 12] })
    .straight(44, 0, { width: [12, 11], rawWidth: 'end', triggers: [{ type: 'boost', at: 0.3 }, { type: 'boost', at: 0.85 }], coins: { n: 4 } })
    .loop(12.5, { width: 11, shift: 14 })
    .straight(30, 2, { width: [11, 12], rawWidth: 'start', coins: { n: 4 } })
    .curve(170, 30, 5, { width: [12, 16], bank: 12, chord: 1.25, items: 0.5, coins: { n: 6, lane: 4.5, arc: -9, from: 0.08, to: 0.92 } })
    .straight(90, 11, {
      width: 16,
      obstacles: [{ type: 'buoys', lanes: BUOY_LANES, at: 0.98, interval: 2.6, speed: 12 }],
      coins: { n: 6, weave: 3.5 },
    })
    .curve(-60, 50, 3, { width: [16, 12] })
    .straight(50, 4, { width: 12, obstacles: droneRow(0.5, W(12), { period: 3, phase: 1 }), coins: { n: 4 } })
    .straight(36, 1, { width: 12, coins: { n: 3, lane: -1.2, from: 0.3, to: 0.7 } })
  b.straight(50, 2, { width: [12, 18], style: 'planks', spikes: [{ at: 0.3, side: -1, cover: 0.5 }] })
    .finish('Crane Summit')

  // Ramps, star rings, a Sky Pearl and a treasure chest on every road (shared/adventure.js);
  // on the summit, the portal on to the next chapter (shared/chapters.js).
  return addExitPortal(placeAdventure(b.build()), skyDocks.next)
}

export const STAGE1 = build()
