/**
 * Headless playtest: an autopilot drives the real car physics through Stage 1 with
 * the real obstacles, and reports per section whether it got through, how long it
 * took and how often it fell. Run: node --import ./scripts/node-loader.mjs scripts/sim-drive.mjs [carId] [seconds]
 */
import { Vector3 } from 'three'

import { carById } from '@shared/cars'
import { lobbyBoxes, START_GATE } from '@shared/lobby'
import { loadStage } from '@shared/stages/index'
import { nearestSample } from '@shared/track'

import { Car } from '../src/game/physics/car.js'
import { carTuning } from '../src/game/physics/tuning.js'
import { PhysicsWorld } from '../src/game/physics/world.js'
import { createObstacles, HAMMER, hammerAngle, laserState, obstacleStaticBoxes, SPINBAR, spinbarAngle } from '../src/game/track/obstacleSim.js'

// STAGE=<map id> (shared/stages/index.js), default Sky Docks.
const STAGE = await loadStage(process.env.STAGE || 'sky-docks')

const carId = process.argv[2] || 'buggy'
// MODEL=1: tune from the car's own model (wheel radius / track / size, as the game does) instead of the defaults.
const MODEL = process.env.MODEL ? (await import('../src/game/cars/carModels.js')).getCarModel(carId) : undefined
const LIMIT = Number(process.argv[3] || 3000)
// How much wider (m, each side) and how tall the car is than the default 2.1 x 1.5 m (a monster truck needs a wider gap and a higher hammer).
const EXTRA_HALF = MODEL ? Math.max(0, MODEL.size[0] / 2 - 1.05) : 0
const CAR_HEIGHT = MODEL ? MODEL.size[1] : 1.5
const CAR_HALF_LENGTH = MODEL ? MODEL.size[2] / 2 : 2.1
const stage = STAGE
const world = new PhysicsWorld()
world.addStaticBoxes(lobbyBoxes(), 'lobby')
world.addStaticBoxes(stage.boxes, 'stage')
world.addStaticBoxes(obstacleStaticBoxes(stage), 'stage-static')
world.triggers.push(...stage.triggers.map((t) => ({ ...t })))
// Seeded, so a run is repeatable (which cargo door is open is random in the game).
let doorSeed = Number(process.env.SEED || 11)
const obstacles = createObstacles(stage, world, { random: () => ((doorSeed = (doorSeed * 48271) % 2147483647) / 2147483647) })
// Cargo door gantries: the autopilot reads which door is open straight from the sim
// (a player reads the lamps). Moving hazards it predicts: where each will be when the
// car gets there.
const doorEntries = obstacles.list.filter((e) => e.o.type === 'doors')
const PREDICTED = { forklift: 3.7, truck: 4.6, drone: 3.3, pipe: 0 }
// Swinging hammers: predicted from the swing itself (a pendulum, not a straight line).
const hammers = stage.obstacles.filter((o) => o.type === 'hammer')
// Sliding containers: predicted from their slide (a sine of the clock), like the hammers.
const sweepers = stage.obstacles.filter((o) => o.type === 'sweeper')
// Container gates (single-lane gaps between container stacks): line up with the gap.
const slots = stage.obstacles.filter((o) => o.type === 'slot')
// The sweeper deck's turning bar: wait at the edge until it will be out of the way.
const spinbars = stage.obstacles.filter((o) => o.type === 'spinbar')
// Laser gate curtains: keep out of a lane that will be lit when the car gets there.
const lasers = stage.obstacles.filter((o) => o.type === 'laser')
/** Path indices where the autopilot should take it easy (the newer obstacle kinds). */
// (Loose pontoon planks too: a player crosses the driftwood bridge at a steady pace.)
const cautious = stage.obstacles.filter((o) => ['doors', 'traffic', 'drone', 'hammer', 'pontoon', 'sweeper', 'slot', 'spinbar', 'laser'].includes(o.type)).map((o) => o.pi)
// Single-lane girders (path width under 5 m): taken steadily, like a player would.
const narrow = stage.path.map((p) => p.w < 5)

/**
 * Should the car hold back from a sweeper deck? It predicts a run across from where it is
 * now (in its lane, speeding up to ~15 m/s) and checks the bar's sweep against it. Once
 * it is on the deck it commits.
 */
function holdForBar(p, lane) {
  for (const o of spinbars) {
    const fx = -Math.sin(o.yaw)
    const fz = -Math.cos(o.yaw)
    const along0 = (p.x - o.x) * fx + (p.z - o.z) * fz
    const edge = -(o.reach + 2.4)
    // (Held at the deck's edge: from further back no run across fits in the bar's half turn.)
    if (along0 < edge - 12 || along0 > edge - 0.5 || Math.abs(p.y - o.y) > 6) continue
    let a = along0
    let v = Math.max(0, car.forwardSpeed)
    for (let tt = 0; tt < 8 && a < o.reach + 2.4; tt += 0.05) {
      // Speeds up to 13 m/s (the approach cap below), or coasts down to it.
      v = v < 13 ? Math.min(13, v + 8 * 0.05) : Math.max(13, v - 0.4 * 0.05)
      a += v * 0.05
      if (a < edge) continue
      const th = spinbarAngle(o, t + tt)
      const dist = Math.abs(lane * Math.sin(th) - a * Math.cos(th))
      const proj = lane * Math.cos(th) + a * Math.sin(th)
      if (dist < SPINBAR.half + 2.6 && proj > -(o.tail ?? 2) - 1.2 && proj < o.reach + 1.2) return true
    }
  }
  return false
}
/**
 * Should the car hold back from a crane boom (a bar turning about a hub in the middle of
 * the road)? As for the sweeper deck: from just before its reach it predicts its run past
 * the hub (in its lane, speeding up to ~15 m/s) and holds if the bar would sweep it. (On a
 * narrow road there's no edge lane round the bar's circle: you go as it lines up with the road.)
 */
const booms = stage.obstacles.filter((o) => o.type === 'boom')
function holdForBoom(p, lane) {
  for (const o of booms) {
    const half = o.half ?? Math.max(3, (o.width || 12) / 2 - 2.8)
    const fx = -Math.sin(o.yaw)
    const fz = -Math.cos(o.yaw)
    const along0 = (p.x - o.x) * fx + (p.z - o.z) * fz
    const edge = -(half + 2.4)
    if (along0 < edge - 12 || along0 > edge - 0.5 || Math.abs(p.y - o.y) > 6 || Math.abs((p.x - o.x) * fz - (p.z - o.z) * fx) > 12) continue
    let a = along0
    let v = Math.max(0, car.forwardSpeed)
    for (let tt = 0; tt < 8 && a < half + 2.4; tt += 0.05) {
      v = v < 15 ? Math.min(15, v + 8 * 0.05) : v
      a += v * 0.05
      if (a < edge) continue
      // Points along the bar (its half thickness and a margin added to the car's outline).
      const th = (t + tt) * (o.speed || 1.2)
      for (let k = -6; k <= 6; k += 1) {
        const q = (k / 6) * half
        if (Math.abs(q * Math.cos(th) - lane) < 1.05 + EXTRA_HALF + 0.55 && Math.abs(q * Math.sin(th) - a) < 2.1 + 0.55) return true
      }
    }
  }
  return false
}
/**
 * Should the car hold back from a sliding container? From 7-18 m before it, it predicts its
 * run past it (in its lane, speeding up to ~15 m/s) and holds if the container would be in
 * its lane while it's alongside - rather than charging up and swerving at the last moment.
 */
function holdForSweeper(p, lane) {
  for (const o of sweepers) {
    const fx = -Math.sin(o.yaw)
    const fz = -Math.cos(o.yaw)
    const along0 = (o.x - p.x) * fx + (o.z - p.z) * fz
    // (Not from further back: on Crane Climb that's under the hammer.)
    if (along0 < 7 || along0 > 18 || Math.abs(p.y - o.y) > 8 || Math.abs((p.x - o.x) * fz - (p.z - o.z) * fx) > 14) continue
    const travel = o.travel ?? Math.max(2, (o.width || 12) - 4)
    // Alongside: from the car's nose reaching the container's near end (3 m along) until its tail is past.
    const reach = 3 + CAR_HALF_LENGTH
    let a = 0
    let v = Math.max(0, car.forwardSpeed)
    for (let tt = 0; tt < 6 && a < along0 + reach; tt += 0.05) {
      v = v < 15 ? Math.min(15, v + 8 * 0.05) : v
      a += v * 0.05
      if (a < along0 - reach) continue
      const x = (o.lane || 0) + (travel / 2) * Math.sin((2 * Math.PI * (t + tt)) / (o.period || 3.2) + (o.phase || 0))
      if (Math.abs(x - lane) < 1.3 + 1.05 + EXTRA_HALF + 0.3) return true
    }
  }
  return false
}
/**
 * Should the car hold back from a laser gate? From 4-22 m before it, it predicts its run
 * through the curtains (in the lane it's actually in, speeding up to ~15 m/s) and holds if
 * the curtain over that lane would be lit (or about to be) while it's going through - a
 * player waits for their lane to go dark rather than weaving at the gate.
 */
function holdForLaser(p, lat) {
  for (const o of lasers) {
    const fx = -Math.sin(o.yaw)
    const fz = -Math.cos(o.yaw)
    const along0 = (o.x - p.x) * fx + (o.z - p.z) * fz
    // (o.x/z sit on the curtain's own lane: the lateral check is against the road, give or take.)
    if (along0 < 4 || along0 > 22 || Math.abs(p.y - o.y) > 8 || Math.abs((p.x - o.x) * fz - (p.z - o.z) * fx) > 14) continue
    // (Only the curtain over the lane the car is in - its centre within it: one straddling two lanes steers into one first.)
    if (Math.abs(lat - o.lane) > o.span / 2 - 0.4) continue
    let a = 0
    let v = Math.max(0, car.forwardSpeed)
    const reach = CAR_HALF_LENGTH + 0.3
    for (let tt = 0; tt < 6 && a < along0 + reach; tt += 0.05) {
      v = v < 15 ? Math.min(15, v + 8 * 0.05) : v
      a += v * 0.05
      if (a < along0 - reach) continue
      if (laserState(o, t + tt).lit) return true
    }
  }
  return false
}
/**
 * Should the car hold back from a swinging hammer? Like a player timing it: from 5-24 m
 * before the hammer it predicts its run under it (speeding up to ~15 m/s from where it is,
 * in its lane) and holds if the head would be low over its lane while it's underneath.
 * Closer than that it commits. (On a narrow road there is no lane to dodge it in.)
 */
function holdForHammer(p, lane) {
  for (const o of hammers) {
    const fx = -Math.sin(o.yaw)
    const fz = -Math.cos(o.yaw)
    const along0 = (o.x - p.x) * fx + (o.z - p.z) * fz
    // (This hammer's road: not one on a road off to the side or far above that happens to line up.)
    if (along0 < 5 || along0 > 24 || Math.abs(p.y - o.y) > 8 || Math.abs((p.x - o.x) * fz - (p.z - o.z) * fx) > 12) continue
    // Under it from the car's nose reaching the head (half 1.25 m along the road) until its tail is past.
    const reach = HAMMER.head[2] + CAR_HALF_LENGTH + 0.2
    let a = 0
    let v = Math.max(0, car.forwardSpeed)
    for (let tt = 0; tt < 6 && a < along0 + reach; tt += 0.05) {
      v = v < 15 ? Math.min(15, v + 8 * 0.05) : v
      a += v * 0.05
      if (a < along0 - reach) continue
      const th = hammerAngle(o, t + tt)
      const bottom = HAMMER.pivot - HAMMER.arm * Math.cos(th) - HAMMER.head[1] * Math.cos(th) - HAMMER.head[0] * Math.abs(Math.sin(th))
      if (bottom < Math.max(1.9, CAR_HEIGHT + 0.2) && Math.abs(-HAMMER.arm * Math.sin(th) - (lane - (o.lane || 0))) < HAMMER.head[0] + 1.5 + EXTRA_HALF) return true
    }
  }
  return false
}
// Pipe chutes: [first, last] path index. Taken slower, like a player would.
// (Rolling buoy / ballast ramps too: a player doesn't charge up one at full speed.)
const chutes = stage.obstacles.filter((o) => o.type === 'pipes' || o.type === 'buoys').map((o) => [o.piStart, o.pi])

const car = new Car(carTuning(carById(carId), MODEL))
// Static and moving blockers the autopilot steers round: { pi, lane } (lane = metres right of centre).
const blockers = stage.obstacles
  .filter((o) => ['bollard', 'post', 'boom', 'piston', 'spinbar'].includes(o.type))
  // A piston covers its own half of the road: keep to the other half.
  .map((o) => ({ pi: o.pi, lane: o.type === 'piston' ? (o.side * o.width) / 4 : o.lane || 0, type: o.type }))
// Spike strips (triggers): keep out of the strip's lane (half its span plus the car's half width and a margin).
for (const tr of stage.triggers.filter((x) => x.type === 'spikes')) {
  blockers.push({ pi: nearestSample(stage.path, tr.c[0], tr.c[1], tr.c[2]).index, lane: tr.lane, type: 'spikes', clear: tr.span / 2 + 1.9 })
}
let laneSmooth = 0
let slowFor = 0
let reverseFor = 0
let lastBackoff = -Infinity
/** How bad the best lane looked last time (very negative = everything's blocked). */
let laneDanger = 0
/** Distance (m) to the nearest predicted moving hazard that made the lane choice hard. */
let hazardAlong = Infinity
function pickLane(hintIndex) {
  laneDanger = 0
  hazardAlong = Infinity
  // A cargo door gantry ahead: line up with the open door, nothing else matters.
  for (const e of doorEntries) {
    if (e.o.pi >= hintIndex - 1 && e.o.pi <= hintIndex + 30) return e.openLane
  }
  // A container gate close ahead (or still beside the car), nothing else before it: through the gap.
  for (const o of slots) {
    if (o.pi < hintIndex - 5 || o.pi > hintIndex + 14) continue
    if (!blockers.some((b) => b.pi >= hintIndex && b.pi < o.pi)) return o.lane
  }
  // Only the next row ahead matters (the one after it gets its turn once this is passed).
  // Rolling buoys coming down: dodge the ones within ~40 m.
  const here = stage.path[hintIndex]
  const rx = Math.cos(Math.atan2(-here.fx, -here.fz))
  const rz = -Math.sin(Math.atan2(-here.fx, -here.fz))
  const rolling = []
  const carSpeed = Math.max(6, car.forwardSpeed)
  for (const b of world.dynamics) {
    if (b.c.y < -500) continue
    // (Only this road's: not one on a road far above or below, where roads cross over.)
    if (Math.abs(b.c.y - here.y) > 12) continue
    const dx = b.c.x - here.x
    const dz = b.c.z - here.z
    const along = dx * here.fx + dz * here.fz
    const lane = dx * rx + dz * rz
    if (b.kind in PREDICTED) {
      // Forklifts can still be in their shed (not solid yet) and about to roll out.
      if (b.kind !== 'forklift' && b.kind !== 'truck' && !b.enabled) continue
      // (A pipe still beside the car blocks a lane change until it's behind it.)
      if (along < (b.kind === 'pipe' ? -3.2 : -2) || along > 40) continue
      const vLat = b.vel.x * rx + b.vel.z * rz
      const vAlong = b.vel.x * here.fx + b.vel.z * here.fz
      const tArr = Math.max(0, along) / Math.max(2, carSpeed - vAlong)
      const pi = hintIndex + Math.max(1, Math.round(along / 2))
      if (b.kind === 'pipe') {
        rolling.push({ pi, lane, type: 'pipe', clear: b.h[0] + 1.5 })
      } else {
        for (const dtp of [-0.35, 0, 0.35]) rolling.push({ pi, lane: lane + vLat * Math.max(0, tArr + dtp), type: b.kind, clear: PREDICTED[b.kind], along })
      }
      continue
    }
    if (!b.enabled || !['buoy', 'ironball'].includes(b.kind)) continue
    // Iron ballast balls are bigger (r 2.4 against the buoys' 1.5): give them more room.
    if (along > 2 && along < 34) rolling.push({ pi: hintIndex + Math.round(along / 2), lane, type: 'buoy', clear: b.kind === 'ironball' ? 4.4 : undefined })
  }
  // Hammers: where the head will be (and whether it's low enough to hit) when the car
  // gets there, give or take a little.
  for (const o of hammers) {
    const along = (o.x - here.x) * here.fx + (o.z - here.z) * here.fz
    if (along < -3 || along > 40) continue
    // Only hammers on this stretch of road (not one on a road far above or off to the side).
    if (Math.abs(o.y - here.y) > 12 || Math.abs((o.x - here.x) * rx + (o.z - here.z) * rz) > 20) continue
    const tArr = Math.max(0, along) / carSpeed
    for (const dtp of [-0.4, -0.2, 0, 0.2, 0.4]) {
      const th = hammerAngle(o, t + tArr + dtp)
      const bottom = HAMMER.pivot - HAMMER.arm * Math.cos(th) - HAMMER.head[1] * Math.cos(th) - HAMMER.head[0] * Math.abs(Math.sin(th))
      if (bottom > 1.8) continue
      const lane = -HAMMER.arm * Math.sin(th)
      rolling.push({ pi: hintIndex + Math.max(1, Math.round(along / 2)), lane, type: 'hammer', clear: 3.4, along })
    }
  }
  // Containers: where each will be while the car is beside it (it's 6 m long).
  for (const o of sweepers) {
    const along = (o.x - here.x) * here.fx + (o.z - here.z) * here.fz
    if (along < -4 || along > 40) continue
    if (Math.abs(o.y - here.y) > 12 || Math.abs((o.x - here.x) * rx + (o.z - here.z) * rz) > 20) continue
    const tArr = Math.max(0, along - 3) / carSpeed
    const travel = o.travel ?? Math.max(2, (o.width || 12) - 4)
    for (const dtp of [-0.25, 0, 0.25, 0.5]) {
      const x = (travel / 2) * Math.sin((2 * Math.PI * (t + tArr + dtp)) / (o.period || 3.2) + (o.phase || 0))
      rolling.push({ pi: hintIndex + Math.max(1, Math.round(along / 2)), lane: (o.lane || 0) + x, type: 'sweeper', clear: 2.7 + EXTRA_HALF, along })
    }
  }
  // Laser curtains: a lane that will be lit (or flickering) while the car goes through it.
  for (const o of lasers) {
    const along = (o.x - here.x) * here.fx + (o.z - here.z) * here.fz
    if (along < -2 || along > 40) continue
    if (Math.abs(o.y - here.y) > 12 || Math.abs((o.x - here.x) * rx + (o.z - here.z) * rz) > 20) continue
    const tArr = Math.max(0, along) / carSpeed
    // (A flickering curtain isn't solid yet: only a lit one, give or take a moment, counts.)
    for (const dtp of [-0.3, 0, 0.35]) {
      if (laserState(o, t + tArr + dtp).lit) rolling.push({ pi: hintIndex + Math.max(1, Math.round(along / 2)), lane: o.lane, type: 'laser', clear: o.span / 2 + 1.4, along })
    }
  }
  // (A sweeper deck's hub counts from further out: the car waits for the bar ~50 m before it, already in its lane.)
  const ahead = [...rolling, ...blockers.filter((b) => b.pi >= hintIndex + 1 && b.pi <= hintIndex + (b.type === 'spinbar' ? 36 : b.type === 'spikes' ? 16 : 22))]
  // Nothing ahead: drift back towards the middle (e.g. after lining up with a cargo door).
  if (!ahead.length) return laneSmooth * 0.97
  const nextPi = Math.min(...ahead.map((b) => b.pi))
  // Pipes: also the one after next, so the car is already drifting towards its gap.
  const near = ahead.filter((b) => b.pi <= nextPi + 2 || (b.type === 'pipe' && b.pi <= nextPi + 16))
  const w = stage.path[hintIndex].w
  let best = 0
  let bestScore = -Infinity
  const span = Math.max(0, w / 2 - 2 - EXTRA_HALF)
  for (let lane = -span; lane <= span; lane += 0.5) {
    let score = -Math.abs(lane) * 0.05
    for (const b of near) {
      // A spinner's hub sits in the middle; keep to one side of it.
      const clear = b.clear ?? (b.type === 'boom' || b.type === 'spinbar' ? 4.3 : b.type === 'piston' ? 4.2 : b.type === 'buoy' ? 3.4 : 2.4)
      // A pipe blocks from its inner end right out to the wall: only its inner side is clear.
      const d = b.type === 'pipe' ? clear + (b.lane > 0 ? b.lane - b.clear - lane : lane - b.lane - b.clear) : Math.abs(lane - b.lane)
      score += Math.min(0, d - clear) * 10 / (1 + (b.pi - hintIndex) * 0.15)
    }
    if (score > bestScore) { bestScore = score; best = lane }
  }
  laneDanger = bestScore
  // Which moving hazard is making it hard (for easing off and letting it pass).
  // (Not a hammer: holdForHammer times those - creeping up under one is the worst thing to do.)
  for (const b of near) if (b.along !== undefined && b.type !== 'hammer' && Math.abs(best - b.lane) < b.clear) hazardAlong = Math.min(hazardAlong, b.along)
  return best
}
const input = { steer: 0, throttle: 1, brake: 0, nitro: false, handbrake: false }
let cp = 0
let hint = 0
let lastProgressS = 0
let lastProgressT = 0
const stats = stage.sections.map((s) => ({ name: s.name, falls: 0, time: 0, hits: 0, reached: false }))
let tricks = 0
/** The last moving obstacle that hit the car (for the VERBOSE fall log). */
let lastHit = null
const events = {
  onHit: (i, body) => {
    if (!body) return
    stats[Math.min(cp, stats.length - 1)].hits += 1
    lastHit = { kind: body.kind, t }
  },
  onTrick: () => { tricks += 1 },
}
// Deterministic pseudo-random waits after respawning, like a player pausing to time a gap.
let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
let waitFor = 0
function respawn() {
  laneSmooth = 0
  waitFor = rand() * 3
  const c = stage.checkpoints[cp]
  const r = c.respawn || c
  car.reset(r.x, r.y + 1.2, r.z, r.yaw)
  hint = nearestSample(stage.path, r.x, r.y, r.z).index
  lastProgressS = stage.path[hint].s
}
respawn()
const dt = 1 / 60
let t = 0
let sectionStart = 0
let maxSpeed = 0
const fwd = new Vector3()
while (t < LIMIT && cp < stage.checkpoints.length - 1) {
  obstacles.update(t, cp - 1, cp + 1, car.pos)
  const p = car.pos
  const ns = nearestSample(stage.path, p.x, p.y, p.z, hint)
  hint = ns.index
  const here = stage.path[hint]
  // Look ahead along the path, further at speed.
  const speed = car.vel.length()
  maxSpeed = Math.max(maxSpeed, speed)
  const ahead = here.s + 7 + speed * 0.45
  let k = hint
  while (k < stage.path.length - 1 && stage.path[k].s < ahead) k += 1
  const target = stage.path[k]
  laneSmooth += (pickLane(hint) - laneSmooth) * 0.3
  const tx = target.x + Math.cos(Math.atan2(-target.fx, -target.fz)) * laneSmooth
  const tz = target.z - Math.sin(Math.atan2(-target.fx, -target.fz)) * laneSmooth
  // Steer in the car's own frame (works upside down in the loop too).
  fwd.set(0, 0, -1).applyQuaternion(car.quat)
  const rightV = new Vector3(1, 0, 0).applyQuaternion(car.quat)
  const to = new Vector3(tx - p.x, target.y + 0.5 - p.y, tz - p.z)
  const diff = -Math.atan2(to.dot(rightV), to.dot(fwd))
  input.steer = Math.max(-1, Math.min(1, -diff * 2.2))
  // Ease off for obstacle fields, like a player would.
  const careful = blockers.some((b) => b.pi >= hint - 2 && b.pi <= hint + 18) || cautious.some((pi) => pi >= hint - 2 && pi <= hint + 20)
  // Brake for bends: how much the road turns over the next ~36 m.
  const far = stage.path[Math.min(stage.path.length - 1, hint + 18)]
  const turn = Math.acos(Math.max(-1, Math.min(1, (here.fx * far.fx + here.fz * far.fz) / (Math.hypot(here.fx, here.fz) * Math.hypot(far.fx, far.fz) || 1))))
  const inLoop = stage.path.slice(hint, hint + 20).some((s) => s.uy < 0.9)
  const bendSpeed = inLoop ? 99 : Math.max(16, 40 - turn * 22)
  const inChute = chutes.some(([a, b]) => hint >= a - 6 && hint <= b)
  const onGirder = narrow.slice(Math.max(0, hint - 2), hint + 14).some(Boolean)
  let want = Math.min(inChute ? 12 : careful || onGirder ? 15 : 99, bendSpeed)
  // A sweeper deck ahead: come up to it steadily, and if its bar would catch the car on
  // the way across, wait at the edge.
  if (spinbars.some((o) => o.pi >= hint - 8 && o.pi <= hint + 40)) want = Math.min(want, 13)
  const hy = Math.atan2(-here.fx, -here.fz)
  const carLat = (p.x - here.x) * Math.cos(hy) - (p.z - here.z) * Math.sin(hy)
  if (holdForBar(p, laneSmooth) || holdForHammer(p, laneSmooth) || holdForBoom(p, laneSmooth) || holdForLaser(p, carLat) || holdForSweeper(p, laneSmooth)) want = 0
  // No clear lane past a forklift / drone: ease off and let it go by, like a player would.
  // (Still well short of it - a container sliding across, say - wait there rather than creep
  // up to it; once within ~7 m, commit and get on past rather than dawdle beside it.)
  if (laneDanger < -6 && hazardAlong < 18 && hazardAlong > 7) want = 0
  input.throttle = car.forwardSpeed < want ? 1 : 0
  input.brake = car.forwardSpeed > want + 3 ? 1 : 0
  if (waitFor > 0) {
    waitFor -= dt
    input.throttle = 0
    input.brake = 0
    lastProgressT = t
  }
  // Wedged against something: back out, steering the other way, like a player would.
  if (car.vel.length() < 1.2 && car.grounded) slowFor += dt
  else slowFor = 0
  if (slowFor > 1.2) {
    reverseFor = 1.8
    slowFor = 0
  }
  // No headway for a while though not stopped (shoved about by a container, say): back
  // off and have another go, like a player would.
  if (t - lastProgressT > 4 && reverseFor <= 0 && waitFor <= 0 && t - lastBackoff > 5) {
    reverseFor = 1.6
    lastBackoff = t
  }
  if (reverseFor > 0) {
    reverseFor -= dt
    input.throttle = 0
    input.brake = 1
    input.steer = -input.steer
  }
  input.nitro = Math.abs(diff) < 0.08 && car.grounded > 0 && !stage.path.slice(hint, hint + 12).some((s) => s.air)
  car.update(dt, input, world, events)
  if (process.env.JUMPTRACE && here.s > 1565 && here.s < 1610 && t < 400) console.log(`t=${t.toFixed(2)} s=${here.s.toFixed(1)} y=${p.y.toFixed(2)} vy=${car.vel.y.toFixed(1)} v=${car.vel.length().toFixed(1)} g=${car.grounded} thr=${input.throttle} br=${input.brake}`)
  if (process.env.PIN && t > 16 && t < 16.1) {
    const contacts = []
    for (const s of car.t.spheres) {
      const c = s.p.clone().applyQuaternion(car.quat).add(car.pos)
      world.sphereContacts(c, s.r, (nn, d, b) => contacts.push(`[${s.p.toArray().map((v) => v.toFixed(1))}] n=${nn.toArray().map((v) => v.toFixed(2))} d=${d.toFixed(3)} ${b ? b.kind : 'static'}`))
    }
    const f = new Vector3(0, 0, -1).applyQuaternion(car.quat)
    console.log(`t=${t.toFixed(3)} vel=${car.vel.toArray().map((v) => v.toFixed(2))} fwd=${f.toArray().map((v) => v.toFixed(2))} grounded=${car.grounded} comp=${car.comp.map((c) => c.toFixed(2))} angVel=${car.angVel.toArray().map((v) => v.toFixed(2))}`)
    for (const c of contacts) console.log('   ', c)
  }
  if (process.env.TRACE && cp === Number(process.env.TRACE) && Math.round(t * 60) % 12 === 0) {
    const rx = Math.cos(Math.atan2(-here.fx, -here.fz))
    const rz = -Math.sin(Math.atan2(-here.fx, -here.fz))
    const lat = (p.x - here.x) * rx + (p.z - here.z) * rz
    // Moving hazards within 30 m: kind@along/lateral (lowercase = not solid right now).
    const movers = world.dynamics
      .filter((b) => b.c.y > -500 && b.enabled !== false && ['pipe', 'forklift', 'drone', 'ironball', 'buoy'].includes(b.kind))
      .map((b) => ({ b, along: (b.c.x - here.x) * here.fx + (b.c.z - here.z) * here.fz, lat: (b.c.x - here.x) * rx + (b.c.z - here.z) * rz }))
      .filter((m) => Math.abs(m.along) < 30)
      .map((m) => `${m.b.enabled ? m.b.kind.toUpperCase() : m.b.kind}@${m.along.toFixed(0)}/${m.lat.toFixed(1)}`)
    console.log(`t=${t.toFixed(2)} s=${here.s.toFixed(0)} lat=${lat.toFixed(2)} want=${laneSmooth.toFixed(2)} v=${car.forwardSpeed.toFixed(1)} steer=${input.steer.toFixed(2)} thr=${input.throttle} br=${input.brake} ${movers.join(' ')}`)
  }
  t += dt
  // Checkpoint crossing.
  const next = stage.checkpoints[cp + 1]
  if (here.s >= next.s - 1 && Math.hypot(p.x - next.x, p.z - next.z) < next.width && Math.abs(p.y - next.y) < 6) {
    stats[cp].time = t - sectionStart
    stats[cp].reached = true
    stats[cp].maxSpeed = maxSpeed
    cp += 1
    sectionStart = t
    maxSpeed = 0
  }
  if (here.s > lastProgressS + 2) {
    lastProgressS = here.s
    lastProgressT = t
  }
  const sec = stage.sections[Math.min(cp, stage.sections.length - 1)]
  const fell = p.y < 0.6 || p.y < sec.min[1] - 25 || ns.distSq > 30 * 30
  const stuck = t - lastProgressT > 14
  if (fell || stuck) {
    if (process.env.VERBOSE) console.log(`  ${stuck ? 'stuck' : 'fell'} cp${cp} s=${here.s.toFixed(0)} pos=${p.toArray().map((v) => v.toFixed(1))} v=${car.vel.length().toFixed(1)} grounded=${car.grounded} up.y=${new Vector3(0, 1, 0).applyQuaternion(car.quat).y.toFixed(2)} lane=${laneSmooth.toFixed(1)}${lastHit && t - lastHit.t < 4 ? ` after ${lastHit.kind} hit ${(t - lastHit.t).toFixed(1)} s ago` : ''}`)
    if (process.env.VERBOSE && stuck && !globalThis.dumped) {
      globalThis.dumped = true
      for (const s of car.t.spheres) {
        const c = s.p.clone().applyQuaternion(car.quat).add(car.pos)
        world.sphereContacts(c, s.r, (nn, d, b) => console.log('    sphere', s.p.toArray().map((v) => v.toFixed(2)), 'n', nn.toArray().map((v) => v.toFixed(2)), 'd', d.toFixed(2), b ? b.kind : 'static'))
      }
      const near = stage.obstacles.filter((o) => Math.hypot(o.x - p.x, o.z - p.z) < 6).map((o) => `${o.type}@lane${o.lane.toFixed(1)} d=${Math.hypot(o.x - p.x, o.z - p.z).toFixed(1)}`)
      console.log('    near', near, 'input', JSON.stringify(input), 'slowFor', slowFor.toFixed(2), 'rev', reverseFor.toFixed(2), 'fwdSpeed', car.forwardSpeed.toFixed(2))
    }
    stats[cp].falls += 1
    if (stuck) stats[cp].stuck = (stats[cp].stuck || 0) + 1
    if (stats[cp].falls > 25) {
      // SKIP=1: give that road up and carry on from the next checkpoint (a survey of every road).
      if (!process.env.SKIP || cp + 1 >= stage.checkpoints.length - 1) break
      cp += 1
      sectionStart = t
    }
    respawn()
    lastProgressT = t
  }
}
console.log(`car ${carId}: simulated ${t.toFixed(0)} s, reached CP ${cp}/${stage.checkpoints.length - 1}, tricks ${tricks}`)
for (const [i, s] of stats.entries()) {
  if (i > cp) break
  console.log(`  ${String(i).padStart(2)} ${s.name.padEnd(18)} ${s.reached ? 'OK ' : '-- '} time ${s.time.toFixed(1).padStart(6)} s  falls ${s.falls} (stuck ${s.stuck || 0})  hits ${s.hits}  vmax ${((s.maxSpeed || 0) * 3.6).toFixed(0)} km/h`)
}
