// Checks WHEEL_REST_LIFT (game/physics/tuning.js) against the real suspension: parks every
// car on a flat road, lets the springs settle and measures how far each wheel sits above
// its modelled centre. The sprung CarRig raises the body by that constant so the tyres stay
// under the arches; if the physics changes, this fails until the constant is updated.
//
//   cd client && node --import ./scripts/node-loader.mjs scripts/check-wheels.mjs
import { CARS } from '@shared/cars'

import { getCarModel } from '../src/game/cars/carModels.js'
import { Car } from '../src/game/physics/car.js'
import { carTuning, WHEEL_REST_LIFT } from '../src/game/physics/tuning.js'
import { PhysicsWorld } from '../src/game/physics/world.js'

const axes = { ax: [1, 0, 0], ay: [0, 1, 0], az: [0, 0, 1] }
const world = new PhysicsWorld()
world.addStaticBoxes([{ c: [0, -1, 0], h: [200, 1, 200], ...axes, kind: 'deck', section: -1 }], 'stage')
const events = { trigger() {}, onTrigger() {} }
const dt = 1 / 60
let worst = 0
for (const c of CARS) {
  const car = new Car(carTuning(c, getCarModel(c.id)))
  car.reset(0, 1, 0, 0)
  const input = { steer: 0, throttle: 0, brake: 0, nitro: false, handbrake: false }
  for (let t = 0; t < 3; t += dt) car.update(dt, input, world, events)
  for (let i = 0; i < 4; i += 1) {
    const lift = car.wheelY[i] - car.t.wheels[i].y
    worst = Math.max(worst, Math.abs(lift - WHEEL_REST_LIFT))
  }
}
console.log(`${CARS.length} cars, rest lift vs WHEEL_REST_LIFT ${WHEEL_REST_LIFT}: worst difference ${worst.toFixed(3)} m`)
if (worst > 0.025) {
  console.error('FAIL: the suspension rests at a different height - update WHEEL_REST_LIFT')
  process.exit(1)
}
console.log('OK')
