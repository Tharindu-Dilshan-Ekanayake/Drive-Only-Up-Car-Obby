import { createElement, lazy } from 'react'

/**
 * Scenery generators by id (a map's `theme.scenery`, shared/stages/<map>.meta.js): each
 * is its own lazy chunk, loaded with the map, mounted with its stage (and unmounted -
 * disposing everything it made - when you travel). Props: `{ stage, info }`.
 *
 * Sky Docks: ./docks.jsx. The Grand Tour: ./grandTour.jsx, which mounts one sub-module per
 * zone (./grandTour/<zone>Zone.jsx), each building only round its own sections. Everything
 * a module draws must follow the perf contract (instanced/merged, preset-aware via
 * useQuality, distance-culled, disposed on unmount).
 */
const LOADERS = {
  docks: () => import('./docks'),
  grandTour: () => import('./grandTour'),
  heat: () => import('./heat'),
}
export const SCENERY = Object.fromEntries(Object.entries(LOADERS).map(([id, load]) => [id, lazy(load)]))

export const sceneryFor = (id) => SCENERY[id] || SCENERY.docks

/**
 * Starts fetching scenery module `id`'s chunk now (GameScene, while the pier loads), so
 * it isn't one more round trip after the stage world's. The lazy component reuses it.
 */
export const preloadScenery = (id) => (LOADERS[id] || LOADERS.docks)().catch(() => null)

/** Mounts map `info`'s scenery generator (its `theme.scenery`) for `stage`. Wrap in Suspense. */
export function StageScenery({ stage, info }) {
  return createElement(sceneryFor(info?.theme?.scenery), { stage, info })
}
