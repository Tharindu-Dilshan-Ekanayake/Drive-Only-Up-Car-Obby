// Loop test: for every vertical loop in the stage, starts a car 45 m before it and
// drives it in at a capped run-in speed, then holds the throttle with the wheel straight
// through the loop (like a player holding W), with and without the run-in boost pads.
// Reports which made it round. Real car physics, real stage colliders.
//
//   cd client && node --import ./scripts/node-loader.mjs scripts/loop-test.mjs [carId]
//   STAGE=<map id> for another map; TRACE=<kmh> prints one run of the first loop.
import { Vector3 } from 'three'

import { carById } from '@shared/cars'
import { loadStage } from '@shared/stages/index'

import { Car } from '../src/game/physics/car.js'
import { carTuning } from '../src/game/physics/tuning.js'
import { PhysicsWorld } from '../src/game/physics/world.js'

const stage = await loadStage(process.env.STAGE || 'sky-docks')
const carId = process.argv[2] || 'buggy'
// MODEL=1: tune from the car's own model (wheel radius / track / size, as the game does) instead of the defaults.
const MODEL = process.env.MODEL ? (await import('../src/game/cars/carModels.js')).getCarModel(carId) : undefined

function makeWorld(boosts) {
  const world = new PhysicsWorld()
  world.addStaticBoxes(stage.boxes, 'stage')
  world.triggers.push(...stage.triggers.filter((t) => boosts || t.type !== 'boost').map((t) => ({ ...t })))
  return world
}
const worlds = { true: makeWorld(true), false: makeWorld(false) }

// A loop: a run of path samples whose forward points nearly straight up.
const loops = []
for (const p of stage.path) if (p.fy > 0.95 && !loops.some((l) => Math.abs(l.s - p.s) < 80)) loops.push(p)

const fwdOf = (p) => Math.atan2(-p.fx, -p.fz)
const events = { trigger() {}, onTrigger() {} }
const dt = 1 / 60
const _fwd = new Vector3()

function run(loop, cap, boosts, trace = false) {
  const world = worlds[boosts]
  const car = new Car(carTuning(carById(carId), MODEL))
  const start = stage.path.filter((p) => p.s <= loop.s - 45 && p.section === loop.section).pop()
  const goal = stage.path.filter((p) => p.s <= loop.s + 90).pop()
  const near = stage.path.filter((p) => p.s >= start.s - 5 && p.s <= goal.s + 20)
  car.reset(start.x, start.y + 1.2, start.z, fwdOf(start))
  const input = { steer: 0, throttle: 1, brake: 0, nitro: false, handbrake: false }
  let top = -1e9
  for (let t = 0; t < 20; t += dt) {
    const c = car.pos
    top = Math.max(top, c.y - start.y)
    const onGround = c.y < start.y + 1.5
    if (onGround) {
      let best = near[0]
      let bd = Infinity
      for (const p of near) {
        const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2
        if (d < bd) {
          bd = d
          best = p
        }
      }
      const ahead = near.find((p) => p.s >= best.s + 6) || best
      const want = Math.atan2(-(ahead.x - c.x), -(ahead.z - c.z))
      _fwd.set(0, 0, -1).applyQuaternion(car.quat)
      let diff = want - Math.atan2(-_fwd.x, -_fwd.z)
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      input.steer = Math.max(-1, Math.min(1, -diff * 2.2))
      // The run-in speed cap (a player arriving slowly); full throttle once in the loop.
      input.throttle = top < 1.5 && car.forwardSpeed * 3.6 > cap ? 0 : 1
    } else {
      input.steer = 0
      input.throttle = 1
    }
    car.update(dt, input, world, events)
    if (trace && Math.round(t / dt) % 6 === 0) console.log('   t', t.toFixed(2), 'y', (c.y - start.y).toFixed(1), 'v', (car.forwardSpeed * 3.6).toFixed(0), 'grounded', car.grounded, 'onLoop', car.onLoop)
    if (c.y < start.y - 10) return { ok: false, why: 'fell', top }
    if ((goal.x - c.x) ** 2 + (goal.z - c.z) ** 2 < 64 && Math.abs(goal.y - c.y) < 4) return { ok: true, top }
  }
  return { ok: false, why: 'stuck', top }
}

console.log(`${loops.length} loops, car ${carId}`)
if (process.env.TRACE) {
  run(loops[0], Number(process.env.TRACE), process.env.BOOSTS !== '0', true)
  process.exit(0)
}
for (const loop of loops) {
  for (const boosts of [true, false]) {
    const line = []
    for (const cap of [30, 40, 50, 60, 70, 85, 110]) {
      const r = run(loop, cap, boosts)
      line.push(`${cap}:${r.ok ? 'OK' : r.why}`)
    }
    console.log(`  loop s ${Math.round(loop.s)} (${stage.sections[loop.section]?.name}) ${boosts ? 'with boosts ' : 'no boosts   '} ${line.join('  ')}`)
  }
}
