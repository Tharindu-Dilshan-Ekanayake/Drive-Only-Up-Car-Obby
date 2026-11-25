// Worst-case number of moving physics bodies active at once (obstacles in the active
// section window, as the game runs it), per section. Run with the node loader.
import { loadStage } from '@shared/stages/index'
import { PhysicsWorld } from '../src/game/physics/world.js'
import { createObstacles } from '../src/game/track/obstacleSim.js'

// STAGE=<map id> (shared/stages/index.js), default Sky Docks.
const STAGE = await loadStage(process.env.STAGE || 'sky-docks')

const world = new PhysicsWorld()
const sim = createObstacles(STAGE, world)
let worst = 0
const rows = []
for (let s = 0; s < STAGE.sections.length; s += 1) {
  let max = 0
  for (let t = 0; t < 12; t += 0.25) {
    sim.update(t, s - 1, s + 2)
    max = Math.max(max, world.dynamics.filter((b) => b.enabled).length)
  }
  worst = Math.max(worst, max)
  rows.push(`${s}:${max}`)
}
console.log('active obstacle bodies by section:', rows.join(' '), '| worst', worst, '| total registered', world.dynamics.length)
