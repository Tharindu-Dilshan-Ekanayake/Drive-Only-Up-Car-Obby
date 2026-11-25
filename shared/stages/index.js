/**
 * The map registry. Every map is one stage (a deterministic track, shared/track.js) plus
 * a little data: its name, a theme the client dresses it in, and a loader.
 *
 * `STAGES` lists the registry entries (tiny, always loaded): each map's entry lives in
 * its own `<map>.meta.js` next to its stage module, so maps can be worked on without
 * touching each other:
 *
 *   { id, name, short, tagline, color, theme: { sky, track, scenery, ground }, zones?,
 *     chapter?, unlock?, next?, goal?, load }
 *
 * - `id`: the stage id (also the stage's own `id`, the Colyseus room's `stage` option and
 *   the key of the map's progress in a save, `profile.maps[id]`).
 * - `theme.sky`: a SKY_THEMES key (client/src/game/palette.js); `theme.track`: PALETTE
 *   overrides for the road (client/src/game/track/buildTrack.js); `theme.scenery`: the
 *   scenery generator (client/src/game/world/scenery/index.js); `theme.ground`: what the
 *   world stands in.
 * - `zones` (optional): a map made of zones (the Grand Tour, ./grandTour.meta.js) lists
 *   them in driving order, `{ id, name, color, sky, scenery, track }` each; every section
 *   of its stage then carries a `zone` id, and the client dresses it from that zone.
 * - `chapter` (optional): the story order, CHAPTER 1, 2... (../chapters.js); a map without
 *   one is a mode (Heat Run). `unlock: { finish: <map id> }` (optional): locked until that
 *   map is finished (../logic.js isStageUnlocked); `next`: the map the finish plaza's exit
 *   portal leads to; `goal`: the finish's name for "reach ... to unlock".
 * - `load()`: imports the stage module (its own lazy chunk in the client build) and
 *   builds it. Building costs time, so it happens once, on demand: the client builds only
 *   the map it is on, the server builds them all at startup (`loadAllStages`).
 *
 * `loadStage(id)` (async, cached) is the way to get a stage; after that `getStage(id)`
 * returns it synchronously (null until loaded).
 */

import grandTour from './grandTour.meta.js'
import heatRun from './heatRun.meta.js'
import skyDocks from './skyDocks.meta.js'

/** Where everyone starts, and what an old save's progress belongs to. */
export const DEFAULT_STAGE = 'sky-docks'

/** Two maps: Sky Docks and the Grand Tour (four zones in one map, ./grandTour.meta.js). */
export const STAGES = [skyDocks, grandTour, heatRun]
export const STAGE_IDS = STAGES.map((s) => s.id)

const BY_ID = new Map(STAGES.map((s) => [s.id, s]))

export const isStageId = (id) => typeof id === 'string' && BY_ID.has(id)
/** `id` if it names a map, else the default map. */
export const validStageId = (id) => (isStageId(id) ? id : DEFAULT_STAGE)
/** The registry entry (name, theme...) of map `id`, or null. */
export const stageInfo = (id) => BY_ID.get(id) || null

const built = new Map()
const pending = new Map()
/** Optional `(id, buildHere) => Promise<stage>`: builds stages elsewhere (the client's prep worker). */
let external = null

/**
 * The client builds stages off its main thread (client/src/game/prep/prepClient.js): `fn(id,
 * buildHere)` resolves to the same stage `loadStage` would build (`buildHere()` builds it
 * here, the fallback). The server never sets one.
 */
export function setStageLoader(fn) {
  external = fn
}

/** Builds (once) and resolves map `id`'s stage. Rejects for an unknown id. */
export function loadStage(id) {
  if (built.has(id)) return Promise.resolve(built.get(id))
  if (pending.has(id)) return pending.get(id)
  const info = BY_ID.get(id)
  if (!info) return Promise.reject(new Error(`Unknown map: ${id}`))
  const p = (external ? external(id, () => info.load()) : info.load()).then((stage) => {
    if (stage.id !== id) throw new Error(`Stage module for ${id} built '${stage.id}'`)
    built.set(id, stage)
    pending.delete(id)
    return stage
  })
  p.catch(() => pending.delete(id))
  pending.set(id, p)
  return p
}

/** Map `id`'s stage if it has been loaded (loadStage), else null. */
export const getStage = (id) => built.get(id) || null

/** Loads every map (the server, at startup). */
export const loadAllStages = () => Promise.all(STAGE_IDS.map(loadStage))
