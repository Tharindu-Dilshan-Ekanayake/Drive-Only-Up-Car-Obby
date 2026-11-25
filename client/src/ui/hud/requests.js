import { runtime } from '../../game/runtime'
import { actions } from '../../net/actions'

/**
 * Requests the UI makes of the car controller, through `runtime.input` flags it clears
 * once handled.
 */

/** Respawn at the last checkpoint. */
export function requestRespawn() {
  runtime.input.respawn = true
}

/**
 * Back to Pier Zero: the run starts over. The authority resets the run (actions.restart)
 * and the car controller teleports to the lobby spawn (runtime.input.lobby).
 */
export function requestLobby() {
  actions.restart()
  runtime.input.lobby = true
}
