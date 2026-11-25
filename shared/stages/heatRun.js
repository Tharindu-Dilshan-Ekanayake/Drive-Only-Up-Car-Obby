/**
 * Heat Run: a getaway across Rustport, an industrial port district on stilts north of the
 * harbour - elevated boulevards and freeways over canals and warehouse blocks, from Pier
 * Zero to the safehouse on the west docks. 11 roads (~500-800 m each), each with a
 * checkpoint plaza (a safe zone: police stop at its edge) except the last, which ends at
 * the finish. The police chase you the whole way (client: game/world/heat/), so the route
 * mixes wide roads (room for them to box you in, and for you to dodge) with tight alleys,
 * single-lane spots and tunnels where they bunch up behind you:
 *
 *  0 Getaway Ramp       off the pier, up onto the elevated boulevard
 *  1 Boulevard Breakout a 20 m boulevard: boosts, cross traffic, the first patrols
 *  2 Alley Cut          tight walled alleys zig-zagging through the blocks, spikes
 *  3 Warehouse Tunnel   two covered runs through the warehouses, pop-up bollards
 *  4 Construction Site  grating decks, sliding crates, a jump over the pit, a girder
 *  5 Rail Yard          freight carts crossing, surveillance drones, spikes
 *  6 Drawbridge         down to the canal and over two drawbridges
 *  7 River Jump         a boost and a trampoline over the river
 *  8 Parking Garage     a helix up through a car park and down its ramp
 *  9 Interchange        a fast freeway with banked hairpins
 * 10 Harbour Run        the last freeway down to the safehouse on the docks
 *
 * `stage.decor` lists path-index ranges the scenery (client world/scenery/heat.jsx) builds
 * round: tunnels, alleys, the construction site, the rail yard, canals (drawbridges and
 * the river), the garage helix and the safehouse. `stage.heat.roadblocks` are where the
 * police park a roadblock ahead of you (a few cars across part of the road, a gap left).
 *
 * Built once on load (deterministic), so the client and the server agree on everything.
 */

import { placeAdventure } from '../adventure.js'
import { START_GATE } from '../lobby.js'
import { createTrackBuilder } from '../track.js'
import { bollardField, crossing, droneRow, sweepers } from './pieces.js'

/** Pop-up bollards (the `post` obstacle) across the road: `[at, lane, phase]` each. */
const popups = (list) => list.map(([at, lane, phase]) => ({ type: 'post', at, lane, phase, period: 2.6 }))

export function build() {
  const b = createTrackBuilder({ id: 'heat-run', name: 'Heat Run', start: START_GATE })
  b.stage.sections[0].name = 'Getaway Ramp'
  let cps = 0
  const cp = () => `Checkpoint ${(cps += 1)}`
  const decor = { tunnels: [], alleys: [], construction: [], railyard: [], canals: [], garage: [], safehouse: [] }
  const from = () => b.stage.path.length
  const mark = () => b.stage.path.length - 1
  const tag = (list, f, extra = {}) => list.push({ from: f, to: mark(), ...extra })

  // 0 - Getaway Ramp: off the pier and up the on-ramp onto the elevated boulevard, a long
  // right-hander east over the canal and a left onto the first plaza.
  b.straight(30, 0, { coins: { n: 3 } })
    .straight(90, 6, { width: [12, 16], coins: { n: 5 } })
    .straight(80, 5, { width: 16, triggers: [{ type: 'boost', at: 0.4 }], coins: { n: 4, lane: -3 } })
    .curve(-90, 60, 2, { width: 16, bank: 6, coins: { n: 5, lane: 3 } })
    .straight(150, 0, { width: 16, items: 0.3, coins: { n: 6, weave: 3 } })
    .curve(90, 50, 1, { width: 16, bank: 6 })
    .straight(50, 0, { width: [16, 12] })
    .checkpoint(cp(), 'Boulevard Breakout')

  // 1 - Boulevard Breakout: a wide boulevard north and then west - boost pads, two lanes of
  // delivery trucks crossing, a spike strip - the first patrols come for you here.
  b.straight(40, 0, { width: [12, 20], coins: { n: 3 } })
    .straight(130, 2, { width: 20, triggers: [{ type: 'boost', at: 0.3, lane: -4 }, { type: 'boost', at: 0.7, lane: 4 }], coins: { n: 6, weave: 4 } })
    .curve(90, 70, 2, { width: 20, bank: 8, coins: { n: 6, lane: -4 }, items: 0.5 })
    .straight(180, 0, { width: 20, obstacles: crossing(0.45, { vehicle: 'truck', interval: 4.4, speed: 6.5, gap: 0.1 }), coins: { n: 3, from: 0.05, to: 0.25 } })
    .straight(110, 0, { width: 20, spikes: [{ at: 0.5, side: 1, cover: 0.45 }], coins: { n: 4, from: 0.7 } })
    .curve(-90, 60, 1, { width: [20, 14], bank: 6 })
    .straight(50, 0, { width: [14, 12] })
    .checkpoint(cp(), 'Alley Cut')

  // 2 - Alley Cut: walled alleys through the blocks (8 m, crash barriers), zig-zagging at
  // tight corners, a spike strip in the middle of one; out through a single-lane gap.
  b.straight(30, 0, { width: [12, 8], coins: { n: 3 } })
  let a0 = from()
  b.straight(80, 1, { width: 8, barrier: true, coins: { n: 4 } })
    .curve(-90, 18, 0, { width: 8, barrier: true, chord: 1.5 })
    .straight(80, 1, { width: 8, barrier: true, spikes: [{ at: 0.5, side: -1, cover: 0.5 }], coins: { n: 3, from: 0.7 } })
    .curve(90, 18, 0, { width: 8, barrier: true, chord: 1.5 })
    .straight(70, 1, { width: 8, barrier: true, items: 0.5 })
    .curve(90, 18, 0, { width: 8, barrier: true, chord: 1.5 })
    .straight(70, 0, { width: 8, barrier: true, coins: { n: 4 } })
    .curve(-90, 18, 0, { width: 8, barrier: true, chord: 1.5 })
    .straight(40, 0, { width: 8, barrier: true })
  tag(decor.alleys, a0)
  b.squeeze(42, 0, { narrow: 4.2, open: true })
    .straight(30, 0, { width: [8, 12] })
    .checkpoint(cp(), 'Warehouse Tunnel')

  // 3 - Warehouse Tunnel: two covered runs through the warehouse blocks with pop-up
  // bollards (rising out of the road on a timer), a right-hander between.
  b.straight(30, 0, { width: [12, 14], coins: { n: 3 } })
    .curve(-90, 50, 0, { width: 14, bank: 6, coins: { n: 5, lane: 3 } })
  let t0 = from()
  b.straight(140, 2, {
    width: 14,
    barrier: true,
    obstacles: popups([
      [0.3, -3.5, 0],
      [0.3, 3.5, 1.3],
      [0.72, 0, 0.6],
    ]),
    coins: { n: 4, from: 0.4, to: 0.55 },
  })
  tag(decor.tunnels, t0)
  b.straight(60, 0, { width: 14, items: 0.5 })
    .curve(90, 50, 0, { width: 14, bank: 6 })
  t0 = from()
  b.straight(130, 3, {
    width: 14,
    barrier: true,
    obstacles: popups([
      [0.3, 0, 0.4],
      [0.68, -3.5, 1.9],
      [0.68, 3.5, 0.6],
    ]),
    spikes: [{ at: 0.92, side: 1, cover: 0.45 }],
    coins: { n: 3, from: 0.6, to: 0.7 },
  })
  tag(decor.tunnels, t0)
  b.straight(60, 3, { width: [14, 12], coins: { n: 3 } })
    .checkpoint(cp(), 'Construction Site')

  // 4 - Construction Site: an unfinished deck - grating, sliding crates, a ramp and a jump
  // over the open pit, a single-lane girder and a field of barriers.
  b.straight(30, 0, { width: [12, 14] })
  let c0 = from()
  b.curve(-90, 40, 0, { width: 14, bank: 6, coins: { n: 4 } })
    .straight(90, 0, { width: 14, style: 'grate', obstacles: sweepers([[0.3, 0, 3.2], [0.7, 1.6, 3.4]], 4), coins: { n: 3, from: 0.45, to: 0.55 } })
    .curve(90, 40, 0, { width: 14, bank: 6, items: 0.5 })
    .straight(50, 4, { width: [14, 10], coins: { n: 3 } })
    .straight(18, 0, { width: 10, style: 'grate', triggers: [{ type: 'bounce', at: 0.72, size: [9, 4] }] })
    .gap(22, 2)
    .straight(30, 0, { width: [10, 12] })
    .squeeze(48, 0, { narrow: 4.2, open: true })
    .straight(80, 0, { width: 14, obstacles: bollardField(0.2, 0.8, 3, 14), coins: { n: 3, from: 0.85 } })
    .curve(90, 40, 0, { width: [14, 12], bank: 6 })
  tag(decor.construction, c0)
  b.straight(40, 0)
    .checkpoint(cp(), 'Rail Yard')

  // 5 - Rail Yard: over the yard - freight carts crossing on two lines, surveillance
  // drones strafing, a spike strip, then a long right-hander out.
  b.straight(30, 0, { width: [12, 16], coins: { n: 3 } })
  const r0 = from()
  b.straight(120, 0, { width: 16, obstacles: crossing(0.4, { vehicle: 'truck', interval: 4.8, speed: 7, gap: 0.12, phase: 1 }), coins: { n: 3, from: 0.05, to: 0.25 } })
    .straight(50, 0, { width: 16, spikes: [{ at: 0.5, side: -1, cover: 0.45 }] })
    .curve(-90, 50, 0, { width: 16, bank: 6, coins: { n: 5, lane: -3 } })
    .straight(90, 2, { width: 16, obstacles: droneRow(0.5, 16, { period: 3.4 }), coins: { n: 4, from: 0.75 } })
    .curve(90, 50, 0, { width: 16, bank: 6, items: 0.5 })
    .straight(90, 0, { width: 16, obstacles: crossing(0.5, { vehicle: 'truck', interval: 4.6, speed: 7, gap: 0.12, dir: -1 }), coins: { n: 3, from: 0.05, to: 0.3 } })
  tag(decor.railyard, r0)
  b.straight(30, 0, { width: [16, 12] })
    .checkpoint(cp(), 'Drawbridge')

  // 6 - Drawbridge: down off the freeway to the canal and over two drawbridges (they lift
  // and lower on a timer - time it, or wait), then back up onto the west freeway.
  b.straight(30, 0, { coins: { n: 3 } })
    .straight(150, -12, { width: [12, 14], coins: { n: 5 } })
    .curve(90, 50, -6, { width: 14, bank: 4 })
    .straight(120, -9, { width: [14, 12], coins: { n: 4 } })
  const d0 = from()
  b.straight(30, 0, { style: 'planks' })
    .gap(26, 0, { bridged: true, obstacles: [{ type: 'drawbridge', at: 0.5, period: 6, phase: 0 }] })
    .straight(40, 0, { style: 'planks', coins: { n: 3 } })
    .curve(-90, 40, 0, { bank: 4, items: 0.5 })
    .straight(30, 0, { style: 'planks' })
    .gap(26, 0, { bridged: true, obstacles: [{ type: 'drawbridge', at: 0.5, period: 5, phase: 3 }] })
    .straight(30, 0, { style: 'planks' })
  tag(decor.canals, d0, { kind: 'drawbridge' })
  b.straight(60, 5, { coins: { n: 3 } })
    .straight(20, 0)
    .curve(90, 40, 0, { bank: 6 })
    .straight(50, 0)
    .checkpoint(cp(), 'River Jump')

  // 7 - River Jump: a long run-up with boost pads to a trampoline at the river's edge and
  // a big jump over it; a banked bend, a spike strip and a squeeze to the plaza.
  b.straight(30, 0, { width: [12, 16], coins: { n: 3 } })
    .straight(120, 0, { width: 16, triggers: [{ type: 'boost', at: 0.25 }, { type: 'boost', at: 0.75 }], coins: { n: 5, weave: 3 } })
    .straight(30, 0, { width: [16, 10] })
  const j0 = from()
  b.straight(20, 0, { width: 10, style: 'grate', triggers: [{ type: 'bounce', at: 0.75, size: [9, 4], power: 1.25 }] })
    .gap(40, 0)
    .straight(40, 0, { width: [10, 16], coins: { n: 3 } })
  tag(decor.canals, j0, { kind: 'river' })
  b.curve(90, 50, 0, { width: 16, bank: 8, items: 0.5, coins: { n: 5, lane: -3 } })
    .straight(100, 0, { width: 16, spikes: [{ at: 0.4, side: 1, cover: 0.45 }], coins: { n: 4, from: 0.6 } })
    .curve(-90, 50, 0, { width: [16, 12], bank: 6 })
    .squeeze(42, 0, { narrow: 4.2, open: true })
    .checkpoint(cp(), 'Parking Garage')

  // 8 - Parking Garage: one and a half turns up the car park's helix, across the roof
  // (pop-up bollards) and down the exit ramp.
  b.straight(40, 0, { coins: { n: 3 } })
    .straight(30, 2.7)
  const g0 = from()
  b.curve(-360, 24, 14, { width: 12, bank: 6, coins: { n: 10, from: 0.05, to: 0.95 } })
  tag(decor.garage, g0)
  b.straight(30, 0, { width: [12, 14] })
    .straight(90, 0, { width: 14, obstacles: popups([[0.3, -3.5, 0], [0.3, 3.5, 1.3], [0.65, 0, 0.7]]), items: 0.85, coins: { n: 3, from: 0.4, to: 0.5 } })
    .straight(130, -12, { width: 14, coins: { n: 5 } })
    .straight(40, 0, { width: [14, 12] })
    .checkpoint(cp(), 'Interchange')

  // 9 - Interchange: a fast freeway - boost pads, two banked hairpins round the
  // interchange, trucks crossing and spikes on the straights.
  b.straight(30, 0, { width: [12, 18], coins: { n: 3 } })
    .straight(120, 0, { width: 18, triggers: [{ type: 'boost', at: 0.3 }], spikes: [{ at: 0.8, side: -1, cover: 0.45 }], coins: { n: 6, weave: 4 } })
    .curve(180, 40, 0, { width: 18, bank: 12, coins: { n: 7, lane: 5, arc: -8, from: 0.06, to: 0.94 } })
    .straight(110, 0, { width: 18, obstacles: crossing(0.5, { vehicle: 'truck', interval: 4.6, speed: 7, gap: 0.12 }), coins: { n: 3, from: 0.05, to: 0.3 } })
    .curve(-180, 40, 0, { width: 18, bank: 12, coins: { n: 7, lane: -5, arc: 8, from: 0.06, to: 0.94 } })
    .straight(110, -4, { width: 18, triggers: [{ type: 'boost', at: 0.5 }], items: 0.2, coins: { n: 4 } })
    .straight(40, 0, { width: [18, 12] })
    .checkpoint(cp(), 'Harbour Run')

  // 10 - Harbour Run: the last freeway down to the docks - boosts, a spike strip, a
  // single-lane span and the safehouse on the quay at the bottom.
  b.straight(30, 0, { width: [12, 18], coins: { n: 3 } })
    .straight(160, -6, { width: 18, triggers: [{ type: 'boost', at: 0.4 }], coins: { n: 6, weave: 4 } })
    .curve(-45, 80, -3, { width: 18, bank: 6, coins: { n: 5, lane: 4 } })
    .straight(120, -4, { width: 18, spikes: [{ at: 0.5, side: 1, cover: 0.45 }], items: 0.2, coins: { n: 4, from: 0.7 } })
    .curve(45, 80, -2, { width: 18, bank: 6 })
    .squeeze(48, -1, { narrow: 4.2, open: true })
    .straight(60, -1, { width: [12, 18], coins: { n: 4 } })
  const s0 = from()
  b.finish('Safehouse')
  tag(decor.safehouse, s0)

  const stage = b.build()
  stage.decor = decor
  stage.heat = { roadblocks: roadblocks(stage, [2, 3, 4, 6, 7, 8, 10]) }
  // Ramps, star rings, a Sky Pearl and a treasure chest on every road (shared/adventure.js).
  return placeAdventure(stage)
}

/**
 * Where the police park a roadblock: ~110 m before each of these checkpoints, on the
 * first straight, wide (>= 12 m), obstacle-free spot found walking back from there.
 * `{ pi, side }`: the path index and which side the gap is left on (+1 right, -1 left).
 */
function roadblocks(stage, cps) {
  const path = stage.path
  const near = new Set()
  for (const o of stage.obstacles) for (let k = Math.max(0, o.pi - 25); k <= Math.min(path.length - 1, o.pi + 25); k += 1) near.add(k)
  for (const t of stage.triggers) {
    let best = 0
    let bd = Infinity
    for (let k = 0; k < path.length; k += 1) {
      const d = (path[k].x - t.c[0]) ** 2 + (path[k].z - t.c[2]) ** 2
      if (d < bd) {
        bd = d
        best = k
      }
    }
    for (let k = Math.max(0, best - 15); k <= Math.min(path.length - 1, best + 15); k += 1) near.add(k)
  }
  const out = []
  cps.forEach((ci, n) => {
    const c = stage.checkpoints[ci]
    if (!c) return
    let i = path.findIndex((p) => p.s >= c.s - 110)
    for (; i > 0 && path[i].s > c.s - 260; i -= 1) {
      const p = path[i]
      const q = path[i + 6]
      if (!q || p.air || q.air || p.w < 12 || near.has(i)) continue
      // Straight and level here (a parked line looks wrong across a bend or a slope).
      if (p.fx * q.fx + p.fz * q.fz < 0.995 || Math.abs(p.fy) > 0.09) continue
      out.push({ pi: i, side: n % 2 ? 1 : -1, checkpoint: ci })
      return
    }
  })
  return out
}
