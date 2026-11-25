import { Vector3 } from 'three'
import { lobbyBoxes } from '@shared/lobby'
import { loadStage } from '@shared/stages/index'
import { PhysicsWorld } from '../src/game/physics/world.js'

// STAGE=<map id> (shared/stages/index.js), default Sky Docks.
const STAGE = await loadStage(process.env.STAGE || 'sky-docks')
const world = new PhysicsWorld()
world.addStaticBoxes(lobbyBoxes(), 'lobby')
world.addStaticBoxes(STAGE.boxes, 'stage')
for (const z of [-39.0, -39.4, -39.8, -40.2]) {
  const c = new Vector3(0, 2.85, z)
  const n = world.gather(c.x - 0.62, c.y - 0.62, c.z - 0.62, c.x + 0.62, c.y + 0.62, c.z + 0.62)
  const hits = []
  world.sphereContacts(c, 0.62, (nn, d) => hits.push(`${nn.toArray().map((v) => v.toFixed(2))} d=${d.toFixed(3)}`))
  console.log(z, 'candidates', n, [...world.found.slice(0, n)].map((i) => world.kinds[i] + '#' + i), hits)
}
console.log(STAGE.boxes.slice(0, 3))
