import { Vector3 } from 'three'
import { loadStage } from '@shared/stages/index'
import { lobbyBoxes } from '@shared/lobby'
import { forwardOf, rightOf } from '@shared/track'
import { PhysicsWorld } from '../src/game/physics/world.js'
import { obstacleStaticBoxes } from '../src/game/track/obstacleSim.js'

// STAGE=<map id> (shared/stages/index.js), default Sky Docks.
const S = await loadStage(process.env.STAGE || 'sky-docks')
const world = new PhysicsWorld()
world.addStaticBoxes(lobbyBoxes(), 'lobby')
world.addStaticBoxes(S.boxes, 'stage')
world.addStaticBoxes(obstacleStaticBoxes(S), 'stage-static')
const hit = { normal: new Vector3(), dist: 0 }
const o = new Vector3(), d = new Vector3(0, -1, 0)
for (const cp of S.checkpoints.slice(1, 4)) {
  const f = forwardOf(cp.yaw), r = rightOf(cp.yaw)
  let miss = 0, wrong = 0, total = 0
  const bad = []
  for (let a = -6; a <= (cp.length || 44) + 4; a += 1) for (let l = -cp.width / 2 + 1; l <= cp.width / 2 - 1; l += 1) {
    o.set(cp.x + f[0] * a + r[0] * l, cp.y + 3, cp.z + f[2] * a + r[2] * l)
    total++
    if (!world.raycast(o, d, 8, hit)) { miss++; if (a >= 0 && bad.length < 6) bad.push(`a${a} l${l}`) }
    else if (Math.abs(3 - hit.dist) > 0.15 && a >= 0 && a <= (cp.length||44)) { wrong++; if (bad.length < 12) bad.push(`a${a} l${l} h${(3-hit.dist).toFixed(2)} ${hit.kind}`) }
  }
  console.log('cp', cp.index, 'y', cp.y, 'len', cp.length, 'w', cp.width, 'miss', miss, 'wrong', wrong, '/', total, bad.join(' | '))
}
const p = S.path.find((q) => q.s > S.checkpoints[1].s - 3); console.log('path at cp1', p.y, 'cp1.y', S.checkpoints[1].y)
