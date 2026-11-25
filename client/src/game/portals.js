import { isStageUnlocked } from '@shared/logic'
import { STAGES } from '@shared/stages/index'

/**
 * Which map each lobby portal leads to (shared/lobby.js PORTALS): every map but the
 * one you're on, in registry order. One portal, two maps: from Sky Docks it leads to the
 * Grand Tour, from the Grand Tour back to Sky Docks.
 */
const cache = new Map()
export function portalStages(currentId) {
  let list = cache.get(currentId)
  if (!list) {
    list = STAGES.filter((s) => s.id !== currentId)
    cache.set(currentId, list)
  }
  return list
}

/** The registry entry portal `slot` leads to from map `currentId`, or null. */
export const portalStage = (currentId, slot) => portalStages(currentId)[slot] || null

/**
 * The maps the portals lead to from `currentId` that `profile` hasn't unlocked yet
 * (a chapter: shared/logic.js isStageUnlocked), as a key - ids joined by ',', '' when
 * all are open - so a store selector re-renders only when it changes.
 */
export const lockedPortalKey = (profile, currentId) =>
  portalStages(currentId)
    .filter((s) => !isStageUnlocked(profile, s.id))
    .map((s) => s.id)
    .join(',')
