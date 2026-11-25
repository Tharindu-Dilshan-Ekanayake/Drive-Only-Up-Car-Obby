/**
 * The Rocket Missile item (client/src/game/fx/missiles.js): numbers the client that fires
 * it, the room that checks a hit between two players and the tests all share.
 *
 * A shot is two messages. 'missile' `{ to }` when it is fired (`to`: the player it is
 * homing on, '' for none): the room checks the cooldown, that the shooter isn't in a safe
 * zone or just respawned, and that the map has player-vs-player at all (shared/safeZones.js
 * pvpEnabled), remembers it and tells the cars nearby so they can draw the missile. When
 * the missile reaches the target the shooter sends 'missileHit' `{ to }`: the room accepts
 * it only for that shot (one hit per shot, within MISSILE_HIT_WINDOW_MS), with both cars
 * within MISSILE_RANGE, neither in a safe zone or protected after a respawn, and the
 * target not just burned - then forwards 'burn' to the victim (GameRoom.handleMissileHit).
 * Nothing the shooter says about a hit is trusted beyond that.
 */

/** Least time between two shots from one player (ms): the room's rate limit. */
export const MISSILE_COOLDOWN_MS = 3000
/** A 'missileHit' counts only this long after its 'missile' (ms): flight time plus lag. */
export const MISSILE_HIT_WINDOW_MS = 5000
/** The room's reach: shooter and target at most this far apart by their last poses (m). */
export const MISSILE_RANGE = 160
/** A player just burned can't be hit again for this long (ms): a pack can't juggle them. */
export const MISSILE_TARGET_COOLDOWN_MS = 4500
/** Cars within this distance of the shooter are told about the shot (m). */
export const MISSILE_SHOW_RANGE = 260

/** Flight: speed (m/s), life (s), how fast it can turn towards its target (rad/s). */
export const MISSILE_SPEED = 75
export const MISSILE_LIFE = 2.5
export const MISSILE_TURN = 3.2
/** Targeting: forward cone half angle and reach, then the rear cone's (the forward one wins). */
export const MISSILE_CONE = (35 * Math.PI) / 180
export const MISSILE_FRONT_RANGE = 140
export const MISSILE_REAR_RANGE = 70
/** It explodes when this close to a car's middle (m). */
export const MISSILE_HIT_RADIUS = 2.8
/** How long a hit car burns before it is gone / respawns (s). */
export const BURN_TIME = 1.3
