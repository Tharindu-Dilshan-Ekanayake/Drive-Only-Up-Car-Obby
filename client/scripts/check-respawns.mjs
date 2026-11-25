// Respawn check: puts a car at every checkpoint's respawn pose (and the Start gate's), lets it
// sit for 3 s, and reports any pose where it ends up falling (below
// the sea fall line, or well below where it was put) - a respawn that drops you straight back
// in the sea, which loops: fall, respawn, fall.
//
//   cd client && node --import ./scripts/node-loader.mjs scripts/check-respawns.mjs [carId]
//   STAGE=<map id> for another map.
import { carById } from '@shared/cars'
import { START_GATE, lobbyBoxes } from '@shared/lobby'
import { loadStage } from '@shared/stages/index'

import { Car } from '../src/game/physics/car.js'
import { carTuning } from '../src/game/physics/tuning.js'
import { PhysicsWorld } from '../src/game/physics/world.js'
import { createObstacles, obstacleStaticBoxes } from '../src/game/track/obstacleSim.js'

const stageId = process.env.STAGE || 'sky-docks'
const stage = await loadStage(stageId)
const carId = process.argv[2] || 'buggy'
const world = new PhysicsWorld()
world.addStaticBoxes(lobbyBoxes(), 'lobby')
world.addStaticBoxes(stage.boxes, 'stage')
world.addStaticBoxes(obstacleStaticBoxes(stage), 'stage-static')
world.triggers.push(...stage.triggers.map((t) => ({ ...t })))
const events = { trigger() {}, onTrigger() {} }
const SEA_FALL_Y = 0.6
const dt = 1 / 60

const poses = [{ name: 'start gate', x: START_GATE.x, y: START_GATE.y, z: START_GATE.z + 8, yaw: START_GATE.yaw }]
stage.checkpoints.forEach((cp, i) => {
  if (cp.respawn) poses.push({ name: `checkpoint ${i}`, ...cp.respawn })
})
void createObstacles

const bad = []
for (const pose of poses) {
  const car = new Car(carTuning(carById(carId)))
  car.reset(pose.x, pose.y + 0.6, pose.z, pose.yaw)
  let why = ''
  let settled = 0
  for (let t = 0; t < 3 && !why; t += dt) {
    const input = { steer: 0, throttle: 0, brake: 0, nitro: false, handbrake: false }
    car.update(dt, input, world, events)
    if (car.grounded >= 3) settled += dt
    if (car.pos.y < SEA_FALL_Y) why = 'fell into the sea'
    else if (car.pos.y < pose.y - 12) why = `fell ${Math.round(pose.y - car.pos.y)} m`
    else if (t > 1.5 && settled < 0.3) why = 'never touched ground'
  }
  if (why) bad.push(`${pose.name} (${pose.x.toFixed(0)}, ${pose.y.toFixed(1)}, ${pose.z.toFixed(0)}): ${why}`)
}
console.log(`${stageId}: ${poses.length} respawn poses, car ${carId}`)
if (bad.length) {
  console.log('PROBLEMS:')
  for (const b of bad) console.log('  ' + b)
  process.exit(1)
}
console.log('all respawns land on the road')
