import { chapterTitle, lockedMessage } from '@shared/chapters'
import { isStageUnlocked, progressOf } from '@shared/logic'
import { CARS } from '@shared/cars'
import { DEFAULT_STAGE, isStageId, loadStage, stageInfo } from '@shared/stages/index'

import { sfx } from '../audio/sfx'
import { actions } from '../net/actions'
import { getGame, useGame } from '../store/game'
import { getQuality } from '../store/quality'
import { getCarModel } from './cars/carModels'
import { clearPrebuilt } from './prep/prebuilt'
import { prebuildMap } from './prep/prepClient'
import { runtime } from './runtime'

/**
 * The current map on the client: which one you're on (`store.stageId`), its built stage
 * once loaded (`store.stage`, null while loading), and travelling between maps.
 *
 * Only the current map's stage is ever built (shared/stages/index.js loadStage imports
 * its own chunk and builds it); the lobby (Pier Zero) is the same on every map and is
 * on screen before any stage. Non-React code reads `currentStage()` (may be null: then
 * there is only the pier); components use `useCurrentStage()` / `useMapProgress()`.
 */

/** The built stage of the map you're on, or null while it loads. */
export const currentStage = () => getGame().stage

/** The current map's registry entry (name, theme...). */
export const currentStageInfo = () => stageInfo(getGame().stageId)

export const useCurrentStage = () => useGame((s) => s.stage)
export const useStageInfo = () => useGame((s) => stageInfo(s.stageId))

/** Your progress on the current map (profile.maps[stageId], or an empty stand-in). */
export const useMapProgress = () => useGame((s) => progressOf(s.profile, s.stageId))

const animationFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()))

/** Every car's model, built a few per frame (~6 ms): the CPU racers pick theirs when the stage mounts. */
async function buildCarModels(still) {
  let i = 0
  while (i < CARS.length) {
    await animationFrame()
    if (!still()) return
    const t0 = performance.now()
    while (i < CARS.length && performance.now() - t0 < 6) {
      getCarModel(CARS[i].id)
      i += 1
    }
    getGame().setTrackPrep(0.6 + (0.1 * i) / CARS.length)
  }
}

let prep = null

/**
 * Gets the current map ready in the background while you drive round the lobby (the Start
 * gate stays shut meanwhile), then publishes its stage, which mounts the stage world: the
 * stage data and the heavy geometry are built in the prep worker (game/prep), the car models
 * a few per frame here - no long frame. After the mount, StageWarmup warms it all on the GPU
 * in small batches and opens the gate. Unless you've moved on meanwhile; one at a time.
 */
export function loadCurrentStage() {
  const id = getGame().stageId
  if (prep?.id === id) return prep.promise
  const still = () => getGame().stageId === id
  const run = async () => {
    getGame().setTrackPrep(0.03)
    const stage = await loadStage(id)
    if (!still()) return null
    getGame().setTrackPrep(0.25)
    clearPrebuilt()
    await prebuildMap(stage, getQuality(), (done, total) => {
      if (still()) getGame().setTrackPrep(0.25 + (0.35 * done) / total)
    })
    if (!still()) return null
    await buildCarModels(still)
    if (!still()) return null
    const game = getGame()
    if (game.stage !== stage) game.setStage(id, stage)
    return stage
  }
  const promise = run().finally(() => {
    if (prep?.promise === promise) prep = null
  })
  prep = { id, promise }
  return promise
}

/** Set by net/connection.js: moves the player's server session to map `id`. */
let serverSwitch = () => {}
export function setServerStageSwitch(fn) {
  serverSwitch = fn
}

const nextFrame = () => new Promise((r) => setTimeout(r, 60))

/**
 * Travels to map `id` (a lobby portal): the loading screen comes up, the run ends and the
 * car goes back to the spawn, the old stage unmounts (and frees its GPU resources and
 * physics bodies), the connection moves to a room of the new map (offline: the local
 * session switches) - and the screen goes: you're in the new map's lobby. Its track is
 * then prepared in the background (loadCurrentStage) behind the shut Start gate. `fromServer`: the server already put us on that
 * map (a private code / invite led to another map's room), so don't switch rooms.
 *
 * A chapter you haven't unlocked (shared/logic.js isStageUnlocked: the Grand Tour before
 * Sky Docks is finished) is refused here with a toast - and again by the server / the
 * offline stand-in, which have the final word (stageRefused).
 */
export async function travelTo(id, { fromServer = false } = {}) {
  const game = getGame()
  if (!isStageId(id) || (id === game.stageId && !game.travel)) return
  if (!fromServer && !isStageUnlocked(game.profile, id)) {
    lockedToast(id)
    return
  }
  const from = game.stageId
  const trip = { to: id, from, progress: 0.08, id: Date.now() + Math.random() }
  game.setTravel(trip)
  game.closePanel()
  game.setFinishResult(null)
  game.setPad(null)
  // Leaving ends the run on the old map (its progress is kept, the run starts over).
  if (!fromServer) actions.restart()
  runtime.input.lobby = true
  game.setStage(id, null)
  if (!fromServer) serverSwitch(id)
  // Let the old stage unmount (and the new map's lobby theme settle) under the screen.
  await nextFrame()
  if (getGame().travel?.id !== trip.id) return
  getGame().setTravel({ ...trip, progress: 1 })
  // A fresh run on the new map.
  actions.restart()
  const to = stageInfo(id)
  setTimeout(() => {
    const g = getGame()
    if (g.travel?.id !== trip.id) return
    g.setTravel(null)
    sfx.checkpoint()
    g.showToast(chapterTitle(id) || to.name.toUpperCase(), 'success', 'Preparing the track…', to.tagline)
  }, 500)
}

function lockedToast(id) {
  sfx.error()
  getGame().showToast('LOCKED', 'error', lockedMessage(id))
}

/**
 * The server (or the offline stand-in) refused map `id`: it is still locked for this
 * profile. Says why (`text`, else the usual message) and, if we were on our way there or
 * started there (`?map=`), puts us on Sky Docks - `fromServer`: the connection is
 * already on its way to a room it may join (net/connection.js), offline it isn't.
 */
export function stageRefused(id, text, { fromServer = false } = {}) {
  sfx.error()
  getGame().showToast('LOCKED', 'error', text || lockedMessage(id))
  if (getGame().stageId === id) travelTo(DEFAULT_STAGE, { fromServer })
}

/** How long a "travel now" waits for the server to confirm an unlock it just earned. */
const UNLOCK_WAIT_MS = 6000

/**
 * Travels to map `id` as soon as it is unlocked: at once if it is, else once the
 * authority's profile says so - just after the finish that opens it, the server's
 * confirmation may still be on its way (the finish card's "travel now", the exit
 * portal). Gives up with the locked toast after UNLOCK_WAIT_MS.
 */
let unlockWait = null
export function travelWhenUnlocked(id) {
  if (isStageUnlocked(getGame().profile, id)) return travelTo(id)
  if (unlockWait) return undefined
  const stop = () => {
    unsubscribe()
    clearTimeout(timer)
    unlockWait = null
  }
  const unsubscribe = useGame.subscribe((state) => {
    if (!isStageUnlocked(state.profile, id)) return
    stop()
    if (!state.travel) travelTo(id)
  })
  const timer = setTimeout(() => {
    stop()
    lockedToast(id)
  }, UNLOCK_WAIT_MS)
  unlockWait = { id }
  return undefined
}

// A finish plaza's exit portal (ticker pad 'exit:<id>'): driving onto it travels on to
// the next chapter - at once when it is unlocked, or the moment the server confirms the
// finish that unlocks it (while you're still on the pad).
useGame.subscribe((state, prev) => {
  const pad = state.pad
  if (typeof pad !== 'string' || !pad.startsWith('exit:') || state.travel) return
  if (pad === prev.pad && state.profile === prev.profile) return
  const id = pad.slice(5)
  if (isStageUnlocked(state.profile, id)) travelTo(id)
})

