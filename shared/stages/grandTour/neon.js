/**
 * Grand Tour, zone 1 - Neon City (night): from Pier Zero up through a night-time megacity,
 * seven roads coiling up round the downtown towers (the best of the old Neon Night City
 * map), each built round one city idea: crossing traffic, laser gates (light curtains that
 * block a lane on a timer), rooftop jumps, a loop through neon rings, single-lane (4.2 m)
 * bridges past holograms, a helix up an interchange - and then out of the city on a long
 * sky-bridge towards the mountains (the Snowy Mountain zone starts at the far end).
 *
 * The neon scenery (client/src/game/world/scenery/grandTour/neonZone.jsx) reads
 * `stage.decor.neon` (set pieces round the road, path-index ranges filled in below).
 */

import { scaledWidth } from '../../track.js'
import { crossing, droneRow, laserGate } from '../pieces.js'

/**
 * How wide this zone's roads come out against their specs below (the builder's
 * `widthScale`, shared/track.js; the same narrowing as Sky Docks): 12 m -> 9.36 m, 14 -> 10.9,
 * 16 -> 12.5. Single-lane 4.2 m spots, plazas and loops keep their size. Specs read at the old
 * widths; whatever lays things out across the road is given the width as built, `W(spec)`.
 */
const WIDTH_SCALE = 0.78
const W = (w) => scaledWidth(w, WIDTH_SCALE)

/**
 * Builds the zone's roads on builder `b`, ending at the checkpoint into the next zone (whose
 * first road is `next`); `cp()` names each checkpoint. Returns the zone's decor.
 */
export function neonZone(b, cp, next) {
  const decor = { tunnels: [], lightTunnels: [], rooftops: [], rings: [], spirals: [], bridges: [] }
  const prevScale = b.widthScale
  b.setWidthScale(WIDTH_SCALE)
  const mark = () => b.stage.path.length - 1
  const from = () => b.stage.path.length
  b.stage.sections[b.stage.sections.length - 1].name = 'Neon Strip'

  // Neon Strip: off the pier onto a wide boulevard straight into the city - boosts, a
  // long banked bend under the first towers and a single-lane bridge (4.2 m) to the first checkpoint.
  b.straight(24, 0, { coins: { n: 3 } })
    .straight(60, 4, { width: [12, 16], triggers: [{ type: 'boost', at: 0.5 }], coins: { n: 5 } })
    .straight(70, 7, { width: 16, coins: { n: 6, weave: 3.5 }, items: 0.5 })
    .straight(60, 6, { width: 16, coins: { n: 5, lane: 3 } })
    .straight(70, 5, { width: [16, 12], triggers: [{ type: 'boost', at: 0.4 }], coins: { n: 4, from: 0.6 } })
    .curve(25, 70, 3, { bank: 6, coins: { n: 4, lane: -3 } })
    .straight(40, 2, { triggers: [{ type: 'boost', at: 0.35 }] })
    .curve(85, 50, 4, { bank: 8, coins: { n: 6, lane: -3 } })
    .straight(50, 6, { items: 0.5, coins: { n: 3 } })
    .squeeze(42, 4, { narrow: 4.2, open: true })
    .checkpoint(cp(), 'Taxi Crossing')

  // Taxi Crossing: a hump, then delivery carts and trucks shuttle across the road out of
  // garages either side, in both directions - read the gaps or ease off and let them pass.
  b.hills(1, { coins: { n: 3 } })
    .straight(30, 3, { width: [12, 14], coins: { n: 3 } })
    .straight(80, 8, { fixed: true, width: 14, obstacles: [{ type: 'traffic', at: 0.55, dir: 1, interval: 3.8, speed: 5 }], coins: { n: 4, from: 0.1, to: 0.4 } })
    .curve(-50, 40, 6, { width: 14, bank: 8, coins: { n: 4 } })
    .straight(100, 10, {
      fixed: true,
      width: 14,
      obstacles: [...crossing(0.3, { phase: 0.6 }), ...crossing(0.75, { vehicle: 'truck', interval: 4.6, speed: 6, phase: 2, dir: -1 })],
      coins: { n: 3, from: 0.45, to: 0.6 },
    })
    .curve(130, 38, 12, { width: [14, 12], bank: 10, coins: { n: 6, lane: -3 } })
    .straight(50, 6, { spikes: [{ at: 0.4, side: 1, cover: 0.5 }], items: 0.6 })
    .squeeze(45, 4, { narrow: 4.2, open: true })
    .checkpoint(cp(), 'Laser Grid')

  // Laser Grid: two-lane laser gates in the open (they swap), then three-lane gates (one or
  // two lit, never all three) in a lit tunnel through the base of a tower (crash barriers).
  b.straight(30, 3, { width: [12, 14], coins: { n: 3 } })
    .straight(90, 10, { width: 14, obstacles: [...laserGate(0.3, W(14), { period: 3.2 }), ...laserGate(0.75, W(14), { period: 3.2, phase: 1.6 })], coins: { n: 4, from: 0.45, to: 0.62 } })
    // (The three-lane tunnel keeps its 15 m: each lane >= 4.2 m, one car's width.)
    .curve(100, 36, 9, { width: [14, 15], rawWidth: 'end', bank: 10, coins: { n: 6 } })
  const t0 = from()
  b.straight(90, 10, { width: 15, rawWidth: true, barrier: true, obstacles: [...laserGate(0.28, 15, { lanes: 3, period: 3.6 }), ...laserGate(0.72, 15, { lanes: 3, period: 3.6, phase: 2 })], coins: { n: 3, from: 0.42, to: 0.58 } })
  decor.tunnels.push({ from: t0, to: mark() })
  b.curve(-20, 50, 2, { width: 15, rawWidth: true })
    .straight(40, 5, { width: [15, 12], rawWidth: 'start', items: 0.5, coins: { n: 3 } })
    .squeeze(42, 4, { narrow: 4.2, open: true })
    .checkpoint(cp(), 'Rooftop Leap')

  // Rooftop Leap: out over the waterfront - a boost onto a trampoline at the edge of a
  // roof and over the gap to the next tower's rooftop, four roofs, each higher than the last.
  const roof = (len, rise, opts = {}) => {
    const r = from()
    b.straight(len, rise, { width: 16, fixed: true, ...opts })
    decor.rooftops.push({ from: r, to: mark() })
  }
  const trampoline = (gap, rise) => {
    b.straight(16, 0, { width: [16, 10], fixed: true })
    b.straight(18, 0, { width: 10, style: 'grate', fixed: true, triggers: [{ type: 'bounce', at: 0.72, size: [W(9), 4] }] })
    b.gap(gap, rise)
  }
  b.curve(90, 34, 3, { bank: 8, coins: { n: 5, lane: -3 } })
    .straight(30, 3, { width: [12, 16], coins: { n: 3 } })
  roof(46, 0, { triggers: [{ type: 'boost', at: 0.45 }], coins: { n: 3 } })
  trampoline(22, 4)
  roof(56, 1, { coins: { n: 4 }, triggers: [{ type: 'boost', at: 0.6 }] })
  trampoline(22, 4)
  roof(46, 1, { coins: { n: 3 } })
  trampoline(24, 5)
  roof(56, 1, { coins: { n: 4 } })
  b.straight(40, 5, { width: [16, 12], items: 0.5 })
    .straight(40, 5, { coins: { n: 3 } })
    .checkpoint(cp(), 'Ring Loop')

  // Ring Loop: boost pads through a row of neon rings into a loop - and then a bigger
  // one, with a drone pair between.
  b.curve(-70, 40, 2, { bank: 8, coins: { n: 4 } })
    .straight(30, 2)
  let r0 = from()
  b.straight(50, 0, { width: [12, 11], rawWidth: 'end', triggers: [{ type: 'boost', at: 0.3 }, { type: 'boost', at: 0.85 }], coins: { n: 4 } })
  decor.rings.push({ from: r0, to: mark() })
  b.loop(11, { width: 11, shift: 14 })
    .straight(40, 2, { width: [11, 12], rawWidth: 'start', coins: { n: 5 } })
    .curve(60, 30, 3, { bank: 10, items: 0.5 })
    .straight(50, 6, { obstacles: droneRow(0.45, W(12), { period: 3.4 }), coins: { n: 3, from: 0.7 } })
  r0 = from()
  b.straight(50, 0, { width: [12, 11], rawWidth: 'end', triggers: [{ type: 'boost', at: 0.3 }, { type: 'boost', at: 0.85 }] })
  decor.rings.push({ from: r0, to: mark() })
  b.loop(12.5, { width: 11, shift: 14 })
    .straight(40, 4, { width: [11, 12], rawWidth: 'start', coins: { n: 5 } })
    .curve(40, 40, 3, { bank: 8 })
    .straight(50, 8, { items: 0.5 })
    .squeeze(42, 5, { narrow: 4.2, open: true })
    .checkpoint(cp(), 'Billboard Bridges')

  // Billboard Bridges: three single-lane (4.2 m) bridges past giant holograms - one car
  // at a time, so race for the gap - with spike strips on the islands between them.
  b.straight(30, 3, { coins: { n: 3 } })
    .squeeze(48, 6, { narrow: 4.2, open: true })
    .straight(40, 4, { spikes: [{ at: 0.5, side: -1, cover: 0.5 }], coins: { n: 3 } })
    .curve(90, 34, 9, { bank: 8, coins: { n: 5 } })
    .squeeze(54, 7, { narrow: 4.2, open: true, items: 0.5 })
    .straight(40, 4, { spikes: [{ at: 0.45, side: 1, cover: 0.5 }], coins: { n: 3 } })
    .curve(20, 40, 1.5, { chord: 1.25, coins: { n: 3 } })
    .straight(40, 5, { items: 0.5 })
    .squeeze(60, 8, { narrow: 4.2, open: true })
    .straight(30, 3, { coins: { n: 3 } })
    .checkpoint(cp(), 'Interchange')

  // Interchange: a helix up through a highway interchange - one and a half turns round a
  // tower, laser gates on the way up - then out of the city on the Sky Bridge: a long
  // single span over the bay towards the mountains, the city falling away behind.
  b.straight(30, 3, { width: [12, 14], coins: { n: 3 } })
  const h0 = from()
  b.curve(540, 26, 50, {
    width: 14,
    bank: 6,
    coins: { n: 14, from: 0.05, to: 0.95 },
    obstacles: [...laserGate(0.3, W(14), { period: 3.4 }), ...laserGate(0.65, W(14), { period: 3.4, phase: 2 })],
  })
  decor.spirals.push({ from: h0, to: mark() })
  b.straight(60, 5, { width: [14, 12], items: 0.5, obstacles: [{ type: 'traffic', vehicle: 'truck', at: 0.6, dir: -1, interval: 4.6, speed: 6, phase: 1 }], coins: { n: 3, from: 0.1, to: 0.4 } })
    .curve(-60, 40, 6)
  const sb = from()
  b.straight(150, 8, { width: 12, coins: { n: 6 }, triggers: [{ type: 'boost', at: 0.2 }] })
    .straight(150, 8, { width: 12, coins: { n: 5, lane: 3 }, items: 0.5 })
    .straight(150, 8, { width: 12, coins: { n: 5, lane: -3 }, triggers: [{ type: 'boost', at: 0.5 }] })
    .straight(150, 6, { width: 12, coins: { n: 4 } })
  decor.bridges.push({ from: sb, to: mark() })
  b.checkpoint(cp(), next)
  b.setWidthScale(prevScale)
  return decor
}
