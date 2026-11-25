import { burst } from './game/fx/fxQueue'
import { physicsWorld } from './game/physics/instance'
import { runtime } from './game/runtime'
import { carLights } from './game/fx/carLights'
import { hub as missileHub } from './game/fx/missileHub'
import { travelTo } from './game/stageRuntime'
import { night } from './game/world/nightLight'
import { actions } from './net/actions'
import { debugUnlockAll } from './net/connection'
import { applyPoseBatch, clearRemotePlayers, remotePlayers, upsertRemotePlayer } from './net/remotePlayers'
import { useGame } from './store/game'
import { useQuality } from './store/quality'

/**
 * `?debug` in the URL exposes game internals on `window.__pp` for the automated
 * perf/screenshot checks and console poking (e.g. `__pp.teleport(3)` to jump to
 * checkpoint 3). Off by default; changes nothing else.
 */
export function installDebugHooks() {
  if (typeof window === 'undefined') return
  if (!new URLSearchParams(window.location.search).has('debug')) return
  window.__pp = {
    runtime,
    useGame,
    useQuality,
    actions,
    remotePlayers,
    /** Fake other players for perf checks: upsert({ name, car, slot }), then pose bytes. */
    net: { upsertRemotePlayer, applyPoseBatch, clearRemotePlayers },
    physicsWorld,
    burst,
    /** The Rocket Missile hooks (fire, ignite, stats, target providers): game/fx/missileHub.js. */
    missileHub,
    /** Puts the car at checkpoint `index` of the current map's stage (needs it loaded). */
    teleport: async (index) => {
      const stage = useGame.getState().stage
      const cp = stage?.checkpoints[index]
      const r = cp?.respawn || cp
      if (!r) return
      runtime.race.running = true
      runtime.race.checkpoint = index
      runtime.race.runStart = runtime.race.splitStart = performance.now()
      runtime.input.teleport = { x: r.x, y: r.y + 0.8, z: r.z, yaw: r.yaw }
    },
    /** Travels to map `id` (as a lobby portal does; a locked chapter is refused). */
    travel: (id) => travelTo(id),
    /** Opens every locked chapter - OFFLINE only, in the local save (false online: no bypass there). */
    unlockAll: () => debugUnlockAll(),
    /** Night lights: how dark it is / lamps on (world/nightLight.js), last frame's batched beams / pools / glows. */
    night,
    lightCounts: () => carLights.counts(),
    lightDump: (key) => carLights.dump(key),
  }
}
