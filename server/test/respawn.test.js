import assert from 'node:assert/strict'
import { test } from 'node:test'

import { START_RESPAWN, SPAWN } from '../../shared/lobby.js'
import { loadStage, STAGE_IDS } from '../../shared/stages/index.js'
import { acceptMove } from '../src/movement.js'

/**
 * A car that falls off the road must be able to respawn: the room refuses any jump no car
 * could drive unless it is a known respawn point, and answers a refused move by sending the
 * car back where it was - so a respawn the room doesn't know turns every fall into a loop of falls.
 */
for (const id of STAGE_IDS) {
  test(`${id}: every respawn a fall can use is accepted by the room`, async () => {
    const stage = await loadStage(id)
    // Somewhere far from every respawn point, e.g. the car mid-fall beside the road.
    const last = { x: 4000, y: 30, z: -4000 }
    const points = [
      ['the pier', SPAWN],
      ['the Start gate (a fall before the first checkpoint)', START_RESPAWN],
      ...stage.checkpoints.filter((c) => c.respawn).map((c, i) => [`checkpoint ${i}`, c.respawn]),
    ]
    for (const [name, p] of points) assert.ok(acceptMove(last, { x: p.x, y: p.y, z: p.z }, 1, stage), `${name} was refused`)
  })
}

test('a jump to somewhere that is not a respawn point is still refused', async () => {
  const stage = await loadStage('sky-docks')
  assert.equal(acceptMove({ x: 4000, y: 30, z: -4000 }, { x: 0, y: 2, z: -100 }, 1, stage), false)
})
