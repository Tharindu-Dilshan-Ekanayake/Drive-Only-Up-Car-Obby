import { carById } from '@shared/cars'
import { lobbyBoxes, START_GATE } from '@shared/lobby'
import { loadStage } from '@shared/stages/index'
import { Car } from '../src/game/physics/car.js'
import { carTuning } from '../src/game/physics/tuning.js'
import { PhysicsWorld } from '../src/game/physics/world.js'

// STAGE=<map id> (shared/stages/index.js), default Sky Docks.
const STAGE = await loadStage(process.env.STAGE || 'sky-docks')
const world = new PhysicsWorld()
world.addStaticBoxes(lobbyBoxes(), 'lobby')
world.addStaticBoxes(STAGE.boxes, 'stage')
const car = new Car(carTuning(carById('buggy')))
car.reset(0, 3.2, 10, 0)
const input = { steer: Number(process.argv[4] ?? 0), throttle: Number(process.argv[2] ?? 0), brake: Number(process.argv[3] ?? 0), nitro: false, handbrake: false }
for (let f = 0; f <= 240; f++) {
  car.update(1 / 60, input, world, {})
  if (f % 20 === 0) console.log(f, car.pos.toArray().map((v) => v.toFixed(2)).join(','), 'v', car.vel.toArray().map((v) => v.toFixed(2)).join(','), 'g', car.grounded, 'comp', car.comp.map((c) => c.toFixed(2)).join(','))
}
