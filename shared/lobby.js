/**
 * Pier Zero: the lobby. A big concrete pier over the sea where everyone spawns, with
 * the car-spin kiosk, the garage, the leaderboards, the map portals and the Start gate
 * at its north end where the current map's road begins. Every map shares this lobby
 * (dressed in that map's sky). Same box format as the track builder (shared/track.js).
 */

import { CURB_HEIGHT } from './track.js'

export const SEA_LEVEL = 0
/** Top of the pier deck. */
export const DECK_Y = 2
export const LOBBY_HALF = 40

/** Where you appear, facing the Start gate (-Z). */
export const SPAWN = { x: 0, y: DECK_Y, z: 22, yaw: 0 }

/** Every map's stage starts here, at the pier's north edge. */
export const START_GATE = { x: 0, y: DECK_Y, z: -LOBBY_HALF, yaw: 0, width: 12 }

/**
 * Where a fall puts you before the first checkpoint: on the lobby road, a little way in
 * front of the Start gate. The room must know it as a legitimate teleport (server/src/movement.js),
 * or it refuses the jump and sends the car back to where it fell from - a loop of falls.
 */
export const START_RESPAWN = { x: START_GATE.x, y: START_GATE.y, z: START_GATE.z + 8, yaw: START_GATE.yaw }

/** Drive-in pads: park on one to open its panel. */
export const PADS = [
  { id: 'spin', label: 'CAR SPIN', x: -24, z: -4, w: 9, d: 9, color: '#ffc41f' },
  { id: 'garage', label: 'GARAGE', x: 24, z: -4, w: 9, d: 9, color: '#18c3d6' },
  { id: 'store', label: 'STORE', x: -24, z: -15, w: 9, d: 9, color: '#3fd97a' },
]

/** Parking bay size: width along the row, depth into the bay. */
export const BAY = { w: 2.9, d: 5.6 }

/**
 * Painted parking rows either side of the boulevard. Each row starts at `start` (the
 * open front edge of its first bay), runs along unit `u` for `n` bays, and its bays go
 * `v` deep (cars park nose-first towards +v).
 */
export const BAY_ROWS = [
  // West: a short row south of the map portals' apron, and the long south row.
  { start: [-9.6, -21], u: [0, 1], v: [-1, 0], n: 3 },
  { start: [-9.6, 7.5], u: [0, 1], v: [-1, 0], n: 9 },
  // East: the same, mirrored.
  { start: [9.6, -21], u: [0, 1], v: [1, 0], n: 3 },
  { start: [9.6, 7.5], u: [0, 1], v: [1, 0], n: 9 },
]

/** Centre of bay `i` in `row`, and the yaw of a car parked nose-in. */
export function bayAt(row, i) {
  const along = BAY.w * (i + 0.5)
  return {
    x: row.start[0] + row.u[0] * along + row.v[0] * (BAY.d / 2),
    z: row.start[1] + row.u[1] * along + row.v[1] * (BAY.d / 2),
    yaw: Math.atan2(-row.v[0], -row.v[1]),
  }
}

/** Cars left in the car park: [row index, bay, car id]. Solid (see PROPS). */
const PARKED_CARS = [
  [0, 1, 'hatch'],
  [1, 0, 'pickup'],
  [1, 4, 'tuktuk'],
  [1, 8, 'rally'],
  [2, 0, 'diver'],
  [3, 2, 'wheelboat'],
  [3, 5, 'buggy'],
  [3, 8, 'microcar'],
]
export const PARKED = PARKED_CARS.map(([r, i, car]) => {
  const b = bayAt(BAY_ROWS[r], i)
  const alongX = Math.abs(BAY_ROWS[r].v[0]) > 0
  return { car, ...b, hx: alongX ? 2.2 : 1.1, hz: alongX ? 1.1 : 2.2 }
})

/**
 * The map portals: big drive-in gates standing in a row with the Start gate across the
 * pier's north end, one either side of it, all facing south into the lobby: you drive
 * north onto the glowing pad under an arch to be asked whether to travel. They lead to the
 * other maps (client/src/game/portals.js fills the slots: every map but the one you're on,
 * in registry order - from Sky Docks the Grand Tour and Heat Run). `w` is the pad's depth
 * along z, `d` the opening's width along x. In front of each arch (south) lies an apron pad
 * like the Spin and Garage pads, `apron.from` to `apron.to` m south of the arch's centre
 * and `half` m either side of it: park on it (or under the arch) to be asked to travel.
 */
export const PORTAL = { w: 8, d: 8.4, post: 0.6, height: 9, apron: { from: 4.6, to: 10.6, half: 4 } }
export const PORTALS = [
  { slot: 0, x: -18.5, z: -33.5 },
  { slot: 1, x: 18.5, z: -33.5 },
]

/** The portal slot whose pad (x, z) is on, or -1. */
export function portalAt(x, z) {
  for (const p of PORTALS) {
    if (Math.abs(x - p.x) < PORTAL.d / 2 && z > p.z - PORTAL.w / 2 && z < p.z + PORTAL.apron.to) return p.slot
  }
  return -1
}

/** Giant promo billboards on two poles: centre, facing (unit, horizontal), art. */
export const PROMO_BOARDS = [
  { x: -30.5, z: -37.4, face: [0, 1], art: 'pearls', width: 8, height: 4, bottom: 7 },
  { x: 30.5, z: -37.4, face: [0, 1], art: 'rings', width: 8, height: 4, bottom: 7 },
  { x: -38.2, z: 13, face: [1, 0], art: 'tricks', width: 12, height: 6, bottom: 5 },
  { x: 38.2, z: 21, face: [-1, 0], art: 'cars', width: 12, height: 6, bottom: 5 },
]

/** A billboard's two pole positions (x, z). */
export function promoPoles(b) {
  const r = [b.face[1], -b.face[0]]
  const k = b.width * 0.36
  return [-1, 1].map((s) => [b.x + r[0] * k * s - b.face[0] * 0.5, b.z + r[1] * k * s - b.face[1] * 0.5])
}

/** Leaderboard billboards along the south rail, facing the spawn. */
export const BOARDS = [
  { id: 'altitude', x: -20, z: 37 },
  { id: 'coins', x: 0, z: 37 },
  { id: 'finishes', x: 20, z: 37 },
]

/**
 * Solid decorations on the pier (the client draws them; these are their footprints):
 * the statue and the fountain, the lamp posts, and
 * the two drive-in pavilions beside the pads. `hx/hz` are half sizes, `h` the height.
 */
export const PROPS = [
  { kind: 'statue', x: -24, z: 22, hx: 2.6, hz: 2.6, h: 1.3 },
  { kind: 'fountain', x: 24, z: 22, hx: 3.6, hz: 3.6, h: 0.8 },
  ...[0, 30].map((z) => ({ kind: 'lamp', x: -37.4, z, hx: 0.2, hz: 0.2, h: 6 })),
  ...[-30, 30].map((z) => ({ kind: 'lamp', x: 37.4, z, hx: 0.2, hz: 0.2, h: 6 })),
  { kind: 'spinKiosk', x: -31.7, z: -4, hx: 2.6, hz: 2.6, h: 4 },
  // The garage showroom: glass on the pad side (west) and the spawn side (south).
  { kind: 'garage', x: 34.1, z: -4, hx: 4.5, hz: 12, h: 7 },
  // The Dockside Store: a mini-mart facing its pad (east).
  { kind: 'store', x: -34.1, z: -15, hx: 4.5, hz: 7, h: 5.5 },
  { kind: 'cooler', x: -28.95, z: -11.9, hx: 0.45, hz: 0.9, h: 1.3 },
  { kind: 'crates', x: -28.95, z: -18.3, hx: 0.45, hz: 1.05, h: 1.7 },
  ...PARKED.map((p) => ({ kind: 'parked', x: p.x, z: p.z, hx: p.hx, hz: p.hz, h: 1.5 })),
  // The portal arches' posts (the arch itself is overhead, out of reach).
  ...PORTALS.flatMap((p) => [-1, 1].map((s) => ({ kind: 'portalPost', x: p.x + s * (PORTAL.d / 2 + PORTAL.post), z: p.z, hx: PORTAL.post, hz: PORTAL.post, h: PORTAL.height }))),
  ...PROMO_BOARDS.flatMap((b) => promoPoles(b).map(([x, z]) => ({ kind: 'pole', x, z, hx: 0.35, hz: 0.35, h: b.bottom + b.height }))),
]

const axes = { ax: [1, 0, 0], ay: [0, 1, 0], az: [0, 0, 1] }

function box(cx, cy, cz, hx, hy, hz, kind) {
  return { c: [cx, cy, cz], h: [hx, hy, hz], ...axes, kind, section: -1 }
}

/** The pier's collision/visual boxes. */
export function lobbyBoxes() {
  const L = LOBBY_HALF
  const rail = 0.9
  const t = 1.2
  const boxes = [box(0, DECK_Y - t / 2, 0, L, t / 2, L, 'deck')]
  const ry = DECK_Y + rail / 2
  // South, east and west rails.
  boxes.push(box(0, ry, L - 0.4, L, rail / 2, 0.4, 'rail'))
  // East/west rails stop short of the north/south ones (no overlapping corners).
  boxes.push(box(-L + 0.4, ry, 0, 0.4, rail / 2, L - 0.8, 'rail'))
  boxes.push(box(L - 0.4, ry, 0, 0.4, rail / 2, L - 0.8, 'rail'))
  // North rail, open in the middle where the Start road leaves.
  const gapHalf = START_GATE.width / 2
  const segHalf = (L - gapHalf) / 2
  boxes.push(box(-(gapHalf + segHalf), ry, -L + 0.4, segHalf, rail / 2, 0.4, 'rail'))
  boxes.push(box(gapHalf + segHalf, ry, -L + 0.4, segHalf, rail / 2, 0.4, 'rail'))
  // Low kerbs framing the pads, so they read as parking bays.
  for (const pad of PADS) {
    const k = CURB_HEIGHT * 0.25
    boxes.push(box(pad.x, DECK_Y + k / 2, pad.z + pad.d / 2 + 0.3, pad.w / 2 + 0.6, k / 2, 0.3, 'kerb'))
  }
  for (const p of PROPS) boxes.push(box(p.x, DECK_Y + p.h / 2, p.z, p.hx, p.h / 2, p.hz, 'prop'))
  return boxes
}

export function padAt(x, z) {
  for (const pad of PADS) {
    if (Math.abs(x - pad.x) < pad.w / 2 && Math.abs(z - pad.z) < pad.d / 2) return pad.id
  }
  return null
}

export const inLobby = (x, y, z) => Math.abs(x) <= LOBBY_HALF + 1 && Math.abs(z) <= LOBBY_HALF + 1 && y > DECK_Y - 3 && y < DECK_Y + 12
