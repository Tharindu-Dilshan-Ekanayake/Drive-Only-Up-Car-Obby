import { Vector3 } from 'three'

import { DECK_Y, lobbyBoxes, START_GATE } from '@shared/lobby'

import { PhysicsWorld } from './world'

/**
 * The one physics world the game drives in. The pier is always there; Stage 1's boxes,
 * obstacles and triggers are added by the stage chunk when it loads (and removed when
 * it unmounts). Until then a barrier closes the Start gate.
 */
export const physicsWorld = new PhysicsWorld()
physicsWorld.addStaticBoxes(lobbyBoxes(), 'lobby')

export const startBarrier = physicsWorld.addDynamic({
  type: 'box',
  c: new Vector3(START_GATE.x, DECK_Y + 1.5, START_GATE.z - 0.6),
  h: [START_GATE.width / 2, 1.5, 0.4],
  knock: 0,
  kind: 'barrier',
})
