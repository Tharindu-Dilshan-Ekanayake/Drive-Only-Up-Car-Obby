/**
 * The small, always-loaded end of the Rocket Missile item (the missiles themselves are
 * game/fx/missiles.js, a lazy chunk mounted by fx/MissileFx.jsx once the lobby is up).
 * Whatever can be hit registers a target provider here; whatever fires, burns or draws a
 * missile calls through here, so the startup bundle carries none of the flight code.
 *
 * A provider is `{ each(visit), hit(target) }`: `each` calls `visit(target)` for every
 * target that may be hit right now (alive, not respawn-protected, not in a safe zone), a
 * target being `{ pos: Vector3 (live, the car's middle), provider, ref }`; `hit` makes the
 * target burn (CPU racers: Bots.jsx; police: world/heat/policeSim.js; other players: they
 * are told by the room, missiles.js). Nothing here allocates per frame.
 */

export const hub = {
  /** (car: runtime.car) => boolean: fires a missile from the player's car. Null until loaded. */
  fire: null,
  /** (fromId, toId, you) a 'shot' from the room: draws another player's missile. */
  remoteShot: null,
  /** (pos: Vector3, seconds, follow?) flames on a burning car that follow `pos` (live). */
  ignite: null,
  /** () => counts of live missiles, flames, fireballs and glow instances (debug hooks). */
  stats: null,
  /** Target providers (an array: the flight loop walks it with an index, no iterator per frame). */
  providers: [],
}

/** Adds target provider `p`; returns the function that removes it. */
export function registerMissileTargets(p) {
  hub.providers.push(p)
  return () => {
    const i = hub.providers.indexOf(p)
    if (i >= 0) hub.providers.splice(i, 1)
  }
}

/** Sets a car on fire at `pos` (a live position) for `seconds`. A no-op until the missile chunk is loaded. */
export function ignite(pos, seconds) {
  hub.ignite?.(pos, seconds)
}
