// Fall check: drops a car off the side of the road at many points (several distances, both
// sides, with and without forward speed) and applies the game's fall rules (sea line, below
// the section's floor, far below the road: game/player/PlayerCar.jsx "Falls"). Reports every
// drop where the car instead comes to rest on something solid without triggering them - a
// spot where you'd fall "into the sea" and just sit there, never respawning.
//
//   cd client && node --import ./scripts/node-loader.mjs scripts/check-falls.mjs [carId]
//   STAGE=<map id> for another map; STEP=<m> spacing along the road (default 150).
import { Vector3 } from 'three'

import { carById } from '@shared/cars'
import { inLobby, lobbyBoxes } from '@shared/lobby'
import { loadStage, stageInfo } from '@shared/stages/index'
import { nearestSample } from '@shared/track'

import { Car } from '../src/game/physics/car.js'
import { carTuning } from '../src/game/physics/tuning.js'
import { PhysicsWorld } from '../src/game/physics/world.js'
import { obstacleStaticBoxes } from '../src/game/track/obstacleSim.js'

const stageId = process.env.STAGE || 'sky-docks'
const stage = await loadStage(stageId)
const carId = process.argv[2] || 'buggy'
const STEP = Number(process.env.STEP || 150)
const world = new PhysicsWorld()
world.addStaticBoxes(lobbyBoxes(), 'lobby')
world.addStaticBoxes(stage.boxes, 'stage')
world.addStaticBoxes(obstacleStaticBoxes(stage), 'stage-static')
const events = { trigger() {}, onTrigger() {} }
const dt = 1 / 60
const SEA_FALL_Y = 0.6
const FALL_BELOW_ROAD = 70
void stageInfo

// The section floors the game uses (sec.min[1]); fall back to the lowest road point of the section.
const floorOf = (i) => {
  const s = stage.sections[Math.min(i, stage.sections.length - 1)]
  if (s?.min) return s.min[1]
  let m = Infinity
  for (const p of stage.path) if (p.section === i) m = Math.min(m, p.y)
  return m
}

function under(pos) {
  _o.set(pos.x, pos.y + 1, pos.z)
  return world.raycast(_o, _d, 6, _hit) ? `'${_hit.kind || '?'}'` : 'nothing'
}

const results = { total: 0, stuck: [], fell: 0, skipped: 0 }
const _o = new Vector3()
const _d = new Vector3(0, -1, 0)
const _hit = { normal: new Vector3(), dist: 0, grip: 1, dynamic: null, kind: '' }
const path = stage.path
for (let s = 80; s < path[path.length - 1].s - 20; s += STEP) {
  const idx = path.findIndex((p) => p.s >= s)
  const p = path[idx]
  const len = Math.hypot(p.fx, p.fz) || 1
  const nx = -p.fz / len
  const nz = p.fx / len
  for (const side of [1, -1]) {
    for (const off of [7, 16, 35]) {
      for (const speed of [0, 22]) {
        // Still on the road (or its kerb): not a fall.
        if (off < (p.w || 12) / 2 + 1.5) {
          results.skipped += 1
          continue
        }
        const car = new Car(carTuning(carById(carId)))
        const x = p.x + nx * off * side
        const z = p.z + nz * off * side
        car.reset(x, p.y + 2.5, z, Math.atan2(-p.fx, -p.fz))
        if (speed) car.vel.set(p.fx * speed, 0, p.fz * speed)
        results.total += 1
        let hint = idx
        let rest = 0
        let outcome = ''
        for (let t = 0; t < 40 && !outcome; t += dt) {
          car.update(dt, { steer: 0, throttle: 0, brake: 0, nitro: false, handbrake: false }, world, events)
          const c = car.pos
          const near = nearestSample(path, c.x, c.y, c.z, hint)
          hint = near.index
          const road = path[hint]
          if (c.y < SEA_FALL_Y) outcome = 'sea'
          else if (!inLobby(c.x, c.y, c.z) && c.y < floorOf(road.section) - 30 && road.section > 0) outcome = 'floor'
          else if (!inLobby(c.x, c.y, c.z) && c.y < road.y - FALL_BELOW_ROAD) outcome = 'below road'
          rest = car.grounded >= 2 && car.vel.length() < 0.6 ? rest + dt : 0
          if (rest > 3) outcome = 'STUCK'
        }
        if (outcome === 'STUCK') {
          results.stuck.push(`s ${Math.round(p.s)} (${stage.sections[p.section]?.name}) road y ${p.y.toFixed(0)}, ${side > 0 ? 'left' : 'right'} ${off} m${speed ? ' @22 m/s' : ''} -> resting at (${car.pos.x.toFixed(0)}, ${car.pos.y.toFixed(1)}, ${car.pos.z.toFixed(0)}) on ${under(car.pos)}`)
        } else if (!outcome) results.stuck.push(`s ${Math.round(p.s)} off ${off}: still moving after 40 s (y ${car.pos.y.toFixed(0)})`)
        else results.fell += 1
      }
    }
  }
}
console.log(`${stageId}: ${results.total} drops, ${results.fell} ended in a fall (respawn), ${results.stuck.length} did not (${results.skipped} drops skipped: still on the road)`)
for (const r of results.stuck.slice(0, 40)) console.log('  ' + r)
if (results.stuck.length) process.exit(1)
void Vector3
